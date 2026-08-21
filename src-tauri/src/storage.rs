use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const DB_FILE: &str = "y-agent.db";
const KEY_RECORD_ID: &str = "jimeng_api_key";

pub struct Storage {
    pub conn: Mutex<Connection>,
    #[allow(dead_code)]
    pub app_dir: PathBuf,
}

impl Storage {
    pub fn open(app_dir: &Path) -> anyhow::Result<Self> {
        std::fs::create_dir_all(app_dir)?;
        let db_path = app_dir.join(DB_FILE);
        let conn = Connection::open(&db_path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        // SQLite 默认不启用外键约束，必须显式打开，否则 ON DELETE CASCADE 不会生效。
        conn.pragma_update(None, "foreign_keys", true)?;
        Self::migrate(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            app_dir: app_dir.to_path_buf(),
        })
    }

    fn migrate(conn: &Connection) -> anyhow::Result<()> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);

            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL UNIQUE,
                title TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user','agent')),
                content TEXT NOT NULL,
                attachments TEXT,
                skill_log TEXT,
                events TEXT,
                pending_plan TEXT,
                error TEXT,
                asset_ids TEXT,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_chat_messages_session
                ON chat_messages(session_id, created_at ASC);
            "#,
        )?;
        let _ = KEY_RECORD_ID;
        // assets 表 schema 演进（每次启动检查列，缺啥补啥）
        Self::ensure_assets_schema(conn)?;
        // projects 表 schema 演进（M2: 加 agent_context JSON 列）
        Self::ensure_projects_schema(conn)?;
        Ok(())
    }

    /// 渐进式迁移 projects 表。M2 引入 agent_context 列（JSON 字符串）。
    /// P1 引入 style_contract 列（项目级视觉契约，含 8 字符 checksum 字段）。
    fn ensure_projects_schema(conn: &Connection) -> anyhow::Result<()> {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='projects'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists == 0 {
            // 表还没建（首次启动），主 migrate 已建好了；这里跳过
            return Ok(());
        }
        let cols = Self::table_columns(conn, "projects")?;
        let additions: &[(&str, &str)] = &[
            ("agent_context", "TEXT"),
            ("style_contract", "TEXT"),
        ];
        for (name, decl) in additions {
            if !cols.iter().any(|c| c.eq_ignore_ascii_case(name)) {
                conn.execute(&format!("ALTER TABLE projects ADD COLUMN {name} {decl}"), [])?;
            }
        }
        Ok(())
    }

    /// 渐进式迁移 assets 表。每次启动扫描列，缺啥 ALTER TABLE ADD COLUMN。
    /// 早期版本可能只有旧 schema (id, project_id, kind, urls, prompt, model, meta, created_at)。
    fn ensure_assets_schema(conn: &Connection) -> anyhow::Result<()> {
        // 1. 表不存在则建当前完整版
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='assets'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists == 0 {
            conn.execute_batch(
                r#"
                CREATE TABLE assets (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    model TEXT NOT NULL,
                    model_name TEXT,
                    size TEXT,
                    ref_count INTEGER NOT NULL DEFAULT 0,
                    cost_ms INTEGER NOT NULL DEFAULT 0,
                    is_layer_decomposition INTEGER NOT NULL DEFAULT 0,
                    payload TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
                );
                CREATE INDEX idx_assets_project ON assets(project_id, created_at DESC);
                "#,
            )?;
            return Ok(());
        }

        // 2. 表已存在，渐进加列
        let cols = Self::table_columns(conn, "assets")?;
        let additions: &[(&str, &str)] = &[
            ("model_name", "TEXT"),
            ("size", "TEXT"),
            ("ref_count", "INTEGER NOT NULL DEFAULT 0"),
            ("cost_ms", "INTEGER NOT NULL DEFAULT 0"),
            ("is_layer_decomposition", "INTEGER NOT NULL DEFAULT 0"),
            ("payload", "TEXT"),
        ];
        for (name, decl) in additions {
            if !cols.iter().any(|c| c.eq_ignore_ascii_case(name)) {
                conn.execute(&format!("ALTER TABLE assets ADD COLUMN {name} {decl}"), [])?;
            }
        }
        // payload 旧表可能 NULL（旧 schema 没有这列），SQLite 新加列允许 NULL
        // 但我们代码里读成 String，NOT NULL 旧行会变 NULL → serde_json::from_str("null") 拿到 Value::Null，安全

        // 2a. 如果是从 M0 旧表升级，尽量把旧 urls 列迁移到 payload 再删旧列。
        if cols.iter().any(|c| c.eq_ignore_ascii_case("urls")) {
            conn.execute(
                "UPDATE assets SET payload = json_object('urls', json(urls))
                 WHERE payload IS NULL AND urls IS NOT NULL AND json_valid(urls)",
                [],
            )?;
        }

        // 2b. 清理 M0 时代的旧列（kind/urls/meta，已被 payload 取代）
        // 需要 SQLite 3.35+ 支持 DROP COLUMN（libsqlite3-sys 0.30 默认 3.4x，远超 3.35）
        for old_col in ["kind", "urls", "meta"] {
            if cols.iter().any(|c| c.eq_ignore_ascii_case(old_col)) {
                if let Err(e) = conn.execute(&format!("ALTER TABLE assets DROP COLUMN {old_col}"), []) {
                    log::warn!("DROP COLUMN {old_col} 失败（可能 SQLite 版本 < 3.35）：{e}");
                }
            }
        }

        // 3. 索引补建
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id, created_at DESC)",
            [],
        )?;
        Ok(())
    }

    fn table_columns(conn: &Connection, table: &str) -> anyhow::Result<Vec<String>> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(1))?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn put_kv(&self, key: &str, value: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("storage mutex poisoned: {e}"))?;
        conn.execute(
            "INSERT INTO kv(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_kv(&self, key: &str) -> anyhow::Result<Option<String>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("storage mutex poisoned: {e}"))?;
        let mut stmt = conn.prepare("SELECT value FROM kv WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn delete_kv(&self, key: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("storage mutex poisoned: {e}"))?;
        conn.execute("DELETE FROM kv WHERE key = ?1", params![key])?;
        Ok(())
    }

    // ---------- Agent LLM Config (M2 v0.2) ----------

    /// 读 Agent LLM 配置（JSON 字符串）。未设置返回 Ok(None)。
    /// schema: { provider: "deepseek"|"doubao"|"openai"|"custom", apiKey, endpoint, model }
    pub fn get_agent_llm(&self) -> anyhow::Result<Option<String>> {
        self.get_kv("agent_llm")
    }

    /// 写 Agent LLM 配置（JSON 字符串）。
    pub fn set_agent_llm(&self, json: &str) -> anyhow::Result<()> {
        self.put_kv("agent_llm", json)
    }

    pub fn delete_agent_llm(&self) -> anyhow::Result<()> {
        self.delete_kv("agent_llm")
    }

    // ---------- Project agent_context (M2) ----------

    /// 读项目 agent_context（JSON 字符串）。未设置返回 Ok(None)。
    pub fn get_project_agent_context(&self, project_id: &str) -> anyhow::Result<Option<String>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("storage mutex poisoned: {e}"))?;
        let mut stmt = conn.prepare("SELECT agent_context FROM projects WHERE id = ?1")?;
        let mut rows = stmt.query(params![project_id])?;
        if let Some(row) = rows.next()? {
            let v: Option<String> = row.get(0)?;
            Ok(v)
        } else {
            Ok(None)
        }
    }

    /// 写项目 agent_context（必须是 JSON 字符串）。空字符串 = 清除。
    pub fn set_project_agent_context(
        &self,
        project_id: &str,
        json: &str,
    ) -> anyhow::Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("storage mutex poisoned: {e}"))?;
        let changed = conn.execute(
            "UPDATE projects SET agent_context = ?1, updated_at = ?2 WHERE id = ?3",
            params![json, chrono::Utc::now().timestamp_millis(), project_id],
        )?;
        if changed == 0 {
            anyhow::bail!("项目不存在：{project_id}");
        }
        Ok(())
    }

    // ---------- Project style_contract (P1) ----------

    /// 读项目 style_contract（JSON 字符串）。未设置返回 Ok(None)。
    pub fn get_project_style_contract(&self, project_id: &str) -> anyhow::Result<Option<String>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("storage mutex poisoned: {e}"))?;
        let mut stmt = conn.prepare("SELECT style_contract FROM projects WHERE id = ?1")?;
        let mut rows = stmt.query(params![project_id])?;
        if let Some(row) = rows.next()? {
            let v: Option<String> = row.get(0)?;
            Ok(v)
        } else {
            Ok(None)
        }
    }

    /// 写项目 style_contract（JSON 字符串）。
    /// 同时：若新 checksum 与旧不同 → 把所有旧 checksum 的资产 payload 标 stale。
    /// 空字符串 = 清除契约。
    pub fn set_project_style_contract(
        &self,
        project_id: &str,
        json: &str,
    ) -> anyhow::Result<MarkStaleResult> {
        let mut conn = self.conn.lock().map_err(|e| anyhow::anyhow!("storage mutex poisoned: {e}"))?;
        let tx = conn.transaction()?;

        // 1. 读旧契约
        let old_json: Option<String> = tx
            .query_row(
                "SELECT style_contract FROM projects WHERE id = ?1",
                params![project_id],
                |r| r.get(0),
            )
            .ok();
        let old_checksum = old_json
            .as_deref()
            .and_then(|s| extract_checksum(s))
            .unwrap_or_default();
        let new_checksum = extract_checksum(json).unwrap_or_default();

        // 2. 写新契约
        let now = chrono::Utc::now().timestamp_millis();
        let changed = tx.execute(
            "UPDATE projects SET style_contract = ?1, updated_at = ?2 WHERE id = ?3",
            params![json, now, project_id],
        )?;
        if changed == 0 {
            anyhow::bail!("项目不存在：{project_id}");
        }

        // 3. 标记 stale：旧 checksum 非空 + 新 checksum 与旧不同 → 扫所有同 checksum 的资产
        let mut marked: u64 = 0;
        if !old_checksum.is_empty() && old_checksum != new_checksum {
            // SQLite JSON 操作：json_extract(payload, '$.styleContractId') = old_checksum
            marked = tx.execute(
                "UPDATE assets
                 SET payload = json_set(payload, '$.status', 'stale')
                 WHERE project_id = ?1
                   AND json_extract(payload, '$.styleContractId') = ?2
                   AND json_extract(payload, '$.status') IS NOT 'stale'",
                params![project_id, old_checksum],
            )? as u64;
        }

        tx.commit()?;
        Ok(MarkStaleResult { marked })
    }

    // ---------- Chat History (M2 v0.3) ----------

    // ---------- Chat History (M2 v0.3) ----------
    // v0.1 设计：每个项目一个 chat_session，多轮对话历史
    // messages 存结构化 JSON（skill_log / events / pending_plan / asset_ids 等）

    /// 获取或创建项目对应的 chat_session（v0.1: 一个项目一个 session）
    pub fn get_or_create_chat_session(
        &self,
        project_id: &str,
    ) -> anyhow::Result<String> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("storage mutex poisoned: {e}"))?;
        let mut stmt = conn.prepare("SELECT id FROM chat_sessions WHERE project_id = ?1")?;
        let mut rows = stmt.query(params![project_id])?;
        if let Some(row) = rows.next()? {
            return Ok(row.get(0)?);
        }
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            "INSERT INTO chat_sessions(id, project_id, title, created_at, updated_at) VALUES(?1, ?2, ?3, ?4, ?4)",
            params![id, project_id, "对话历史", now],
        )?;
        Ok(id)
    }

    /// 列出某 session 的所有消息（按 created_at 升序），返回 JSON 字符串数组
    pub fn list_chat_messages(&self, session_id: &str) -> anyhow::Result<Vec<String>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("storage mutex poisoned: {e}"))?;
        let mut stmt = conn.prepare(
            "SELECT id, role, content, attachments, skill_log, events,
                    pending_plan, error, asset_ids, created_at
             FROM chat_messages WHERE session_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            let attachments_str: Option<String> = row.get(3)?;
            let skill_log_str: Option<String> = row.get(4)?;
            let events_str: Option<String> = row.get(5)?;
            let pending_plan_str: Option<String> = row.get(6)?;
            let error_str: Option<String> = row.get(7)?;
            let asset_ids_str: Option<String> = row.get(8)?;
            let created_at: i64 = row.get(9)?;
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "role": row.get::<_, String>(1)?,
                "content": row.get::<_, String>(2)?,
                "attachments": attachments_str.and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                "skillLog": skill_log_str.and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                "events": events_str.and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                "pendingPlan": pending_plan_str.and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                "error": error_str,
                "assetIds": asset_ids_str.and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok()).unwrap_or_default(),
                "createdAt": created_at,
            }).to_string())
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// 插入一条消息，返回消息 id
    /// `id`：可选自定义 id（前端想保持 in-memory id 与 DB id 一致时传），None 则后端生成 UUID
    pub fn insert_chat_message(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
        attachments: Option<&str>,
        skill_log: Option<&str>,
        events: Option<&str>,
        pending_plan: Option<&str>,
        error: Option<&str>,
        asset_ids: Option<&str>,
        id: Option<&str>,
    ) -> anyhow::Result<String> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("storage mutex poisoned: {e}"))?;
        // 前端传过来的 id 优先；没传才用 UUID
        let id_owned = id
            .map(|s| s.to_string())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            "INSERT INTO chat_messages(id, session_id, role, content, attachments, skill_log, events,
                                       pending_plan, error, asset_ids, created_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![id_owned, session_id, role, content, attachments, skill_log, events,
                    pending_plan, error, asset_ids, now],
        )?;
        // 更新 session 的 updated_at
        conn.execute(
            "UPDATE chat_sessions SET updated_at = ?1 WHERE id = ?2",
            params![now, session_id],
        )?;
        Ok(id_owned)
    }

    /// 更新消息（部分字段）
    /// 所有可选字段：传 Some(v) = 更新；空字符串 = 清空
    pub fn update_chat_message(
        &self,
        message_id: &str,
        content: Option<&str>,
        skill_log: Option<&str>,
        events: Option<&str>,
        pending_plan: Option<&str>,
        error: Option<&str>,
        asset_ids: Option<&str>,
    ) -> anyhow::Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("storage mutex poisoned: {e}"))?;
        let mut sets: Vec<&str> = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        if let Some(v) = content { sets.push("content = ?"); values.push(Box::new(v.to_string())); }
        if let Some(v) = skill_log { sets.push("skill_log = ?"); values.push(Box::new(v.to_string())); }
        if let Some(v) = events { sets.push("events = ?"); values.push(Box::new(v.to_string())); }
        if let Some(v) = pending_plan { sets.push("pending_plan = ?"); values.push(Box::new(v.to_string())); }
        if let Some(v) = error { sets.push("error = ?"); values.push(Box::new(v.to_string())); }
        if let Some(v) = asset_ids { sets.push("asset_ids = ?"); values.push(Box::new(v.to_string())); }
        if sets.is_empty() {
            return Ok(());
        }
        let sql = format!("UPDATE chat_messages SET {} WHERE id = ?", sets.join(", "));
        let mut all: Vec<Box<dyn rusqlite::ToSql>> = values;
        all.push(Box::new(message_id.to_string()));
        let params_refs: Vec<&dyn rusqlite::ToSql> = all.iter().map(|b| b.as_ref()).collect();
        let changed = conn.execute(&sql, params_refs.as_slice())?;
        if changed == 0 {
            anyhow::bail!("消息不存在：{message_id}");
        }
        Ok(())
    }

    /// 删除单条消息
    pub fn delete_chat_message(&self, message_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("storage mutex poisoned: {e}"))?;
        conn.execute("DELETE FROM chat_messages WHERE id = ?1", params![message_id])?;
        Ok(())
    }

    /// 清空某 session 的所有消息
    pub fn clear_chat_session(&self, session_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("storage mutex poisoned: {e}"))?;
        conn.execute("DELETE FROM chat_messages WHERE session_id = ?1", params![session_id])?;
        conn.execute(
            "UPDATE chat_sessions SET updated_at = ?1 WHERE id = ?2",
            params![chrono::Utc::now().timestamp_millis(), session_id],
        )?;
        Ok(())
    }
}

/// 写 style_contract 后返回的"被标 stale 的资产数"统计。
/// 前端用来弹个 toast："契约已更新，N 张资产已标记为风格漂移"。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MarkStaleResult {
    pub marked: u64,
}

/// 从契约 JSON 字符串里抽 `checksum` 字段。
/// 失败返回 None（视为"无 checksum"）。
fn extract_checksum(json: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(json)
        .ok()
        .and_then(|v| v.get("checksum").and_then(|c| c.as_str().map(String::from)))
}
