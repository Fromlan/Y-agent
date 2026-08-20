use crate::jimeng::{self, GenerateImageParams, GeneratedImage};
use crate::state::AppState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;
use tauri::State;

const KEY_KV: &str = "jimeng_api_key";

fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ---------- API Key ----------

#[tauri::command]
pub fn get_api_key(state: State<'_, Mutex<AppState>>) -> Result<Option<String>, String> {
    let s = state.lock().map_err(map_err)?;
    let enc = s.storage.get_kv(KEY_KV).map_err(map_err)?;
    match enc {
        Some(e) => s.cipher.decrypt(&e).map(Some).map_err(map_err),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn set_api_key(key: String, state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let s = state.lock().map_err(map_err)?;
    let enc = s.cipher.encrypt(&key).map_err(map_err)?;
    s.storage.put_kv(KEY_KV, &enc).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn clear_api_key(state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let s = state.lock().map_err(map_err)?;
    s.storage.delete_kv(KEY_KV).map_err(map_err)?;
    Ok(())
}

// ---------- Generate ----------

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsGenerateParams {
    pub model: String,
    pub prompt: String,
    #[serde(default)]
    pub image: Option<Vec<String>>,
    #[serde(default)]
    pub size: Option<String>,
    #[serde(default)]
    pub sequential: Option<String>,
    #[serde(default)]
    pub max_images: Option<u32>,
    #[serde(default)]
    pub layer_decomposition: Option<bool>,
    /// 是否加 "AI生成" 水印。None = 走 Y-agent 默认（不加）。
    /// Seedream API 默认 true，Y-agent 显式补 false 关闭。
    #[serde(default)]
    pub watermark: Option<bool>,
    /// 输出文件格式：png | jpeg。仅 5.0 Pro / 5.0 Lite 支持；
    /// 4.5 / 4.0 固定 jpeg，由 Rust 端 validate_params 拦截。
    #[serde(default)]
    pub output_format: Option<String>,
    /// 工具调用。当前仅支持 web_search（5.0 Lite 专属）。
    /// 前端传 `["web_search"]` → Rust 端序列化为 `[{type:"web_search"}]`。
    #[serde(default)]
    pub tools: Option<Vec<String>>,
    /// 提示词优化模式：standard | fast。fast 仅 5.0 Pro / 4.0 支持。
    #[serde(default)]
    pub optimize_prompt_mode: Option<String>,
    /// 背景透明：transparent | opaque。仅 5.0 Pro 专属。
    #[serde(default)]
    pub background: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsGenerateResponse {
    pub images: Vec<GeneratedImage>,
    pub is_demo: bool,
    /// API 顶层 usage（生成张数 / token / 工具调用次数等）。
    /// Rust 端透传，前端可选做用量统计。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<jimeng::Usage>,
    /// API 顶层 error（整个请求都没生成图时）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<jimeng::ApiError>,
}

#[tauri::command]
pub async fn jimeng_generate(
    params: JsGenerateParams,
    state: State<'_, Mutex<AppState>>,
) -> Result<JsGenerateResponse, String> {
    let (api_key, p) = {
        let s = state.lock().map_err(map_err)?;
        let enc = s.storage.get_kv(KEY_KV).map_err(map_err)?;
        let key = enc
            .ok_or_else(|| "API Key 未设置".to_string())
            .and_then(|e| s.cipher.decrypt(&e).map_err(map_err))?;
        (
            key,
            GenerateImageParams {
                model: params.model,
                prompt: params.prompt,
                image: params.image,
                size: params.size,
                sequential_image_generation: params.sequential,
                sequential_image_generation_options: params
                    .max_images
                    .map(|n| jimeng::SequentialOptions { max_images: n }),
                response_format: Some("url".to_string()),
                layer_decomposition: params.layer_decomposition,
                watermark: params.watermark,
                output_format: params.output_format,
                tools: params
                    .tools
                    .map(|v| v.into_iter().map(|t| jimeng::ToolSpec { kind: t }).collect()),
                optimize_prompt_options: params
                    .optimize_prompt_mode
                    .map(|m| jimeng::OptimizePromptOptions { mode: Some(m) }),
                background: params.background,
            },
        )
    };

    let result = jimeng::generate(&api_key, p).await.map_err(map_err)?;
    Ok(JsGenerateResponse {
        images: result.images,
        is_demo: result.is_demo,
        usage: result.usage,
        error: result.error.map(|e| jimeng::ApiError {
            code: e.code,
            message: e.message,
        }),
    })
}

// ---------- Projects ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsProject {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub asset_count: i64,
}

#[tauri::command]
pub fn list_projects(state: State<'_, Mutex<AppState>>) -> Result<Vec<JsProject>, String> {
    let s = state.lock().map_err(map_err)?;
    let conn = s.storage.conn.lock().map_err(map_err)?;
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.name, p.created_at, p.updated_at,
                    (SELECT COUNT(*) FROM assets a WHERE a.project_id = p.id) AS asset_count
             FROM projects p ORDER BY p.updated_at DESC",
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(JsProject {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                asset_count: row.get(4)?,
            })
        })
        .map_err(map_err)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(map_err)?);
    }
    Ok(out)
}

#[tauri::command]
pub fn create_project(name: String, state: State<'_, Mutex<AppState>>) -> Result<JsProject, String> {
    let s = state.lock().map_err(map_err)?;
    let conn = s.storage.conn.lock().map_err(map_err)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO projects(id, name, created_at, updated_at) VALUES(?1, ?2, ?3, ?3)",
        params![id, name, now],
    )
    .map_err(map_err)?;
    Ok(JsProject {
        id,
        name,
        created_at: now,
        updated_at: now,
        asset_count: 0,
    })
}

#[tauri::command]
pub fn delete_project(id: String, state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let s = state.lock().map_err(map_err)?;
    let conn = s.storage.conn.lock().map_err(map_err)?;
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])
        .map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn rename_project(
    id: String,
    name: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<JsProject, String> {
    let s = state.lock().map_err(map_err)?;
    let conn = s.storage.conn.lock().map_err(map_err)?;
    let now = chrono::Utc::now().timestamp_millis();
    let changed = conn
        .execute(
            "UPDATE projects SET name=?1, updated_at=?2 WHERE id=?3",
            params![name, now, id],
        )
        .map_err(map_err)?;
    if changed == 0 {
        return Err(format!("项目不存在：{id}"));
    }
    let project = conn
        .query_row(
            "SELECT p.id, p.name, p.created_at, p.updated_at,
                    (SELECT COUNT(*) FROM assets a WHERE a.project_id = p.id) AS asset_count
             FROM projects p WHERE p.id = ?1",
            params![id],
            |row| {
                Ok(JsProject {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                    asset_count: row.get(4)?,
                })
            },
        )
        .map_err(map_err)?;
    Ok(project)
}

// ---------- Assets ----------

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsCreateAssetParams {
    pub project_id: String,
    pub prompt: String,
    pub model: String,
    pub model_name: String,
    pub size: String,
    pub ref_count: u32,
    pub cost_ms: u64,
    pub is_layer_decomposition: bool,
    /// 完整 payload（包含 urls、layers 等）
    pub payload: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsAsset {
    pub id: String,
    pub project_id: String,
    pub prompt: String,
    pub model: String,
    pub model_name: String,
    pub size: String,
    pub ref_count: u32,
    pub cost_ms: u64,
    pub is_layer_decomposition: bool,
    pub payload: Value,
    pub created_at: i64,
}

fn row_to_asset(row: &rusqlite::Row<'_>) -> rusqlite::Result<JsAsset> {
    // 旧版本行可能没有 model_name / size / payload（迁移时新列允许为 NULL），这里统一容错。
    let payload_str: Option<String> = row.get(9)?;
    let payload: Value = payload_str
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null);
    let model_name: Option<String> = row.get(4)?;
    let size: Option<String> = row.get(5)?;
    let ref_count: i64 = row.get(6)?;
    let cost_ms: i64 = row.get(7)?;
    let is_layer: i64 = row.get(8)?;
    Ok(JsAsset {
        id: row.get(0)?,
        project_id: row.get(1)?,
        prompt: row.get(2)?,
        model: row.get(3)?,
        model_name: model_name.unwrap_or_default(),
        size: size.unwrap_or_default(),
        ref_count: ref_count as u32,
        cost_ms: cost_ms as u64,
        is_layer_decomposition: is_layer != 0,
        payload,
        created_at: row.get(10)?,
    })
}

#[tauri::command]
pub fn create_asset(
    params: JsCreateAssetParams,
    state: State<'_, Mutex<AppState>>,
) -> Result<JsAsset, String> {
    let s = state.lock().map_err(map_err)?;
    let conn = s.storage.conn.lock().map_err(map_err)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let payload_str = serde_json::to_string(&params.payload).map_err(map_err)?;
    conn.execute(
        "INSERT INTO assets(id, project_id, prompt, model, model_name, size,
                            ref_count, cost_ms, is_layer_decomposition, payload, created_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            id,
            params.project_id,
            params.prompt,
            params.model,
            params.model_name,
            params.size,
            params.ref_count as i64,
            params.cost_ms as i64,
            if params.is_layer_decomposition { 1i64 } else { 0i64 },
            payload_str,
            now,
        ],
    )
    .map_err(map_err)?;

    conn.execute(
        "UPDATE projects SET updated_at=?1 WHERE id=?2",
        params![now, params.project_id],
    )
    .map_err(map_err)?;

    Ok(JsAsset {
        id,
        project_id: params.project_id,
        prompt: params.prompt,
        model: params.model,
        model_name: params.model_name,
        size: params.size,
        ref_count: params.ref_count,
        cost_ms: params.cost_ms,
        is_layer_decomposition: params.is_layer_decomposition,
        payload: params.payload,
        created_at: now,
    })
}

#[tauri::command]
pub fn list_assets(
    project_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<JsAsset>, String> {
    let s = state.lock().map_err(map_err)?;
    let conn = s.storage.conn.lock().map_err(map_err)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, prompt, model, model_name, size,
                    ref_count, cost_ms, is_layer_decomposition, payload, created_at
             FROM assets WHERE project_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![project_id], row_to_asset)
        .map_err(map_err)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(map_err)?);
    }
    Ok(out)
}

#[tauri::command]
pub fn delete_asset(id: String, state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let s = state.lock().map_err(map_err)?;
    let conn = s.storage.conn.lock().map_err(map_err)?;
    conn.execute("DELETE FROM assets WHERE id = ?1", params![id])
        .map_err(map_err)?;
    Ok(())
}

// ---------- Preferences (KV) ----------

/// 通用 KV 偏好。前端用同一个 command 读写 default model / size 等。
/// value 必须是字符串。
#[tauri::command]
pub fn get_pref(
    key: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Option<String>, String> {
    let s = state.lock().map_err(map_err)?;
    s.storage.get_kv(&key).map_err(map_err)
}

#[tauri::command]
pub fn set_pref(
    key: String,
    value: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let s = state.lock().map_err(map_err)?;
    s.storage.put_kv(&key, &value).map_err(map_err)
}

// 给前端构建完整错误消息（参考 doc/api-integration-notes.md 错误码表）
#[tauri::command]
pub fn explain_error(raw: String) -> String {
    let lower = raw.to_lowercase();
    let hint = if lower.contains("invalidendpointormodel.notfound") || lower.contains("\"code\":\"notfound\"") {
        "模型 ID 不存在或账号未开通。在 [火山方舟控制台](https://console.volcengine.com/ark/region:cn-beijing/openManagement) 检查模型详情。"
    } else if raw.contains("5.0 Pro 不支持组图") {
        "5.0 Pro 不支持组图（sequential_image_generation），请改用 5.0 Lite / 4.5 / 4.0，或去掉「数量」参数。"
    } else if raw.contains("仅支持 jpeg 输出") {
        "该模型（4.5/4.0）仅支持 jpeg 输出。去掉「PNG」开关，或改用 5.0 Pro / 5.0 Lite。"
    } else if raw.contains("fast 仅 5.0 Pro / 4.0 支持") {
        "fast 极速模式仅 5.0 Pro / 4.0 支持。当前模型不支持，关掉「极速模式」开关再试。"
    } else if lower.contains("internalserviceerror") {
        "服务端内部错误（通常 5xx）。重试一次，或等几分钟后回来。"
    } else if lower.contains("invalidparameter") {
        "参数错误。常见原因：size 写了大写（应是 `2k` 不是 `2K`）；或单图请求去掉了 `sequential_image_generation` 字段；或图层拆分场景误传 `output_format: jpeg`。"
    } else if lower.contains("authentication") {
        "API Key 无效或已过期。打开设置重新填写。"
    } else if lower.contains("accessdenied") {
        "权限不足。当前 API Key 子账号未获得该模型权限，请用主账号在控制台授权。"
    } else if lower.contains("throttling") {
        "触发限流（IPM 500 张/分）。等几秒再试，或减少单次数量。"
    } else if raw.contains("API Key 未设置") {
        "尚未配置 API Key。点击左下角「设置」齿轮填入即梦 API Key，或先试用 Demo 模式。"
    } else {
        ""
    };
    if hint.is_empty() {
        raw
    } else {
        format!("{raw}\n\n💡 {hint}")
    }
}

// ---------- Project agent_context (M2) ----------

/// 读项目 agent_context（JSON 字符串）。未设置返回 None。
#[tauri::command]
pub fn agent_context_get(
    project_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Option<String>, String> {
    let s = state.lock().map_err(map_err)?;
    s.storage
        .get_project_agent_context(&project_id)
        .map_err(map_err)
}

/// 写项目 agent_context（必须是 JSON 字符串）。空字符串 = 清除。
#[tauri::command]
pub fn agent_context_update(
    project_id: String,
    json: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let s = state.lock().map_err(map_err)?;
    s.storage
        .set_project_agent_context(&project_id, &json)
        .map_err(map_err)
}

// ---------- Agent LLM Config (M2 v0.2) ----------

/// 读 Agent LLM 配置。未设置返回 None。
#[tauri::command]
pub fn agent_llm_get(state: State<'_, Mutex<AppState>>) -> Result<Option<String>, String> {
    let s = state.lock().map_err(map_err)?;
    s.storage.get_agent_llm().map_err(map_err)
}

/// 写 Agent LLM 配置（JSON 字符串）。
#[tauri::command]
pub fn agent_llm_update(
    json: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let s = state.lock().map_err(map_err)?;
    s.storage.set_agent_llm(&json).map_err(map_err)
}

/// 清除 Agent LLM 配置。
#[tauri::command]
pub fn agent_llm_clear(state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let s = state.lock().map_err(map_err)?;
    s.storage.delete_agent_llm().map_err(map_err)
}

// ---------- Chat History (M2 v0.3) ----------

/// 获取或创建项目对应的 chat_session id。
#[tauri::command]
pub fn chat_session_get_or_create(
    project_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    let s = state.lock().map_err(map_err)?;
    s.storage
        .get_or_create_chat_session(&project_id)
        .map_err(map_err)
}

/// 列出某 session 的所有消息（JSON 字符串数组，按 created_at 升序）。
#[tauri::command]
pub fn chat_message_list(
    session_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<String>, String> {
    let s = state.lock().map_err(map_err)?;
    s.storage
        .list_chat_messages(&session_id)
        .map_err(map_err)
}

/// 插入一条消息，返回消息 id。
/// `id` 可选：传了就用传入的（前端要保持 in-memory id 与 DB id 一致，否则 update 会找不到行）；
/// 不传则后端生成 UUID。
#[tauri::command]
pub fn chat_message_insert(
    session_id: String,
    role: String,
    content: String,
    attachments: Option<String>,
    skill_log: Option<String>,
    events: Option<String>,
    pending_plan: Option<String>,
    error: Option<String>,
    asset_ids: Option<String>,
    id: Option<String>,
    state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    let s = state.lock().map_err(map_err)?;
    s.storage
        .insert_chat_message(
            &session_id,
            &role,
            &content,
            attachments.as_deref(),
            skill_log.as_deref(),
            events.as_deref(),
            pending_plan.as_deref(),
            error.as_deref(),
            asset_ids.as_deref(),
            id.as_deref(),
        )
        .map_err(map_err)
}

/// 更新消息（部分字段）。
#[tauri::command]
pub fn chat_message_update(
    message_id: String,
    content: Option<String>,
    skill_log: Option<String>,
    events: Option<String>,
    pending_plan: Option<String>,
    error: Option<String>,
    asset_ids: Option<String>,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let s = state.lock().map_err(map_err)?;
    s.storage
        .update_chat_message(
            &message_id,
            content.as_deref(),
            skill_log.as_deref(),
            events.as_deref(),
            pending_plan.as_deref(),
            error.as_deref(),
            asset_ids.as_deref(),
        )
        .map_err(map_err)
}

/// 删除单条消息。
#[tauri::command]
pub fn chat_message_delete(
    message_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let s = state.lock().map_err(map_err)?;
    s.storage.delete_chat_message(&message_id).map_err(map_err)
}

/// 清空 session 所有消息。
#[tauri::command]
pub fn chat_session_clear(
    session_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let s = state.lock().map_err(map_err)?;
    s.storage.clear_chat_session(&session_id).map_err(map_err)
}
