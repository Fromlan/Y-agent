use crate::jimeng::{self, GenerateImageParams, GeneratedImage};
use crate::state::AppState;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

const KEY_KV: &str = "jimeng_api_key";
/// 资产本地兜底完成事件。Rust 端在 `payload.localPaths` 写库成功后 emit,
/// 前端按 assetId 增量更新 in-memory asset 状态,避免整板 re-render。
pub const ASSET_LOCAL_BACKFILLED_EVENT: &str = "assets://local-backfilled";

fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// 把 image[] 数组里所有 "本应用可读" 的 URL 转成 dataURL：
/// - `http://asset.localhost/<encoded-path>` → 从 app_data_dir/assets 解出绝对路径，读字节，转 data URL
/// - `asset://localhost/<encoded-path>` → 同上
/// - `https://...` / `http://...`（非 asset 域名）→ 保留原样（外部 URL，火山方舟直接 fetch）
/// - `data:image/...;base64,...` → 保留原样
/// - 空字符串 / 其它 → 保留原样
///
/// 解决前端 "ToolsTab / 局部编辑" 把 localPath 通过 `image-resolver` 转成
/// `http://asset.localhost/...` 后，jimeng 服务端在公网 fetch 不到
/// （错误: dial tcp [::1]:80: connect: connection refused）的问题。
fn resolve_local_image_urls(images: Vec<String>, app: &AppHandle) -> Vec<String> {
    let assets_root = match app.path().app_data_dir() {
        Ok(d) => d.join("assets"),
        Err(_) => return images,
    };
    let canonical_assets = assets_root
        .canonicalize()
        .unwrap_or_else(|_| assets_root.clone());

    images
        .into_iter()
        .map(|url| {
            // 1) data: / 空字符串 / 其它：原样
            if url.is_empty() || url.starts_with("data:") {
                return url;
            }
            // 2) 只处理 asset 协议，外部 https URL 保留
            let encoded = if let Some(rest) = url.strip_prefix("http://asset.localhost/") {
                rest
            } else if let Some(rest) = url.strip_prefix("https://asset.localhost/") {
                rest
            } else if let Some(rest) = url.strip_prefix("asset://localhost/") {
                rest
            } else if let Some(rest) = url.strip_prefix("asset://") {
                rest
            } else {
                return url;
            };
            // 3) URL decode（路径分隔符、空格、中文等）
            let decoded = match url_decode(encoded) {
                Ok(s) => s,
                Err(_) => return url,
            };
            let p = std::path::PathBuf::from(&decoded);
            // 4) 必须在 app_data_dir/assets 下（防越权）
            let canonical = match p.canonicalize() {
                Ok(c) => c,
                Err(_) => return url,
            };
            if !canonical.starts_with(&canonical_assets) {
                return url;
            }
            // 5) 读字节，按 magic bytes 推断 MIME
            let bytes = match std::fs::read(&canonical) {
                Ok(b) => b,
                Err(_) => return url,
            };
            let mime = match infer_mime(&bytes, &canonical) {
                Some(m) => m,
                None => return url,
            };
            format!("data:{};base64,{}", mime, B64.encode(&bytes))
        })
        .collect()
}

/// 极简 URL-decode（只处理 %XX，其它原样）。失败返回 Err 让调用方保留原 URL。
fn url_decode(s: &str) -> Result<String, String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = hex_val(bytes[i + 1]);
            let lo = hex_val(bytes[i + 2]);
            match (hi, lo) {
                (Some(h), Some(l)) => {
                    out.push((h << 4) | l);
                    i += 3;
                }
                _ => {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|e| format!("url decode utf8: {e}"))
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// 按 magic bytes 推断图片 MIME。和 read_image_data_url 共用同一套规则。
fn infer_mime(bytes: &[u8], path: &Path) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else {
        // SVG / XML 文本头
        let head = bytes
            .iter()
            .take_while(|b| b.is_ascii_whitespace())
            .count();
        if head < bytes.len()
            && (bytes[head..].starts_with(b"<?xml") || bytes[head..].starts_with(b"<svg"))
        {
            Some("image/svg+xml")
        } else {
            // 扩展名兜底
            let ext = path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("png")
                .to_lowercase();
            Some(match ext.as_str() {
                "jpg" | "jpeg" => "image/jpeg",
                "webp" => "image/webp",
                "gif" => "image/gif",
                "svg" => "image/svg+xml",
                _ => "image/png",
            })
        }
    }
}

/// 资产本地兜底完成事件 payload(camelCase 序列化给前端)。
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AssetLocalBackfilled {
    pub asset_id: String,
    pub project_id: String,
    /// urls 模式的 localPaths(可空:layers 模式资产不会带)
    pub local_paths: Option<Vec<String>>,
    /// layers 模式的 layerLocalPaths
    pub layer_local_paths: Option<Vec<String>>,
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
    app: AppHandle,
) -> Result<JsGenerateResponse, String> {
    // P5+：把前端传来的 http://asset.localhost/... 类型的本地资产 URL
    // 转成 dataURL，jimeng 公网 API 才能 fetch（修复
    // "ToolsTab / 局部编辑 / 图层拆分" 报 dial tcp [::1]:80 connection refused）
    let resolved_images = resolve_local_image_urls(params.image.unwrap_or_default(), &app);
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
                image: if resolved_images.is_empty() {
                    None
                } else {
                    Some(resolved_images)
                },
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

    // P5：把外链 URL 全部下载到本地 cache（24h 失效兜底）
    // 用 batch_id 把这次生成的所有图放到同一目录
    let batch_id = uuid::Uuid::new_v4().to_string();
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(map_err)?
        .join("assets");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("reqwest client build failed: {e}"))?;
    let mut images = result.images;
    for (i, img) in images.iter_mut().enumerate() {
        if let Some(p) = jimeng::download_to_cache(&client, &img.url, &cache_dir, &batch_id, i).await {
            img.local_path = Some(p.to_string_lossy().to_string());
        }
    }

    Ok(JsGenerateResponse {
        images,
        is_demo: result.is_demo,
        usage: result.usage,
        error: result.error.map(|e| jimeng::ApiError {
            code: e.code,
            message: e.message,
        }),
    })
}

// ---------- P1: 流式生成 ----------

/// 启动一次流式生图，立即返回 request_id。后台 task 通过 Tauri event
/// `jimeng://stream` 持续推 StreamEvent，payload 里的 request_id 用来匹配本次请求。
///
/// 流事件类型（payload.type）：
/// - partial_image     → URL 单图完成
/// - partial_image_b64 → b64 单图完成
/// - partial_failed    → 单图失败
/// - completed         → 全部完成（带 usage）
/// - aborted           → 流中断（InternalServiceError / 网络断开 / 顶层 error）
#[tauri::command]
pub async fn jimeng_generate_stream(
    params: JsGenerateParams,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<String, String> {
    // P5+：把前端传来的 http://asset.localhost/... 本地资产 URL 转成 dataURL
    // （同 jimeng_generate 注释）
    let resolved_images = resolve_local_image_urls(params.image.unwrap_or_default(), &app);
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
                image: if resolved_images.is_empty() {
                    None
                } else {
                    Some(resolved_images)
                },
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

    let request_id = uuid::Uuid::new_v4().to_string();
    let app_for_emit = app.clone();
    let rid_for_task = request_id.clone();
    // P5：本地缓存目录（按 request_id 隔离）
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(map_err)?
        .join("assets");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("reqwest client build failed: {e}"))?;
    // 后台 task：跑流式循环，每收到一个事件就 emit 到前端
    let rid_for_abort = rid_for_task.clone();
    tokio::spawn(async move {
        let app_inside = app_for_emit.clone();
        let cache_dir_inner = cache_dir.clone();
        let client_inner = client.clone();
        // P5：本地化用的 rid（独立 clone，避免 closure 互相打架）
        let rid_for_localize = rid_for_task.clone();
        let result = jimeng::generate_stream(
            &api_key,
            p,
            rid_for_task,
            move |event| {
                // P5：对 PartialImage/PartialImageB64 异步下载到本地，再回填 local_path
                let app_for_dl = app_inside.clone();
                let cache_for_dl = cache_dir_inner.clone();
                let client_for_dl = client_inner.clone();
                let rid_for_dl = rid_for_localize.clone();
                // 必须在 spawn 前取出 event 里需要的字段（因为 event 后面要 move）
                let download_target: Option<(String, i32, String, Option<String>)> = match &event {
                    jimeng::StreamEvent::PartialImage { url, index, output_format, .. } => {
                        Some((rid_for_dl.clone(), *index, url.clone(), output_format.clone()))
                    }
                    _ => None,
                };
                let b64_target: Option<(String, i32, String, Option<String>)> = match &event {
                    jimeng::StreamEvent::PartialImageB64 { b64, index, output_format, .. } => {
                        Some((rid_for_dl.clone(), *index, b64.clone(), output_format.clone()))
                    }
                    _ => None,
                };
                let _ = app_inside.emit("jimeng://stream", &event);

                if let Some((rid, idx, url, output_format)) = download_target {
                    tokio::spawn(async move {
                        if let Some(p) = jimeng::download_to_cache(
                            &client_for_dl,
                            &url,
                            &cache_for_dl,
                            &rid,
                            idx as usize,
                        )
                        .await
                        {
                            let _ = app_for_dl.emit(
                                "jimeng://stream",
                                &jimeng::StreamEvent::PartialImage {
                                    request_id: rid,
                                    index: idx,
                                    url,
                                    size: None,
                                    local_path: Some(p.to_string_lossy().to_string()),
                                    output_format,
                                },
                            );
                        }
                    });
                } else if let Some((rid, idx, b64, output_format)) = b64_target {
                    tokio::spawn(async move {
                        let dir = cache_for_dl.join(&rid);
                        let _ = tokio::fs::create_dir_all(&dir).await;
                        let dst = dir.join(format!("{idx}.png"));
                        match B64.decode(b64.as_bytes()) {
                            Ok(bytes) => {
                                if tokio::fs::write(&dst, &bytes).await.is_ok() {
                                    let _ = app_for_dl.emit(
                                        "jimeng://stream",
                                        &jimeng::StreamEvent::PartialImageB64 {
                                            request_id: rid,
                                            index: idx,
                                            b64,
                                            local_path: Some(dst.to_string_lossy().to_string()),
                                            output_format,
                                        },
                                    );
                                }
                            }
                            Err(e) => log::warn!("decode b64 failed: {e}"),
                        }
                    });
                }
            },
        )
        .await;
        if let Err(e) = result {
            // 兜底：stream 函数本身没 emit Aborted 时（理论上不应发生）
            let _ = app_for_emit.emit(
                "jimeng://stream",
                &jimeng::StreamEvent::Aborted {
                    request_id: rid_for_abort,
                    reason: e.to_string(),
                },
            );
        }
    });
    Ok(request_id)
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
pub async fn create_asset(
    params: JsCreateAssetParams,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<JsAsset, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let payload_str = serde_json::to_string(&params.payload).map_err(map_err)?;
    {
        let s = state.lock().map_err(map_err)?;
        let conn = s.storage.conn.lock().map_err(map_err)?;
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
    }

    // P5+：兜底补下本地缓存。
    // 任何入库路径（同步生图 / 流式生图 / 局部编辑）只要 payload.urls 有内容但 localPaths 缺失，
    // 都用这个后台 task 拉一份到本地，避免 24h 后 URL 失效丢图。
    // 入库响应不等下载完成（用户先用 url 看到图），下载完异步写回 DB。
    spawn_local_path_backfill(
        app,
        id.clone(),
        params.project_id.clone(),
        extract_urls_for_backfill(&params.payload),
        extract_local_paths_for_backfill(&params.payload),
    );

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
pub fn delete_asset(
    id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    // 1) 先拿 app_data_dir,后面清文件要拼路径
    let app_dir = {
        let s = state.lock().map_err(map_err)?;
        s.storage.app_dir.clone()
    };
    // 2) 删 DB 行
    {
        let s = state.lock().map_err(map_err)?;
        let conn = s.storage.conn.lock().map_err(map_err)?;
        conn.execute("DELETE FROM assets WHERE id = ?1", params![id])
            .map_err(map_err)?;
    }
    // 3) 异步清本地缓存目录,失败仅 log(不阻断前端)
    let cache_dir = app_dir.join("assets").join(&id);
    tauri::async_runtime::spawn(async move {
        match tokio::fs::remove_dir_all(&cache_dir).await {
            Ok(_) => log::info!("asset cache dir removed: {}", cache_dir.display()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // 文件早被外部删了,正常
            }
            Err(e) => log::warn!(
                "failed to remove asset cache dir {}: {e}",
                cache_dir.display()
            ),
        }
    });
    Ok(())
}

// ---------- P5+：24h URL 失效兜底（入库时后台补本地缓存） ----------

/// 从 payload 里抽出"需要本地兜底的 url 列表"。
/// - 普通生成：payload.urls
/// - 图层拆分：layers 数组的 url（按 zIndex 升序）
fn extract_urls_for_backfill(payload: &Value) -> Vec<String> {
    // 图层拆分场景的 payload 固定带 `urls: []`，所以不能因为 urls 是空数组
    // 就直接返回空列表；空数组要落到 layers 分支，否则图层本地路径永远不会补下。
    if let Some(arr) = payload.get("urls").and_then(|v| v.as_array()) {
        if !arr.is_empty() {
            return arr
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();
        }
    }
    if let Some(arr) = payload.get("layers").and_then(|v| v.as_array()) {
        let mut pairs: Vec<(i32, String)> = arr
            .iter()
            .filter_map(|layer| {
                let z = layer
                    .get("zIndex")
                    .or_else(|| layer.get("z_index"))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32;
                let url = layer.get("url").and_then(|v| v.as_str())?;
                Some((z, url.to_string()))
            })
            .collect();
        pairs.sort_by_key(|(z, _)| *z);
        return pairs.into_iter().map(|(_, u)| u).collect();
    }
    Vec::new()
}

/// 从 payload 里抽出已有的 localPaths（按位置平行于 urls），缺位填 None。
fn extract_local_paths_for_backfill(payload: &Value) -> Vec<Option<String>> {
    // 图层拆分 payload 固定带 `urls: []` + `layers`，应优先读 layerLocalPaths；
    // 普通 payload 才读 localPaths。避免历史数据里意外写入的 localPaths 干扰。
    let has_urls = payload
        .get("urls")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    let has_layers = payload
        .get("layers")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    let is_layer_mode = !has_urls && has_layers;
    let raw = if is_layer_mode {
        payload
            .get("layerLocalPaths")
            .or_else(|| payload.get("localPaths"))
    } else {
        payload
            .get("localPaths")
            .or_else(|| payload.get("layerLocalPaths"))
    }
    .and_then(|v| v.as_array());

    if is_layer_mode {
        // 和 extract_urls_for_backfill 一样按 zIndex 排序后再返回，
        // 避免 layers / layerLocalPaths 初始顺序与 zIndex 不一致时对错位。
        let layers = payload
            .get("layers")
            .and_then(|v| v.as_array())
            .map(|a| a.as_slice())
            .unwrap_or_default();
        let mut pairs: Vec<(i32, Option<String>)> = layers
            .iter()
            .enumerate()
            .map(|(i, layer)| {
                let z = layer
                    .get("zIndex")
                    .or_else(|| layer.get("z_index"))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32;
                let p = raw
                    .and_then(|arr| arr.get(i))
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string());
                (z, p)
            })
            .collect();
        pairs.sort_by_key(|(z, _)| *z);
        return pairs.into_iter().map(|(_, p)| p).collect();
    }

    let urls_len = extract_urls_for_backfill(payload).len();
    let mut out: Vec<Option<String>> = (0..urls_len).map(|_| None).collect();
    if let Some(arr) = raw {
        for (i, v) in arr.iter().enumerate() {
            if i >= out.len() {
                break;
            }
            if let Some(s) = v.as_str() {
                if !s.is_empty() {
                    out[i] = Some(s.to_string());
                }
            }
        }
    }
    out
}

/// 把 (url, local_path) 平行数组写回 assets.payload.localPaths（或 layerLocalPaths）。
/// - 仅替换对应字段，其它字段不动
/// - 空字符串 / 非法路径会被丢弃
/// - 所有非空路径必须 canonicalize 后在 `app_dir/assets` 下（防越权）
fn write_local_paths_to_payload(
    conn: &rusqlite::Connection,
    app_dir: &Path,
    asset_id: &str,
    local_paths: &[Option<String>],
) -> Result<(), String> {
    // 读出当前 payload
    let current: Option<String> = conn
        .query_row(
            "SELECT payload FROM assets WHERE id = ?1",
            params![asset_id],
            |r| r.get(0),
        )
        .map_err(map_err)?;
    let Some(payload_str) = current else {
        return Err(format!("资产不存在：{asset_id}"));
    };
    let mut payload: Value =
        serde_json::from_str(&payload_str).map_err(|e| format!("parse payload: {e}"))?;
    let obj = payload
        .as_object_mut()
        .ok_or_else(|| "payload 不是 object".to_string())?;

    // 校验：所有非空路径必须在 app_dir/assets 下
    let assets_root = app_dir.join("assets");
    let canonical_assets = assets_root
        .canonicalize()
        .unwrap_or_else(|_| assets_root.clone());
    let mut cleaned: Vec<String> = Vec::with_capacity(local_paths.len());
    for p in local_paths {
        match p {
            Some(s) if !s.is_empty() => {
                let pb = std::path::PathBuf::from(s);
                match pb.canonicalize() {
                    Ok(c) if c.starts_with(&canonical_assets) => {
                        cleaned.push(c.to_string_lossy().to_string());
                    }
                    _ => cleaned.push(String::new()),
                }
            }
            _ => cleaned.push(String::new()),
        }
    }

    // 选择字段：urls 模式写 localPaths，图层模式写 layerLocalPaths。
    // 注意：图层拆分 payload 的 urls 是空数组（buildAssetPayload 会写入 urls: []），
    // 所以不能用"urls 是否数组"判断，而要按"有没有非空 urls / 有没有 layers"判断。
    let has_urls = obj
        .get("urls")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    let has_layers = obj
        .get("layers")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    let is_layer_mode = !has_urls && has_layers;
    let field = if is_layer_mode { "layerLocalPaths" } else { "localPaths" };
    // P0+：bbox 链路诊断。写回前打一次 bbox 摘要,写回后再打一次。
    // 如果 before 都有、after 没了 → 说明 `as_object_mut().insert` 之外
    // 还有路径在丢字段（理论上不应该，但加 log 兜底确认）。
    if is_layer_mode {
        let bbox_before: Vec<Option<Vec<f64>>> = obj
            .get("layers")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .map(|l| {
                        l.get("boundingBox")
                            .and_then(|bb| bb.get("normalized"))
                            .and_then(|n| n.as_array())
                            .map(|a| a.iter().filter_map(|x| x.as_f64()).collect())
                    })
                    .collect()
            })
            .unwrap_or_default();
        log::debug!(
            "write_local_paths_to_payload: before bbox_count={} sample_normalized={:?}",
            bbox_before.len(),
            bbox_before.iter().take(3).collect::<Vec<_>>()
        );
    }
    obj.insert(
        field.into(),
        Value::Array(cleaned.into_iter().map(Value::String).collect()),
    );
    if is_layer_mode {
        let bbox_after: Vec<Option<Vec<f64>>> = obj
            .get("layers")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .map(|l| {
                        l.get("boundingBox")
                            .and_then(|bb| bb.get("normalized"))
                            .and_then(|n| n.as_array())
                            .map(|a| a.iter().filter_map(|x| x.as_f64()).collect())
                    })
                    .collect()
            })
            .unwrap_or_default();
        log::debug!(
            "write_local_paths_to_payload: after bbox_count={} sample_normalized={:?}",
            bbox_after.len(),
            bbox_after.iter().take(3).collect::<Vec<_>>()
        );
    }

    let new_payload_str = serde_json::to_string(&payload).map_err(map_err)?;
    let now = chrono::Utc::now().timestamp_millis();
    let changed = conn
        .execute(
            "UPDATE assets SET payload = ?1 WHERE id = ?2",
            params![new_payload_str, asset_id],
        )
        .map_err(map_err)?;
    if changed == 0 {
        return Err(format!("资产不存在：{asset_id}"));
    }
    // 顺手 bump 项目 updated_at
    if let Ok(project_id) = conn.query_row(
        "SELECT project_id FROM assets WHERE id = ?1",
        params![asset_id],
        |r| r.get::<_, String>(0),
    ) {
        let _ = conn.execute(
            "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
            params![now, project_id],
        );
    }
    Ok(())
}

/// 后台异步补下 localPath 的核心 task。
/// - 串行下载避免瞬时打满带宽
/// - 全部下完或部分失败后，统一写回一次 DB
/// - 写库成功 → emit `assets://local-backfilled` 事件，前端增量更新(避免整板 reload)
fn spawn_local_path_backfill(
    app: AppHandle,
    asset_id: String,
    project_id: String,
    urls: Vec<String>,
    mut existing: Vec<Option<String>>,
) {
    if urls.is_empty() {
        return;
    }
    if existing
        .iter()
        .all(|p| p.as_deref().is_some_and(|s| !s.is_empty()))
    {
        return;
    }
    while existing.len() < urls.len() {
        existing.push(None);
    }

    // 算 cache_dir（用 app 拿 app_data_dir，不持 state 锁）
    let cache_dir = match app.path().app_data_dir() {
        Ok(d) => d.join("assets"),
        Err(e) => {
            log::warn!("backfill app_data_dir failed: {e}");
            return;
        }
    };
    let app_dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return,
    };

    tokio::spawn(async move {
        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                log::warn!("backfill client build failed: {e}");
                return;
            }
        };
        let mut changed = false;
        let mut any_failed = false;
        for (i, url) in urls.iter().enumerate() {
            if existing[i].as_deref().is_some_and(|s| !s.is_empty()) {
                continue;
            }
            match jimeng::download_to_cache(&client, url, &cache_dir, &asset_id, i).await {
                Some(p) => {
                    existing[i] = Some(p.to_string_lossy().to_string());
                    changed = true;
                }
                None => any_failed = true,
            }
        }
        if !changed {
            return;
        }
        // 写回 DB
        let state_in_spawn: tauri::State<Mutex<AppState>> = app.state();
        let write_result: Result<Vec<String>, String> = (|| {
            let g = state_in_spawn.lock().map_err(map_err)?;
            let conn = g.storage.conn.lock().map_err(map_err)?;
            write_local_paths_to_payload(&conn, &app_dir, &asset_id, &existing)?;
            if any_failed {
                mark_asset_broken(&conn, &asset_id).ok();
            }
            // 把 cleaned 后(写回 DB 后的)local_paths 序列化回去给前端
            let cleaned: Vec<String> = existing
                .iter()
                .map(|p| p.clone().unwrap_or_default())
                .collect();
            Ok(cleaned)
        })();
        match write_result {
            Ok(cleaned) => {
                // 通知前端：这条资产已经下载到本地，请增量更新 React state。
                // emit 同时给两个字段都发 cleaned——前端按自己 payload 形态
                // (urls 还是 layers)选用 localPaths / layerLocalPaths。
                let payload = AssetLocalBackfilled {
                    asset_id: asset_id.clone(),
                    project_id: project_id.clone(),
                    local_paths: Some(cleaned.clone()),
                    layer_local_paths: Some(cleaned),
                };
                if let Err(e) = app.emit(ASSET_LOCAL_BACKFILLED_EVENT, payload) {
                    log::warn!("emit {ASSET_LOCAL_BACKFILLED_EVENT} failed: {e}");
                }
            }
            Err(e) => {
                log::warn!("backfill write failed for {asset_id}: {e}");
            }
        }
    });
}

/// 扫一个项目下所有"urls 有内容但 localPaths 缺失"的资产，并发下完后写回 DB。
/// - 返回处理摘要：扫了几条、补成功几条、失败几条
/// - 失败的资产标 `payload.broken = true`（UI 可以给"图已过期"提示，提示用户重新生成）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackfillReport {
    pub scanned: usize,
    pub downloaded: usize,
    pub failed: usize,
    pub broken_marked: usize,
}

/// P6+：回填 payload.outputFormat 报告
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackfillOutputFormatReport {
    /// 扫到的总资产数
    pub scanned: usize,
    /// 缺 outputFormat 字段的资产数
    pub missing: usize,
    /// 成功回填的资产数
    pub updated: usize,
    /// 跳过（已有字段 / 没法推断）的资产数
    pub skipped: usize,
}

#[tauri::command]
pub fn backfill_output_format(
    project_id: Option<String>,
    state: State<'_, Mutex<AppState>>,
) -> Result<BackfillOutputFormatReport, String> {
    let s = state.lock().map_err(map_err)?;
    let conn = s.storage.conn.lock().map_err(map_err)?;

    let sql = if project_id.is_some() {
        "SELECT id, payload FROM assets WHERE project_id = ?1 ORDER BY created_at DESC"
    } else {
        "SELECT id, payload FROM assets ORDER BY created_at DESC"
    };
    let mut stmt = conn.prepare(sql).map_err(map_err)?;
    let rows: Vec<(String, String)> = if let Some(pid) = &project_id {
        stmt.query_map(params![pid], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(map_err)?
            .filter_map(|r| r.ok())
            .collect()
    } else {
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(map_err)?
            .filter_map(|r| r.ok())
            .collect()
    };

    let mut report = BackfillOutputFormatReport {
        scanned: rows.len(),
        missing: 0,
        updated: 0,
        skipped: 0,
    };

    for (id, payload_str) in rows {
        let mut payload: Value = match serde_json::from_str(&payload_str) {
            Ok(v) => v,
            Err(_) => {
                report.skipped += 1;
                continue;
            }
        };
        // 已有 outputFormat 字段 → 跳过（避免覆盖）
        if payload.get("outputFormat").is_some() {
            continue;
        }
        report.missing += 1;

        // 推断格式：优先 transparent（强制 png），否则按 urls[0] 末尾扩展名
        let is_transparent = payload
            .get("transparent")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let inferred: Option<&'static str> = if is_transparent {
            Some("png")
        } else {
            // 优先看 layers[0].url（zIndex=0 底图），再看 urls[0]
            let url_opt = payload
                .get("layers")
                .and_then(|v| v.as_array())
                .and_then(|arr| {
                    let mut sorted: Vec<&Value> = arr.iter().collect();
                    sorted.sort_by_key(|l| {
                        l.get("zIndex")
                            .or_else(|| l.get("z_index"))
                            .and_then(|v| v.as_i64())
                            .unwrap_or(0)
                    });
                    sorted.first().and_then(|l| l.get("url")).and_then(|u| u.as_str())
                })
                .or_else(|| {
                    payload
                        .get("urls")
                        .and_then(|v| v.as_array())
                        .and_then(|arr| arr.first().and_then(|u| u.as_str()))
                });
            url_opt.and_then(infer_format_from_url)
        };

        match inferred {
            Some(fmt) => {
                if let Some(obj) = payload.as_object_mut() {
                    obj.insert("outputFormat".to_string(), Value::String(fmt.to_string()));
                }
                let new_payload_str = serde_json::to_string(&payload).map_err(map_err)?;
                conn.execute(
                    "UPDATE assets SET payload = ?1 WHERE id = ?2",
                    params![new_payload_str, id],
                )
                .map_err(map_err)?;
                report.updated += 1;
            }
            None => {
                report.skipped += 1;
            }
        }
    }

    Ok(report)
}

/// 从 URL / data URL 推断图片格式。data URL 取首段 mime；普通 URL 看末尾扩展名。
/// 返回 "png" / "jpeg" / None。
fn infer_format_from_url(url: &str) -> Option<&'static str> {
    // data URL：data:image/png;base64,... 或 data:image/jpeg;base64,...
    if let Some(rest) = url.strip_prefix("data:") {
        if rest.starts_with("image/png") {
            return Some("png");
        }
        if rest.starts_with("image/jpeg") || rest.starts_with("image/jpg") {
            return Some("jpeg");
        }
        return None;
    }
    // 普通 URL：忽略 query string 和 fragment，看 path 末尾
    let path = url.split('?').next().unwrap_or(url);
    let path = path.split('#').next().unwrap_or(path);
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        Some("png")
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        Some("jpeg")
    } else {
        // 火山方舟 URL 通常不带扩展名（jfs/tos 内部路径），无法推断 → 跳过
        None
    }
}

/// 同步扫出「localPath 缺位 / 文件已不在磁盘」的资产。
/// 共享给 backfill_local_assets(项目级) 和 startup_backfill(全量)。
fn scan_backfill_candidates(
    project_id: Option<String>,
    state: &Mutex<AppState>,
) -> Result<Vec<(String, String, Vec<String>, Vec<Option<String>>)>, String> {
    let s = state.lock().map_err(map_err)?;
    let conn = s.storage.conn.lock().map_err(map_err)?;
    let sql = if project_id.is_some() {
        "SELECT id, project_id, payload FROM assets WHERE project_id = ?1 ORDER BY created_at DESC"
    } else {
        "SELECT id, project_id, payload FROM assets ORDER BY created_at DESC"
    };
    let mut stmt = conn.prepare(sql).map_err(map_err)?;
    let rows: Vec<(String, String, String)> = if let Some(pid) = &project_id {
        stmt.query_map(params![pid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(map_err)?
            .filter_map(|r| r.ok())
            .collect()
    } else {
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(map_err)?
            .filter_map(|r| r.ok())
            .collect()
    };
    Ok(rows
        .into_iter()
        .filter_map(|(id, project_id, payload_str)| {
            let payload: Value = serde_json::from_str(&payload_str).ok()?;
            let urls = extract_urls_for_backfill(&payload);
            if urls.is_empty() {
                return None;
            }
            let existing = extract_local_paths_for_backfill(&payload);
            // 条件 1:localPaths 至少有缺位
            let has_missing = existing
                .iter()
                .any(|p| p.as_deref().is_none_or(|s| s.is_empty()));
            // 条件 2:已有 path 但文件已被外部删除
            let has_dead_file = existing.iter().any(|p| {
                p.as_deref()
                    .is_some_and(|s| !s.is_empty() && !std::path::Path::new(s).exists())
            });
            if !has_missing && !has_dead_file {
                return None;
            }
            Some((id, project_id, urls, existing))
        })
        .collect())
}

/// 共用的「并发下载 + 写库 + emit 事件」核心。
/// candidates 由 scan_backfill_candidates 给出;调用方各自做同步扫描,然后把结果 move 进来。
async fn download_and_write_candidates(
    candidates: Vec<(String, String, Vec<String>, Vec<Option<String>>)>,
    app: AppHandle,
) -> Result<BackfillReport, String> {
    let total = candidates.len();
    if total == 0 {
        return Ok(BackfillReport {
            scanned: 0,
            downloaded: 0,
            failed: 0,
            broken_marked: 0,
        });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("reqwest client build failed: {e}"))?;
    let app_dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(e) => return Err(format!("app_data_dir failed: {e}")),
    };
    let cache_dir = app_dir.join("assets");

    let mut handles = Vec::with_capacity(total);
    for (asset_id, project_id, urls, mut existing) in candidates.into_iter() {
        while existing.len() < urls.len() {
            existing.push(None);
        }
        let client = client.clone();
        let cache_dir = cache_dir.clone();
        let app_dir_inner = app_dir.clone();
        let app_for_state = app.clone();
        let handle = tokio::spawn(async move {
            let mut changed = false;
            let mut all_ok = true;
            for (i, url) in urls.iter().enumerate() {
                // 已存在且文件还在 → 跳过
                if let Some(p) = existing[i].as_deref() {
                    if !p.is_empty() && std::path::Path::new(p).exists() {
                        continue;
                    }
                }
                if let Some(p) =
                    jimeng::download_to_cache(&client, url, &cache_dir, &asset_id, i).await
                {
                    existing[i] = Some(p.to_string_lossy().to_string());
                    changed = true;
                } else {
                    all_ok = false;
                }
            }
            if !changed {
                return (asset_id, project_id, false, false, None);
            }
            // 写回 DB
            let state_in_spawn: tauri::State<Mutex<AppState>> = app_for_state.state();
            let write_result: Result<Option<Vec<String>>, String> = match state_in_spawn.lock() {
                Ok(g) => match g.storage.conn.lock() {
                    Ok(conn) => {
                        let r =
                            write_local_paths_to_payload(&conn, &app_dir_inner, &asset_id, &existing);
                        if r.is_ok() {
                            let cleaned: Vec<String> = existing
                                .iter()
                                .map(|p| p.clone().unwrap_or_default())
                                .collect();
                            Ok(Some(cleaned))
                        } else {
                            Err(r.unwrap_err())
                        }
                    }
                    Err(_) => Ok(None),
                },
                Err(_) => Ok(None),
            };
            let cleaned = match write_result {
                Ok(c) => c,
                Err(_) => None,
            };
            let write_ok = cleaned.is_some();
            (asset_id, project_id, all_ok, write_ok, cleaned)
        });
        handles.push(handle);
    }

    let mut downloaded = 0usize;
    let mut failed = 0usize;
    let mut broken_marked = 0usize;
    for h in handles {
        match h.await {
            Ok((id, project_id, all_ok, write_ok, cleaned)) => {
                if write_ok {
                    downloaded += 1;
                    if !all_ok {
                        // 部分下载失败 → 标 broken
                        // 用 block 把 State 的生命周期限制在块内,避免与 Result 临时值重叠
                        let marked = {
                            let state_for_broken: tauri::State<Mutex<AppState>> = app.state();
                            let g = state_for_broken.lock().ok();
                            let conn = g.as_ref().and_then(|g| g.storage.conn.lock().ok());
                            conn.as_deref()
                                .and_then(|c| mark_asset_broken(c, &id).ok())
                                .is_some()
                        };
                        if marked {
                            broken_marked += 1;
                        }
                    }
                    // emit 事件让前端增量更新(避免整板 reload)
                    if let Some(cleaned) = cleaned {
                        let payload = AssetLocalBackfilled {
                            asset_id: id,
                            project_id,
                            local_paths: Some(cleaned.clone()),
                            layer_local_paths: Some(cleaned),
                        };
                        if let Err(e) = app.emit(ASSET_LOCAL_BACKFILLED_EVENT, payload) {
                            log::warn!("emit {ASSET_LOCAL_BACKFILLED_EVENT} failed: {e}");
                        }
                    }
                } else {
                    failed += 1;
                }
            }
            Err(_) => failed += 1,
        }
    }

    log::info!(
        "backfill done: scanned={} downloaded={} failed={} broken_marked={}",
        total,
        downloaded,
        failed,
        broken_marked
    );

    Ok(BackfillReport {
        scanned: total,
        downloaded,
        failed,
        broken_marked,
    })
}

#[tauri::command]
pub async fn backfill_local_assets(
    project_id: Option<String>,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<BackfillReport, String> {
    let candidates = scan_backfill_candidates(project_id, &state)?;
    download_and_write_candidates(candidates, app).await
}

/// 启动时全量自检:扫所有项目下「localPath 缺位 / 文件已不在磁盘」的资产,后台拉取并写回。
/// - 由 `lib.rs` 在 `setup` 阶段通过 `tokio::spawn` 调用,不等结果
/// - 完成后通过 `assets://local-backfilled` 事件告知前端
pub async fn startup_backfill_assets(app: AppHandle) {
    let state: tauri::State<Mutex<AppState>> = app.state();
    let candidates = match scan_backfill_candidates(None, &state) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("startup backfill scan failed: {e}");
            return;
        }
    };
    match download_and_write_candidates(candidates, app).await {
        Ok(r) => log::info!(
            "startup backfill done: scanned={} downloaded={} failed={} broken_marked={}",
            r.scanned, r.downloaded, r.failed, r.broken_marked
        ),
        Err(e) => log::warn!("startup backfill failed: {e}"),
    }
}

/// 给 payload 标 `broken: true`（供 UI 提示用户重新生成）。
fn mark_asset_broken(conn: &rusqlite::Connection, asset_id: &str) -> Result<(), String> {
    let current: Option<String> = conn
        .query_row(
            "SELECT payload FROM assets WHERE id = ?1",
            params![asset_id],
            |r| r.get(0),
        )
        .map_err(map_err)?;
    let Some(payload_str) = current else {
        return Err(format!("资产不存在：{asset_id}"));
    };
    let mut payload: Value =
        serde_json::from_str(&payload_str).map_err(|e| format!("parse payload: {e}"))?;
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("broken".into(), Value::Bool(true));
    }
    let new_payload_str = serde_json::to_string(&payload).map_err(map_err)?;
    conn.execute(
        "UPDATE assets SET payload = ?1 WHERE id = ?2",
        params![new_payload_str, asset_id],
    )
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

// ---------- P5: 24h URL 失效兜底（本地缓存读取） ----------

/// 把本地缓存的绝对路径读成 base64 data URL，供前端 `<img src="data:...">` 用。
/// - 限制：只允许读 `app_data_dir/assets/` 下的文件（防越权）
/// - 同步命令（图片通常 < 5MB，5MB base64 = 6.7MB 字符串，IPC 够用）
#[tauri::command]
pub fn read_image_data_url(path: String, app: AppHandle) -> Result<String, String> {
    let p = std::path::PathBuf::from(&path);
    // 路径必须在 app_data_dir/assets 下
    let assets_root = app
        .path()
        .app_data_dir()
        .map_err(map_err)?
        .join("assets");
    let canonical_assets = assets_root
        .canonicalize()
        .unwrap_or_else(|_| assets_root.clone());
    let canonical_path = p
        .canonicalize()
        .map_err(|e| format!("canonicalize failed: {e}"))?;
    if !canonical_path.starts_with(&canonical_assets) {
        return Err(format!(
            "path not allowed: {} (must be under {})",
            canonical_path.display(),
            canonical_assets.display()
        ));
    }
    let bytes = std::fs::read(&canonical_path).map_err(map_err)?;

    // MIME 推断策略：magic bytes 优先（覆盖以 .png 结尾但实际是 JPEG 字节的"假 PNG"），
    // 命中 SVG/XML 时按文本头检测；都不识别则回退到扩展名（保持对 BMP/TIFF/ICO 等老格式的兜底）。
    let magic_mime: Option<&'static str> = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else {
        None
    };

    // SVG / XML 文本头：跳过前导 ASCII 空白再判
    let head_offset = bytes
        .iter()
        .take_while(|b| b.is_ascii_whitespace())
        .count();
    let looks_like_svg = head_offset < bytes.len()
        && (bytes[head_offset..].starts_with(b"<?xml")
            || bytes[head_offset..].starts_with(b"<svg"));

    let mime = magic_mime
        .or(if looks_like_svg {
            Some("image/svg+xml")
        } else {
            None
        })
        .unwrap_or_else(|| {
            // 扩展名兜底（保留旧行为）
            let ext = canonical_path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("png")
                .to_lowercase();
            match ext.as_str() {
                "jpg" | "jpeg" => "image/jpeg",
                "webp" => "image/webp",
                "gif" => "image/gif",
                "svg" => "image/svg+xml",
                _ => "image/png",
            }
        });

    Ok(format!("data:{};base64,{}", mime, B64.encode(&bytes)))
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
    } else if raw.contains("background=transparent 仅 5.0 Pro 支持") {
        "透明背景仅 5.0 Pro 支持。当前模型不支持，关掉「透明背景」开关再试。"
    } else if raw.contains("output_format=jpeg 与 background=transparent 互斥") {
        "透明背景必须用 PNG 输出。把「输出格式」切到 PNG，或关掉「透明背景」开关。"
    } else if lower.contains("transparent background requires a png") {
        // API 实际要求：① PNG（不是 JPEG/WebP），② 至少 1 个透明像素。
        // Y-agent 已在 `runTool` 阶段对图加了 1 个透明像素（image-alpha-patch），
        // 此处承担兜底——仍报此错通常是源图不是真 PNG（例如 .png 扩展名但实际是 JPEG 字节）。
        "5.0 Pro 的「背景透明」要求输入图是带至少一个透明像素的 PNG（不透明 PNG、JPEG、WebP 都会被拒）。通常 Y-agent 已经自动处理了左上角 1 像素，若仍报此错，多半是源图不是真 PNG（例如 .png 扩展名但实际是 JPEG 字节），请换一张真 PNG 再试。"
    } else if lower.contains("internalserviceerror") {
        "服务端内部错误（通常 5xx）。重试一次，或等几分钟后回来。"
    } else if lower.contains("dial tcp")
        || lower.contains("connection refused")
        || (lower.contains("error while downloading") && (lower.contains("asset.localhost") || lower.contains("asset://")))
    {
        // 修复：原始 raw 错误可能已经是 dataURL（Rust 端自动转过），但 explainError 看到的可能是
        // 用户界面上展示的二次错误。匹配 dial tcp / connection refused / asset.localhost fetch 失败
        // — 通常意味着 jimeng API 在公网 fetch 不到本地资源（理论上 Rust 已经转 dataURL，
        // 但保留这条 hint 兜底非本地资产直传 URL 失败场景）。
        "服务端无法访问输入图 URL（火山方舟在公网 fetch 不到）。通常 Y-agent 已自动把本地资产转 dataURL 内联到请求里，若仍报此错，请检查源图是否被外部删除。"
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
