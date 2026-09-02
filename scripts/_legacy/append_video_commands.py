#!/usr/bin/env python3
"""Append the video-generation command block to src-tauri/src/commands.rs,
and register module + commands in src-tauri/src/lib.rs and src-tauri/src/state.rs.

Run from the project root. UTF-8 in/out, no BOM.
"""
import sys
from pathlib import Path

ROOT = Path("E:/Pi/Y-agent")
COMMANDS = ROOT / "src-tauri" / "src" / "commands.rs"
LIB = ROOT / "src-tauri" / "src" / "lib.rs"
STATE = ROOT / "src-tauri" / "src" / "state.rs"

# Video commands block
VIDEO_COMMANDS = r'''
// ============================================================================
// P8: 视频生成（MiniMax H3）
// ============================================================================
//
// 异步任务模式：
// 1. `jimeng_video_submit` POST 到 MiniMax H3，拿到 task_id
// 2. 后台 spawn `poll_video_task`，每 3s 查一次，最多 10 min
// 3. 状态变更通过 Tauri event `jimeng_video://*` 推前端
// 4. 成功时下载视频到本地 cache 兜底（24h URL 失效）
//
// 设计要点：
// - 不调取消 API（H3 没取消端点），前端调 `jimeng_video_cancel` 仅本地 break 循环
// - 单项目同时只允许 1 个任务（v1 限制），多了走"排队"语义
// - Demo 模式（key 以 "demo-" 开头）走占位返回，不调真实 API

use crate::state::VideoTaskHandle;
use crate::video::{
    self, ContentItem, VideoSubmitReq, VideoTask, VideoTaskError,
};
use std::time::{Duration, Instant};

const KEY_VIDEO_KV: &str = "video_api_key";
const POLL_INTERVAL: Duration = Duration::from_secs(3);
const POLL_MAX_DURATION: Duration = Duration::from_secs(10 * 60);
const POLL_QUERY_RETRIES: u32 = 3;
/// 视频下载到 cache 的目录名（沿用图片的 assets/ 目录，按 batch_id 分组）
const VIDEO_CACHE_DIR: &str = "videos";

// ---------------------------------------------------------------------------
// JS 端传参 / 返回结构
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsVideoSubmitParams {
    pub model: String,
    pub content: Vec<ContentItem>,
    pub resolution: String,
    pub duration: u32,
    #[serde(default)]
    pub ratio: Option<String>,
    #[serde(default)]
    pub aigc_watermark: Option<bool>,
    /// v1 留空，预留
    #[serde(default)]
    pub callback_url: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum JsVideoEvent {
    /// 任务被服务端接受，正在排队 / 生成中
    #[serde(rename_all = "camelCase")]
    Progress {
        task_id: String,
        status: String,
    },
    /// 生成成功，附视频 URL（已下载到本地 cache）
    #[serde(rename_all = "camelCase")]
    Succeeded {
        task_id: String,
        url: String,
        local_path: Option<String>,
        resolution: Option<String>,
        duration: Option<u32>,
        ratio: Option<String>,
    },
    /// 生成失败（API 错误 / 超时 / 网络断开）
    #[serde(rename_all = "camelCase")]
    Failed {
        task_id: String,
        code: Option<String>,
        message: String,
    },
    /// 用户主动取消
    #[serde(rename_all = "camelCase")]
    Cancelled {
        task_id: String,
    },
}

impl JsVideoEvent {
    pub fn emit(&self, app: &AppHandle) {
        let name = match self {
            JsVideoEvent::Progress { .. } => "jimeng_video://progress",
            JsVideoEvent::Succeeded { .. } => "jimeng_video://succeeded",
            JsVideoEvent::Failed { .. } => "jimeng_video://failed",
            JsVideoEvent::Cancelled { .. } => "jimeng_video://cancelled",
        };
        let _ = app.emit(name, self);
    }
}

// ---------------------------------------------------------------------------
// 视频 API Key 三件套
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_video_api_key(state: State<'_, Mutex<AppState>>) -> Result<Option<String>, String> {
    let s = state.lock().map_err(map_err)?;
    let enc = s.storage.get_kv(KEY_VIDEO_KV).map_err(map_err)?;
    match enc {
        Some(e) => s.cipher.decrypt(&e).map(Some).map_err(map_err),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn set_video_api_key(
    key: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let s = state.lock().map_err(map_err)?;
    let enc = s.cipher.encrypt(&key).map_err(map_err)?;
    s.storage.put_kv(KEY_VIDEO_KV, &enc).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn clear_video_api_key(state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let s = state.lock().map_err(map_err)?;
    s.storage.delete_kv(KEY_VIDEO_KV).map_err(map_err)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 提交 + 轮询
// ---------------------------------------------------------------------------

/// 提交视频生成任务，立即返回 task_id。后台 task 自动开始轮询。
/// 取消通过 `jimeng_video_cancel` 触发。
#[tauri::command]
pub async fn jimeng_video_submit(
    params: JsVideoSubmitParams,
    project_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<String, String> {
    // 1. 读 + 解密 video api key
    let api_key = {
        let s = state.lock().map_err(map_err)?;
        let enc = s
            .storage
            .get_kv(KEY_VIDEO_KV)
            .map_err(map_err)?
            .ok_or_else(|| "视频 API Key 未设置".to_string())?;
        s.cipher.decrypt(&enc).map_err(map_err)?
    };

    // 2. 构造请求（v1 假设前端传过来的 URL 都是 http(s) / data:，本地资源
    //    走 asset:// 的 v1 不支持；v2 再加 resolve_local_file 路径）
    let req = VideoSubmitReq {
        model: params.model,
        content: params.content,
        resolution: params.resolution,
        duration: params.duration,
        ratio: params.ratio,
        aigc_watermark: params.aigc_watermark,
        callback_url: params.callback_url,
    };

    // 3. 提交（参数护栏在 submit 内部）
    let task_id = video::submit(&api_key, req)
        .await
        .map_err(|e| format!("{e}"))?;

    // 4. 注册取消通道 + 启动后台轮询
    let (cancel_tx, cancel_rx) = oneshot::channel();
    {
        let mut tasks = state.video_tasks.lock().map_err(map_err)?;
        tasks.insert(
            task_id.clone(),
            VideoTaskHandle {
                cancel_tx,
                project_id,
                submitted_at: Instant::now(),
            },
        );
    }

    let app_for_poll = app.clone();
    let api_key_for_poll = api_key.clone();
    let task_id_for_poll = task_id.clone();
    tauri::async_runtime::spawn(async move {
        poll_video_task(api_key_for_poll, task_id_for_poll, cancel_rx, app_for_poll).await;
    });

    Ok(task_id)
}

/// 手动查一次（前端兜底用，例如重连后想确认某 task_id 状态）。
#[tauri::command]
pub async fn jimeng_video_query(
    task_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<VideoTask, String> {
    let api_key = {
        let s = state.lock().map_err(map_err)?;
        let enc = s
            .storage
            .get_kv(KEY_VIDEO_KV)
            .map_err(map_err)?
            .ok_or_else(|| "视频 API Key 未设置".to_string())?;
        s.cipher.decrypt(&enc).map_err(map_err)?
    };
    video::query(&api_key, &task_id)
        .await
        .map_err(|e| format!("{e}"))
}

/// 主动停止轮询（仅本地停止，不调取消 API）。
/// Rust 端 emit `jimeng_video://cancelled` 事件让前端 UI 更新。
#[tauri::command]
pub fn jimeng_video_cancel(
    task_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<(), String> {
    let mut tasks = state.video_tasks.lock().map_err(map_err)?;
    if let Some(handle) = tasks.remove(&task_id) {
        let _ = handle.cancel_tx.send(());
    }
    JsVideoEvent::Cancelled { task_id }.emit(&app);
    Ok(())
}

// ---------------------------------------------------------------------------
// 轮询后台 task
// ---------------------------------------------------------------------------

async fn poll_video_task(
    api_key: String,
    task_id: String,
    mut cancel_rx: oneshot::Receiver<()>,
    app: AppHandle,
) {
    let start = Instant::now();
    let mut consecutive_query_failures: u32 = 0;

    loop {
        // 1. 检查取消信号
        if cancel_rx.try_recv().is_ok() {
            log::info!("video task {task_id} cancelled by user");
            cleanup_task_handle(&app, &task_id);
            return;
        }
        // 2. 检查超时
        if start.elapsed() > POLL_MAX_DURATION {
            log::warn!("video task {task_id} timed out after {:?}", POLL_MAX_DURATION);
            JsVideoEvent::Failed {
                task_id: task_id.clone(),
                code: Some("timeout".into()),
                message: format!("轮询超时（{} 分钟）", POLL_MAX_DURATION.as_secs() / 60),
            }
            .emit(&app);
            cleanup_task_handle(&app, &task_id);
            return;
        }

        // 3. 查任务状态
        match video::query(&api_key, &task_id).await {
            Ok(task) => {
                consecutive_query_failures = 0;
                match task.status.as_str() {
                    "queued" | "running" => {
                        JsVideoEvent::Progress {
                            task_id: task_id.clone(),
                            status: task.status.clone(),
                        }
                        .emit(&app);
                    }
                    "succeeded" => {
                        // 成功：尝试下载到本地 cache（沿用 jimeng 的 download_to_cache 工具）
                        let local_path = match task.url.as_deref() {
                            Some(url) if !url.starts_with("data:") => {
                                let cache_dir = app
                                    .path()
                                    .app_data_dir()
                                    .ok()
                                    .map(|d| d.join(VIDEO_CACHE_DIR));
                                if let Some(dir) = cache_dir {
                                    let client = reqwest::Client::builder()
                                        .timeout(std::time::Duration::from_secs(120))
                                        .build()
                                        .ok();
                                    if let Some(c) = client {
                                        let asset_id = task_id.replace("demo-", "video-");
                                        jimeng::download_to_cache(&c, url, &dir, &asset_id, 0)
                                            .await
                                            .map(|p| p.to_string_lossy().to_string())
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                }
                            }
                            _ => None,
                        };
                        JsVideoEvent::Succeeded {
                            task_id: task_id.clone(),
                            url: task.url.clone().unwrap_or_default(),
                            local_path,
                            resolution: task.resolution,
                            duration: task.duration,
                            ratio: task.ratio,
                        }
                        .emit(&app);
                        cleanup_task_handle(&app, &task_id);
                        return;
                    }
                    "failed" => {
                        let (code, message) = match task.error {
                            Some(VideoTaskError { code, message }) => {
                                (code, message.unwrap_or_else(|| "视频生成失败".into()))
                            }
                            None => (None, "视频生成失败".into()),
                        };
                        JsVideoEvent::Failed {
                            task_id: task_id.clone(),
                            code,
                            message,
                        }
                        .emit(&app);
                        cleanup_task_handle(&app, &task_id);
                        return;
                    }
                    "cancelled" => {
                        JsVideoEvent::Cancelled {
                            task_id: task_id.clone(),
                        }
                        .emit(&app);
                        cleanup_task_handle(&app, &task_id);
                        return;
                    }
                    other => {
                        log::warn!("video task {task_id} unknown status: {other}");
                    }
                }
            }
            Err(e) => {
                consecutive_query_failures += 1;
                log::warn!(
                    "video query failed ({consecutive_query_failures}/{POLL_QUERY_RETRIES}): {e}"
                );
                if consecutive_query_failures >= POLL_QUERY_RETRIES {
                    JsVideoEvent::Failed {
                        task_id: task_id.clone(),
                        code: Some("network".into()),
                        message: format!("网络不稳定，连续 {consecutive_query_failures} 次查询失败"),
                    }
                    .emit(&app);
                    cleanup_task_handle(&app, &task_id);
                    return;
                }
            }
        }

        // 4. 睡 POLL_INTERVAL，但要可被取消打断
        tokio::select! {
            _ = &mut cancel_rx => {
                log::info!("video task {task_id} cancelled during sleep");
                cleanup_task_handle(&app, &task_id);
                return;
            }
            _ = tokio::time::sleep(POLL_INTERVAL) => {}
        }
    }
}

/// 任务退出时从 AppState.video_tasks 里移除自己。
fn cleanup_task_handle(app: &AppHandle, task_id: &str) {
    if let Some(state) = app.try_state::<Mutex<AppState>>() {
        if let Ok(mut tasks) = state.video_tasks.lock() {
            tasks.remove(task_id);
        }
    }
}
'''


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_utf8(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def main() -> int:
    # 1. Append video commands to commands.rs
    commands_text = read_utf8(COMMANDS)
    if "P8: 视频生成" in commands_text:
        print("commands.rs already has video block, skipping")
    else:
        write_utf8(COMMANDS, commands_text + VIDEO_COMMANDS)
        print("appended video block to commands.rs")

    # 2. Update lib.rs: add mod video + register commands
    lib_text = read_utf8(LIB)
    if "mod video;" not in lib_text:
        lib_text = lib_text.replace(
            "mod storage;\n",
            "mod storage;\nmod video;\n",
        )
        print("added `mod video;` to lib.rs")
    if "commands::get_video_api_key" not in lib_text:
        new_handlers = (
            "            commands::split_sprite_sheet,\n"
            "            commands::get_video_api_key,\n"
            "            commands::set_video_api_key,\n"
            "            commands::clear_video_api_key,\n"
            "            commands::jimeng_video_submit,\n"
            "            commands::jimeng_video_query,\n"
            "            commands::jimeng_video_cancel,\n"
        )
        lib_text = lib_text.replace(
            "            commands::split_sprite_sheet,\n",
            new_handlers,
        )
        print("registered video commands in lib.rs")
    write_utf8(LIB, lib_text)

    # 3. Update state.rs: add VideoTaskHandle + video_tasks field
    state_text = read_utf8(STATE)
    if "VideoTaskHandle" in state_text:
        print("state.rs already has VideoTaskHandle, skipping")
        return 0
    new_state = '''use crate::crypto::KeyCipher;
use crate::storage::Storage;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tokio::sync::oneshot;

/// 单个正在进行的视频生成任务的句柄。
/// 提交成功后塞进 AppState.video_tasks；取消时取出 cancel_tx 触发停止轮询。
pub struct VideoTaskHandle {
    pub cancel_tx: oneshot::Sender<()>,
    /// 任务关联的 project id，方便 UI 过滤（v1 暂未使用，v2 持久化时用）
    pub project_id: String,
    /// 提交时刻，用于排查卡住的任务
    pub submitted_at: std::time::Instant,
}

pub struct AppState {
    pub storage: Storage,
    pub cipher: KeyCipher,
    /// 视频任务句柄表。v1 限制单项目同时 1 个，所以这里用 HashMap<task_id, handle>。
    /// 任务成功/失败/取消时移除。
    pub video_tasks: Mutex<HashMap<String, VideoTaskHandle>>,
}

impl AppState {
    pub fn new(app_dir: PathBuf) -> anyhow::Result<Self> {
        let storage = Storage::open(&app_dir)?;
        let cipher = KeyCipher::load_or_create(&app_dir)?;
        Ok(Self {
            storage,
            cipher,
            video_tasks: Mutex::new(HashMap::new()),
        })
    }
}
'''
    write_utf8(STATE, new_state)
    print("rewrote state.rs with video_tasks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
