use crate::crypto::KeyCipher;
use crate::storage::Storage;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tokio::sync::oneshot;

/// 单个正在进行的视频生成任务的句柄。
/// 提交成功后塞进 AppState.video_tasks；取消时取出 cancel_tx 触发停止轮询。
///
/// `project_id` / `submitted_at` v1 仅在调试日志里用，v2 持久化时也要用，先不警告。
#[allow(dead_code)]
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
