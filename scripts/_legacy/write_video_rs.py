#!/usr/bin/env python3
"""Rewrite src-tauri/src/video.rs as UTF-8 (no BOM). PowerShell `Write` corrupts
CJK characters; Python preserves them.
"""
import sys
from pathlib import Path

VIDEO_RS = Path("E:/Pi/Y-agent/src-tauri/src/video.rs")

CONTENT = r'''//! MiniMax H3 视频生成 API 客户端。
//!
//! - **POST** `https://api.minimaxi.com/v2/video_generation` 异步提交 → 返回 `task_id`
//! - **GET**  `https://api.minimaxi.com/v2/query/video_generation/{task_id}` 轮询
//!
//! 当前仅支持模型 `MiniMax-H3`（v1 唯一选择）。三种场景：
//! - t2va (text → video)：仅 text，ratio 必填且 ≠ adaptive
//! - i2va (image → video)：text + 1-2 张图（first_frame / last_frame），ratio 强制 adaptive
//! - r2va (multimodal reference → video)：text + reference_image + reference_video + reference_audio 组合
//!
//! Demo 模式：API Key 以 "demo-" 开头时走占位返回（不消耗 token），由调用方识别后跳过真实 API。
//!
//! 出错时返回 `Err`，字符串以 `InvalidParameter:` / `API error (...)` / `parse ...` 等前缀开头，
//! 这样前端 `explainError` 能识别并给出针对性提示。

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;

// ============================================================================
// Endpoint
// ============================================================================

const VIDEO_SUBMIT: &str = "https://api.minimaxi.com/v2/video_generation";
const VIDEO_QUERY: &str = "https://api.minimaxi.com/v2/query/video_generation";

pub const VIDEO_MODEL: &str = "MiniMax-H3";

// ============================================================================
// 请求 / 响应类型
// ============================================================================

/// 单个 content 项。前端构造完直接序列化为 JSON。
///
/// `image_url` / `video_url` / `audio_url` 三选一（由 `type` 决定）。
/// role 字段在 i2va（first_frame/last_frame）和 r2va（reference_image/video/audio）下必填。
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentItem {
    Text {
        text: String,
    },
    ImageUrl {
        image_url: ImageUrlRef,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        role: Option<String>,
    },
    VideoUrl {
        video_url: UrlRef,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        role: Option<String>,
    },
    AudioUrl {
        audio_url: UrlRef,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        role: Option<String>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageUrlRef {
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UrlRef {
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct VideoSubmitReq {
    pub model: String, // 固定 "MiniMax-H3"
    pub content: Vec<ContentItem>,
    pub resolution: String, // "768P" | "2K"
    pub duration: u32,      // 4..=15
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ratio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aigc_watermark: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub callback_url: Option<String>, // v1 不实现，预留
}

#[derive(Debug, Deserialize)]
pub struct VideoSubmitResp {
    pub task_id: String,
    #[serde(default)]
    pub base_resp: Option<Value>,
}

// ============================================================================
// 任务对象（轮询返回 / 状态机）
// ============================================================================

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VideoTask {
    pub task_id: String,
    /// queued | running | succeeded | failed | cancelled
    pub status: String,
    /// 成功时才有
    pub url: Option<String>,
    pub error: Option<VideoTaskError>,
    pub resolution: Option<String>,
    pub duration: Option<u32>,
    pub ratio: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct VideoTaskError {
    pub code: Option<String>,
    pub message: Option<String>,
}

// Query 端返回结构（嵌套在 task 字段里）
#[derive(Debug, Deserialize)]
struct QueryResp {
    task: QueryTask,
}

#[derive(Debug, Deserialize)]
struct QueryTask {
    id: String,
    status: String,
    #[serde(default)]
    error: Option<VideoTaskError>,
    #[serde(default)]
    content: Option<QueryContent>,
    #[serde(default)]
    resolution: Option<String>,
    #[serde(default)]
    duration: Option<u32>,
    #[serde(default)]
    ratio: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QueryContent {
    #[serde(default)]
    url: Option<String>,
}

impl From<QueryTask> for VideoTask {
    fn from(t: QueryTask) -> Self {
        Self {
            task_id: t.id,
            status: t.status,
            url: t.content.and_then(|c| c.url),
            error: t.error,
            resolution: t.resolution,
            duration: t.duration,
            ratio: t.ratio,
        }
    }
}

// ============================================================================
// Demo 模式
// ============================================================================

pub fn is_demo_key(api_key: &str) -> bool {
    api_key.starts_with("demo-")
}

// ============================================================================
// 参数护栏
// ============================================================================

/// 提交前在 Rust 端做参数校验，避免回 400 时还要走 explain_error。
/// 错误字符串以 `InvalidParameter:` 开头，便于前端识别。
pub fn validate_submit_params(req: &VideoSubmitReq) -> Result<(), String> {
    if req.model != VIDEO_MODEL {
        return Err(format!(
            "InvalidParameter: 视频模型当前仅支持 \'{VIDEO_MODEL}\'（收到 \'{}\'）",
            req.model
        ));
    }
    if !matches!(req.resolution.as_str(), "768P" | "2K") {
        return Err(format!(
            "InvalidParameter: 分辨率必须是 \'768P\' 或 \'2K\'（收到 \'{}\'）",
            req.resolution
        ));
    }
    if !(4..=15).contains(&req.duration) {
        return Err(format!(
            "InvalidParameter: 视频时长必须是 4..=15 秒整数（收到 {}）",
            req.duration
        ));
    }
    // content 至少 1 个 text 且非空
    let has_text = req.content.iter().any(|c| match c {
        ContentItem::Text { text } => !text.trim().is_empty(),
        _ => false,
    });
    if !has_text {
        return Err("InvalidParameter: content 必须包含一个非空 text 项（prompt is required）".into());
    }

    // 场景判定 + ratio 规则
    let scenario = detect_scenario(&req.content)?;
    let ratio = req.ratio.as_deref().unwrap_or("");

    match scenario.as_str() {
        "t2va" => {
            if ratio.is_empty() {
                return Err("InvalidParameter: t2va 场景必须指定 ratio（21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16）".into());
            }
            if ratio == "adaptive" {
                return Err("InvalidParameter: t2va 场景 ratio 不能是 \'adaptive\'（必须显式指定）".into());
            }
        }
        "i2va" => {
            // i2va: ratio 强制 adaptive（图片决定）。前端传了别的也不报错，submit 阶段会覆盖。
        }
        "r2va" => {
            // r2va: ratio 可选，默认 adaptive
        }
        _ => {}
    }
    Ok(())
}

/// 检测场景。返回 "t2va" | "i2va" | "r2va"。
/// 参考官方文档：
/// - r2va: content 含 `reference_image` / `reference_video` / `reference_audio`
/// - i2va: content 含 `first_frame` / `last_frame` 且不含 reference_*
/// - t2va: 其它
pub fn detect_scenario(content: &[ContentItem]) -> Result<String, String> {
    let mut has_ref = false;
    let mut has_frame = false;
    for item in content {
        let role = match item {
            ContentItem::Text { .. } => None,
            ContentItem::ImageUrl { role, .. } => role.as_deref(),
            ContentItem::VideoUrl { role, .. } => role.as_deref(),
            ContentItem::AudioUrl { role, .. } => role.as_deref(),
        };
        match role {
            Some("reference_image") | Some("reference_video") | Some("reference_audio") => {
                has_ref = true;
            }
            Some("first_frame") | Some("last_frame") => {
                has_frame = true;
            }
            _ => {}
        }
    }
    if has_ref && has_frame {
        return Err("InvalidParameter: 图生视频（first_frame/last_frame）与多模态参考（reference_*）互斥".into());
    }
    Ok(if has_ref {
        "r2va".into()
    } else if has_frame {
        "i2va".into()
    } else {
        "t2va".into()
    })
}

/// 按场景修正 ratio：
/// - t2va: 保持原样（已在 validate 阶段保证非空且 ≠ adaptive）
/// - i2va: 强制 "adaptive"
/// - r2va: 空 → "adaptive"
pub fn fix_ratio_for_scenario(scenario: &str, ratio: Option<String>) -> Option<String> {
    match scenario {
        "i2va" => Some("adaptive".to_string()),
        "r2va" => Some(ratio.unwrap_or_else(|| "adaptive".to_string())),
        _ => ratio, // t2va: 保持
    }
}

// ============================================================================
// HTTP 调用
// ============================================================================

/// 提交视频生成任务。返回 task_id。
/// Demo 模式不调真实 API，返回一个虚拟 task_id（"demo-..."），由调用方在
/// 轮询路径里识别后走占位返回。
pub async fn submit(api_key: &str, req: VideoSubmitReq) -> anyhow::Result<String> {
    // 参数护栏
    validate_submit_params(&req).map_err(anyhow::Error::msg)?;

    if is_demo_key(api_key) {
        let fake_id = format!(
            "demo-{}",
            uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("0")
        );
        log::info!("video submit (demo): task_id={}", fake_id);
        return Ok(fake_id);
    }

    // 按场景修正 ratio
    let scenario = detect_scenario(&req.content).map_err(anyhow::Error::msg)?;
    let fixed_req = VideoSubmitReq {
        ratio: fix_ratio_for_scenario(&scenario, req.ratio),
        ..req
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()?;
    let body = serde_json::to_value(&fixed_req)?;
    log::info!(
        "video submit: model={}, scenario={}, duration={}, resolution={}, content_items={}",
        fixed_req.model,
        scenario,
        fixed_req.duration,
        fixed_req.resolution,
        fixed_req.content.len()
    );
    log::debug!("video submit payload: {}", body);

    let resp = client
        .post(VIDEO_SUBMIT)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    let status = resp.status();
    let text = resp.text().await?;
    if !status.is_success() {
        anyhow::bail!("API {}: {}", status.as_u16(), text);
    }
    log::debug!("video submit response: {}", text);

    let parsed: VideoSubmitResp = serde_json::from_str(&text)
        .map_err(|e| anyhow::anyhow!("parse submit response failed: {e}; body: {text}"))?;
    Ok(parsed.task_id)
}

/// 查询任务状态。Demo 模式返回固定 succeeded + 占位 mp4（项目内置）。
pub async fn query(api_key: &str, task_id: &str) -> anyhow::Result<VideoTask> {
    if is_demo_key(api_key) || task_id.starts_with("demo-") {
        return Ok(VideoTask {
            task_id: task_id.to_string(),
            status: "succeeded".to_string(),
            url: if DEMO_VIDEO_B64.is_empty() {
                // 没真实 demo 视频，前端会渲染 placeholder 卡片
                None
            } else {
                Some(format!("data:video/mp4;base64,{}", DEMO_VIDEO_B64.trim()))
            },
            error: None,
            resolution: Some("768P".to_string()),
            duration: Some(5),
            ratio: Some("16:9".to_string()),
        });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    let url = format!("{}/{}", VIDEO_QUERY, task_id);
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await?;
    let status = resp.status();
    let text = resp.text().await?;
    if !status.is_success() {
        anyhow::bail!("API {}: {}", status.as_u16(), text);
    }
    log::debug!("video query response: {}", text);

    let parsed: QueryResp = serde_json::from_str(&text)
        .map_err(|e| anyhow::anyhow!("parse query response failed: {e}; body: {text}"))?;
    Ok(parsed.task.into())
}

// ============================================================================
// 占位 mp4（Demo 模式用）
// ============================================================================

/// Demo 模式用的占位视频。
///
/// - v1：留空（前端 fallback 走 placeholder 卡片，不阻塞流程）。
///        要播 demo 视频时，把下面替换成一段真实 mp4 的 base64（≤100KB），
///        或者改成 `include_bytes!("../assets/demo-video.mp4")` 然后用 B64.encode。
/// - v2：建议把 demo-video.mp4 放 `src-tauri/assets/`，运行时读 + 走 asset:// 协议。
const DEMO_VIDEO_B64: &str = "";

// ============================================================================
// OAI 错误响应（与 jimeng.rs 风格一致）
// ============================================================================

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OaiErrorEnvelope {
    #[serde(rename = "type", default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub error: Option<OaiErrorDetail>,
    #[serde(default)]
    pub request_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OaiErrorDetail {
    #[serde(rename = "type", default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default, rename = "http_code")]
    pub http_code: Option<String>,
}

// 把 "data:video/mp4;base64,..." 解析回 base64 字符串（给前端用，少数情况需要）
#[allow(dead_code)]
pub fn parse_data_url(data_url: &str) -> Option<(&str, Vec<u8>)> {
    let (header, b64) = data_url.split_once(',')?;
    let mime = header
        .strip_prefix("data:")
        .and_then(|s| s.split(';').next())?;
    let bytes = B64.decode(b64).ok()?;
    Some((mime, bytes))
}
'''


def main() -> int:
    # Write as UTF-8 without BOM
    VIDEO_RS.write_text(CONTENT, encoding="utf-8")
    print(f"wrote {VIDEO_RS} ({len(CONTENT)} chars)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
