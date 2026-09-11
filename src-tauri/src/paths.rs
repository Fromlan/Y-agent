//! 集中管理应用数据目录寻址
//!
//! 之前各 IPC handler 散落 `app.path().app_data_dir().unwrap().join("...")`，
//! 既重复又难统一改路径 / 加防越权校验。本模块收敛所有寻址。
//!
//! **重要**：所有调用方必须通过本模块拿到 canonical path，
//! 不允许再直接调 `app.path().app_data_dir()`。
//!
//! 用法：
//! ```ignore
//! use crate::paths;
//! let root = paths::assets_root(&app);
//! let canonical = root.canonicalize().unwrap_or(root);
//! ```
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// `app_data_dir()` 在所有平台上都存在；这里 unwrap 因为 Tauri 启动时已保证。
#[inline]
fn app_data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app_data_dir() should always be available in Tauri runtime")
}

/// 本地资产缓存根目录 (`<app_data_dir>/assets`)
pub fn assets_root(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join("assets")
}

/// 本地视频缓存根目录 (`<app_data_dir>/videos`)
pub fn videos_root(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join("videos")
}

/// 加密主密钥文件路径 (`<app_data_dir>/secret.key`)
pub fn keys_path(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join("secret.key")
}

/// 加密 API Key 的 KV 存储根目录 (`<app_data_dir>`)
pub fn store_root(app: &AppHandle) -> PathBuf {
    app_data_dir(app)
}

/// 数据库文件路径 (`<app_data_dir>/y-agent.db`)
pub fn db_path(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join("y-agent.db")
}

/// 迁移脚本目录 (`<app_data_dir>/migrations`)
/// 仅 dev 模式使用；正常情况下 schema 走 `schema_version` 表内嵌 migration。
pub fn migrations_dir(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join("migrations")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// smoke test：函数签名稳定（不会被意外改成需要额外参数）。
    /// 不在此处测实际路径内容，因为需要 mock AppHandle。
    #[test]
    fn function_signatures_compile() {
        let _: fn(&AppHandle) -> PathBuf = assets_root;
        let _: fn(&AppHandle) -> PathBuf = videos_root;
        let _: fn(&AppHandle) -> PathBuf = keys_path;
        let _: fn(&AppHandle) -> PathBuf = store_root;
        let _: fn(&AppHandle) -> PathBuf = db_path;
        let _: fn(&AppHandle) -> PathBuf = migrations_dir;
    }
}
