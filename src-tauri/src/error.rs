//! 后端统一错误类型
//!
//! 之前 commands.rs 用 `Result<T, String>` 把所有错误压成一行字符串，
//! 经过几层调用后前端 `explainError` 只能猜。本模块定义结构化 `BackendError`，
//! IPC 序列化 `{ code, message }`，前端按 code 精确提示。
//!
//! **迁移策略**：本轮不替换现有 `Result<T, String>`（避免一次性大改动破坏 IPC 契约）。
//! 新代码 / IPC handler 优先用 `Result<T, BackendError>`，下个迭代统一替换。
//!
//! 错误码：
//! - `db`: SQLite / 数据库错误
//! - `io`: 文件系统错误
//! - `asset_not_found`: 资产不存在
//! - `video`: 视频生成任务失败
//! - `jimeng`: 即梦 API 调用失败
//! - `config`: 配置 / 凭据错误
//! - `internal`: 兜底
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum BackendError {
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("asset not found: id={id}")]
    AssetNotFound { id: String },

    #[error("video task error: task_id={task_id}, reason={reason}")]
    Video { task_id: String, reason: String },

    #[error("jimeng api error: {0}")]
    Jimeng(String),

    #[error("config error: {0}")]
    Config(String),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("internal error: {0}")]
    Internal(String),
}

impl BackendError {
    /// 错误码（前端 `explainError` 按这个判定）
    pub fn code(&self) -> &'static str {
        match self {
            Self::Db(_) => "db",
            Self::Io(_) => "io",
            Self::AssetNotFound { .. } => "asset_not_found",
            Self::Video { .. } => "video",
            Self::Jimeng(_) => "jimeng",
            Self::Config(_) => "config",
            Self::Serde(_) => "serde",
            Self::Internal(_) => "internal",
        }
    }
}

impl Serialize for BackendError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = serializer.serialize_struct("BackendError", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

impl From<BackendError> for String {
    fn from(e: BackendError) -> String {
        e.to_string()
    }
}

impl From<anyhow::Error> for BackendError {
    fn from(e: anyhow::Error) -> Self {
        Self::Internal(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_code_is_stable() {
        assert_eq!(BackendError::Internal("x".into()).code(), "internal");
        assert_eq!(
            BackendError::AssetNotFound { id: "a1".into() }.code(),
            "asset_not_found"
        );
        assert_eq!(BackendError::Jimeng("x".into()).code(), "jimeng");
    }

    #[test]
    fn serde_shape_is_code_and_message() {
        let v = serde_json::to_value(BackendError::AssetNotFound {
            id: "abc-123".into(),
        })
        .unwrap();
        assert_eq!(v["code"], "asset_not_found");
        assert!(v["message"].as_str().unwrap().contains("abc-123"));
    }

    #[test]
    fn db_error_converts_via_from() {
        let db_err = rusqlite::Error::QueryReturnedNoRows;
        let be: BackendError = db_err.into();
        assert_eq!(be.code(), "db");
    }
}