//! H3-Context-IR 视频提示词增强 API 客户端。
//!
//! ## 调用流程
//! - **POST** `https://api.minimaxi.com/v2/h3_context_ir` 异步提交 → 返回 `task_id`
//! - **GET**  `https://api.minimaxi.com/v2/query/video_generation/{task_id}` 轮询
//!   （**和 video_generation 共享端点**，靠响应里 `task_type === "h3_context_ir"` 区分）
//!
//! ## 失败兜底约定（重要）
//! 本模块对外的 `optimize()` 函数**永远不返回 `Err`**：
//! - API 失败 / 网络断开 / 轮询超时 → 静默降级，返回 `OptimizeResult { prompt: 原 prompt, is_optimized: false, reason }`
//! - 调用方（前端）按 `is_optimized` 决定是否弹"优化跳过"的 toast
//! - 视频生成始终能继续，**不因为增强失败而中断**
//!
//! ## Demo 模式
//! API Key 以 `demo-` 开头时，**不调真实 API**，直接返回合成增强 prompt，
//! 完整 UI 流程可在 demo 模式跑通。沿用 `video::is_demo_key()`。
//!
//! ## 错误码到 OptimizeReason 的映射
//! 参考 doc/api-integration.md § 7.6：400/2013、401/1004、402/1008、422/1026、429/1002、500/1000。
//! 解析方式：抓响应体里 `(...)\d+` 形式的内部码。
//!
//! ## 复用
//! - `video::ContentItem` — 入参 content 形状和 video_generation 一致
//! - `video::is_demo_key` — demo 模式判定
//! - `video::POLL_INTERVAL` / `POLL_QUERY_RETRIES` 不复用（常量非 pub），
//!   本模块自带（60s 总超时 / 3 次 poll 失败），值不同

use crate::video::{is_demo_key, ContentItem};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

// ============================================================================
// Endpoint
// ============================================================================

const H3_SUBMIT: &str = "https://api.minimaxi.com/v2/h3_context_ir";
const H3_QUERY: &str = "https://api.minimaxi.com/v2/query/video_generation";

/// H3-Context-IR 单个 text 元素的最大字符数（参考官方文档 ContentItem.text）
const H3_MAX_TEXT_LEN: usize = 7000;

/// 单次同步 submit + poll 的总超时。H3 样例 5s t2va 约 29s；
/// i2va/r2va 多模态可能更慢，给 60s 兜底。
const OPTIMIZE_TIMEOUT: Duration = Duration::from_secs(60);

/// 轮询间隔。和 video::POLL_INTERVAL 保持一致。
const POLL_INTERVAL: Duration = Duration::from_secs(3);

/// 连续 poll 失败次数上限。超过标记 network 错误。
const POLL_QUERY_RETRIES: u32 = 3;

// ============================================================================
// 请求 / 响应类型
// ============================================================================

/// 提交请求。和 video_generation 比少了 `resolution`（H3 不产视频）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct H3ContextIRReq {
    pub model: String, // 固定 "MiniMax-H3"
    pub content: Vec<ContentItem>,
    pub duration: u32, // 4..=15
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ratio: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct H3SubmitResp {
    pub task_id: String,
}

/// 轮询响应（嵌套在 task 字段里）。
///
/// H3 任务的 `task_type === "h3_context_ir"`，**不**走 video_generation 路径。
/// 成功时 `content.prompt` 才是增强 prompt。
#[derive(Debug, Deserialize)]
struct QueryResp {
    task: QueryTask,
}

#[derive(Debug, Deserialize)]
struct QueryTask {
    id: String,
    status: String,
    #[serde(default)]
    task_type: Option<String>,
    #[serde(default)]
    content: Option<QueryContent>,
    #[serde(default)]
    error: Option<VideoTaskErrorLike>,
}

/// 复用 video::VideoTaskError 形状（两个文件各自定义一次，避免循环依赖）
#[derive(Debug, Deserialize)]
struct VideoTaskErrorLike {
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QueryContent {
    #[serde(default)]
    prompt: Option<String>,
}

// ============================================================================
// 优化结果（前端友好，失败也返回）
// ============================================================================

/// 优化结果的状态/原因。前端按 `is_optimized` 决定弹什么 toast。
///
/// 序列化时用 snake_case 字符串（前端 TS 用 `OptimizeReason` union 接收）。
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OptimizeReason {
    /// 真实 API 增强成功
    Ok,
    /// Demo 模式（key 以 demo- 开头），不调真实 API
    Demo,
    /// 用户主动关闭（前端在 onSubmitVideo 里跳过整个流程；正常不会进 Rust）
    Skipped,
    /// API 限流 (429/1002)
    RateLimit,
    /// 鉴权失败 (401/1004)
    Auth,
    /// 余额不足 (402/1008)
    InsufficientBalance,
    /// 内容敏感 (422/1026)
    Sensitive,
    /// 参数错误 (400/2013)
    InvalidParam,
    /// 轮询超过 60s 总超时
    Timeout,
    /// 连续 3 次 poll 失败
    Network,
    /// 响应解析失败 / 字段缺失
    Parse,
    /// content.prompt 为空
    EmptyResponse,
}

impl OptimizeReason {
    /// 从 API 错误消息的括号内提取 (1004) 这种内部码 → 转 OptimizeReason。
    /// 解析失败时回退 Network。
    fn from_api_code(code: Option<&str>, message: Option<&str>) -> Self {
        // 优先用结构化 code 字段（如果有）
        if let Some(c) = code {
            match c {
                "1002" => return Self::RateLimit,
                "1004" => return Self::Auth,
                "1008" => return Self::InsufficientBalance,
                "1026" => return Self::Sensitive,
                "2013" => return Self::InvalidParam,
                _ => {}
            }
        }
        // 退化：从 message 里抓 "(NNNN)" 形式
        if let Some(msg) = message {
            // 简单正则：找最后一个 (...) 里的纯数字
            if let Some(start) = msg.rfind('(') {
                if let Some(end) = msg[start..].find(')') {
                    let inner = &msg[start + 1..start + end];
                    if let Ok(num) = inner.trim().parse::<u32>() {
                        return match num {
                            1002 => Self::RateLimit,
                            1004 => Self::Auth,
                            1008 => Self::InsufficientBalance,
                            1026 => Self::Sensitive,
                            2013 => Self::InvalidParam,
                            _ => Self::Network,
                        };
                    }
                }
            }
        }
        Self::Network
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeResult {
    /// 最终给 video_generation 用的 text。
    /// - 增强成功：H3 返回的增强 prompt
    /// - 增强失败 / 跳过：原 prompt 透传（保证视频生成不会因增强失败而崩）
    pub prompt: String,
    /// 是否真的被 H3 增强过。
    /// - true → 弹"已优化"
    /// - false → 弹"优化跳过（reason）"
    pub is_optimized: bool,
    pub reason: OptimizeReason,
}

// ============================================================================
// Demo 模式
// ============================================================================

fn demo_optimized_prompt(original: &str) -> String {
    // 简单合成：原 prompt 前缀 + 电影感后缀。够让 UI 看出"增强过了"即可。
    format!(
        "[AI 增强 Demo] {} · 电影感运镜, 暖色灯光, 24fps, 浅景深",
        original.trim()
    )
}

// ============================================================================
// 参数护栏
// ============================================================================

/// 提交前在 Rust 端做参数校验，避免回 400 时还要走 explain_error。
/// 错误字符串以 `InvalidParameter:` 开头，便于前端识别。
pub fn validate_submit_params(req: &H3ContextIRReq) -> Result<(), String> {
    if req.model != crate::video::VIDEO_MODEL {
        return Err(format!(
            "InvalidParameter: 视频模型当前仅支持 \'{}\'（收到 \'{}\'）",
            crate::video::VIDEO_MODEL,
            req.model
        ));
    }
    if !(4..=15).contains(&req.duration) {
        return Err(format!(
            "InvalidParameter: 时长必须是 4..=15 秒整数（收到 {}）",
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
    // ratio 规则和 video_generation 一致：
    // - 有 first_frame/last_frame（图生视频） → adaptive
    // - 有 reference_*（多模态） → adaptive 或具体值
    // - 仅 text（文生视频） → 必填且 ≠ adaptive
    let scenario = crate::video::detect_scenario(&req.content).map_err(|e| {
        // detect_scenario 返回的已经是 "InvalidParameter: ..." 形式
        e
    })?;
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
            // 强制 adaptive（图片决定）
        }
        "r2va" => {
            // 可选，默认 adaptive
        }
        _ => {}
    }
    Ok(())
}

// ============================================================================
// HTTP 调用：submit + poll（同步版）
// ============================================================================

/// 同步执行 submit + poll，返回最终结果。
///
/// **永远不返回 `Err`**——所有失败都通过 `OptimizeResult { is_optimized: false, reason }` 表达。
/// 调用方可以直接 `let result = h3_context_ir::optimize(...).await;` 不需要 try/catch。
pub async fn optimize(
    api_key: &str,
    req: H3ContextIRReq,
    original_prompt: &str,
) -> OptimizeResult {
    // 0. Demo 模式：直接返回合成增强 prompt，不调 HTTP
    if is_demo_key(api_key) {
        log::info!("h3 optimize (demo) for prompt: {}", truncate_for_log(original_prompt));
        return OptimizeResult {
            prompt: demo_optimized_prompt(original_prompt),
            is_optimized: true,
            reason: OptimizeReason::Demo,
        };
    }

    // 1. 参数护栏（参数错误是程序员 bug，应该 Err 出去）
    if let Err(e) = validate_submit_params(&req) {
        log::warn!("h3 optimize invalid params: {e}");
        return OptimizeResult {
            prompt: original_prompt.to_string(),
            is_optimized: false,
            reason: OptimizeReason::InvalidParam,
        };
    }

    // 2. Submit
    let submit_result = submit(api_key, &req).await;
    let task_id = match submit_result {
        Ok(id) => id,
        Err(e) => {
            log::warn!("h3 optimize submit failed: {e}");
            let reason = parse_submit_error(&e);
            return OptimizeResult {
                prompt: original_prompt.to_string(),
                is_optimized: false,
                reason,
            };
        }
    };
    log::info!("h3 optimize submitted: task_id={task_id}");

    // 3. Poll 循环
    let start = Instant::now();
    let mut consecutive_query_failures: u32 = 0;
    loop {
        // 3a. 总超时
        if start.elapsed() > OPTIMIZE_TIMEOUT {
            log::warn!("h3 optimize task {task_id} timed out after {OPTIMIZE_TIMEOUT:?}");
            return OptimizeResult {
                prompt: original_prompt.to_string(),
                is_optimized: false,
                reason: OptimizeReason::Timeout,
            };
        }

        // 3b. 单次 query
        match query(api_key, &task_id).await {
            Ok(task) => {
                consecutive_query_failures = 0;
                match task.status.as_str() {
                    "queued" | "running" => {
                        // 继续轮询
                    }
                    "succeeded" => {
                        // 校验 task_type 是不是 h3_context_ir（防御性）
                        if let Some(tt) = &task.task_type {
                            if tt != "h3_context_ir" {
                                log::warn!(
                                    "h3 optimize task {task_id} has unexpected task_type={tt}; treating as Parse error"
                                );
                                return OptimizeResult {
                                    prompt: original_prompt.to_string(),
                                    is_optimized: false,
                                    reason: OptimizeReason::Parse,
                                };
                            }
                        }
                        // 提取 prompt
                        match task.content {
                            Some(c) => match c.prompt {
                                Some(p) if !p.trim().is_empty() => {
                                    // 截断到 H3_MAX_TEXT_LEN
                                    let trimmed = if p.len() > H3_MAX_TEXT_LEN {
                                        log::warn!(
                                            "h3 optimize prompt too long ({} chars), truncating to {}",
                                            p.len(),
                                            H3_MAX_TEXT_LEN
                                        );
                                        // 安全截断到最近的换行 / 空格，避免半字
                                        truncate_safely(&p, H3_MAX_TEXT_LEN)
                                    } else {
                                        p
                                    };
                                    log::info!(
                                        "h3 optimize task {task_id} succeeded, prompt_len={}",
                                        trimmed.len()
                                    );
                                    return OptimizeResult {
                                        prompt: trimmed,
                                        is_optimized: true,
                                        reason: OptimizeReason::Ok,
                                    };
                                }
                                _ => OptimizeResult {
                                    prompt: original_prompt.to_string(),
                                    is_optimized: false,
                                    reason: OptimizeReason::EmptyResponse,
                                },
                            },
                            None => OptimizeResult {
                                prompt: original_prompt.to_string(),
                                is_optimized: false,
                                reason: OptimizeReason::EmptyResponse,
                            },
                        };
                    }
                    "failed" => {
                        let reason = OptimizeReason::from_api_code(
                            task.error.as_ref().and_then(|e| e.code.as_deref()),
                            task.error.as_ref().and_then(|e| e.message.as_deref()),
                        );
                        log::warn!(
                            "h3 optimize task {task_id} failed: {:?} (msg={})",
                            reason,
                            task.error
                                .as_ref()
                                .and_then(|e| e.message.clone())
                                .unwrap_or_default()
                        );
                        return OptimizeResult {
                            prompt: original_prompt.to_string(),
                            is_optimized: false,
                            reason,
                        };
                    }
                    "cancelled" => {
                        log::info!("h3 optimize task {task_id} cancelled by server");
                        return OptimizeResult {
                            prompt: original_prompt.to_string(),
                            is_optimized: false,
                            reason: OptimizeReason::Network,
                        };
                    }
                    other => {
                        log::warn!("h3 optimize task {task_id} unknown status: {other}");
                    }
                }
            }
            Err(e) => {
                consecutive_query_failures += 1;
                log::warn!(
                    "h3 optimize query failed ({consecutive_query_failures}/{POLL_QUERY_RETRIES}): {e}"
                );
                if consecutive_query_failures >= POLL_QUERY_RETRIES {
                    return OptimizeResult {
                        prompt: original_prompt.to_string(),
                        is_optimized: false,
                        reason: OptimizeReason::Network,
                    };
                }
            }
        }

        // 3c. 睡 POLL_INTERVAL
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

/// 提交 H3-Context-IR 任务。返回 task_id。
async fn submit(api_key: &str, req: &H3ContextIRReq) -> anyhow::Result<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    let body = serde_json::to_value(req)?;
    log::debug!("h3 submit payload: {}", body);

    let resp = client
        .post(H3_SUBMIT)
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
    log::debug!("h3 submit response: {}", text);

    let parsed: H3SubmitResp = serde_json::from_str(&text)
        .map_err(|e| anyhow::anyhow!("parse h3 submit response failed: {e}; body: {text}"))?;
    Ok(parsed.task_id)
}

/// 轮询 H3 任务状态。返回最小结构（含 task_type / content.prompt）。
async fn query(api_key: &str, task_id: &str) -> anyhow::Result<H3TaskSnapshot> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()?;
    let url = format!("{}/{}", H3_QUERY, task_id);
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
    log::debug!("h3 query response: {}", text);

    let parsed: QueryResp = serde_json::from_str(&text)
        .map_err(|e| anyhow::anyhow!("parse h3 query response failed: {e}; body: {text}"))?;
    Ok(parsed.task.into())
}

/// H3 轮询响应的最小 task 视图。
#[derive(Debug)]
struct H3TaskSnapshot {
    #[allow(dead_code)]
    id: String,
    status: String,
    task_type: Option<String>,
    content: Option<QueryContent>,
    error: Option<VideoTaskErrorLike>,
}

impl From<QueryTask> for H3TaskSnapshot {
    fn from(t: QueryTask) -> Self {
        Self {
            id: t.id,
            status: t.status,
            task_type: t.task_type,
            content: t.content,
            error: t.error,
        }
    }
}

/// 从 submit 错误消息里解析 (code) 后缀 → OptimizeReason。
fn parse_submit_error(err: &anyhow::Error) -> OptimizeReason {
    let msg = err.to_string();
    // 用 from_api_code 但 code = None（让它从 message 里抓）
    OptimizeReason::from_api_code(None, Some(&msg))
}

// ============================================================================
// 工具函数
// ============================================================================

fn truncate_for_log(s: &str) -> String {
    if s.len() > 80 {
        format!("{}…", &s[..80])
    } else {
        s.to_string()
    }
}

/// 把 s 安全截断到 ≤ max_chars，优先在最近的边界（\n / ' / ' '）切。
/// 不够时硬切到 max_chars。
fn truncate_safely(s: &str, max_chars: usize) -> String {
    if s.len() <= max_chars {
        return s.to_string();
    }
    let mut end = max_chars;
    // 在 [end-50, end] 区间内找最近的换行或空格
    let lower = end.saturating_sub(50);
    for (i, c) in s.char_indices().skip(lower) {
        if i >= end {
            break;
        }
        if c == '\n' {
            end = i;
            break;
        }
    }
    // 兜底硬切
    s[..end].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_safely_short_passthrough() {
        assert_eq!(truncate_safely("hello", 10), "hello");
    }

    #[test]
    fn truncate_safely_hard_cut() {
        let s = "a".repeat(100);
        let r = truncate_safely(&s, 50);
        assert_eq!(r.len(), 50);
    }

    #[test]
    fn truncate_safely_prefers_newline() {
        let s = format!("{}\nrest", "a".repeat(80));
        let r = truncate_safely(&s, 80);
        // 应该在 80 附近的换行（80 = "a"x80 后正好 \n）处切
        assert!(r.ends_with("a".repeat(80).as_str()));
    }

    #[test]
    fn from_api_code_via_structured_code() {
        assert_eq!(
            OptimizeReason::from_api_code(Some("1002"), None),
            OptimizeReason::RateLimit
        );
        assert_eq!(
            OptimizeReason::from_api_code(Some("1004"), None),
            OptimizeReason::Auth
        );
        assert_eq!(
            OptimizeReason::from_api_code(Some("1026"), None),
            OptimizeReason::Sensitive
        );
        assert_eq!(
            OptimizeReason::from_api_code(Some("2013"), None),
            OptimizeReason::InvalidParam
        );
    }

    #[test]
    fn from_api_code_via_message() {
        assert_eq!(
            OptimizeReason::from_api_code(None, Some("rate limit, please retry later (1002)")),
            OptimizeReason::RateLimit
        );
        assert_eq!(
            OptimizeReason::from_api_code(None, Some("video description contains sensitive content (1026)")),
            OptimizeReason::Sensitive
        );
    }

    #[test]
    fn from_api_code_unknown_falls_back_to_network() {
        assert_eq!(
            OptimizeReason::from_api_code(None, Some("connection reset")),
            OptimizeReason::Network
        );
    }

    #[test]
    fn demo_optimized_prompt_contains_original() {
        let out = demo_optimized_prompt("宇航员跳舞");
        assert!(out.contains("宇航员跳舞"));
        assert!(out.contains("电影感"));
    }

    #[test]
    fn validate_t2va_missing_ratio() {
        let req = H3ContextIRReq {
            model: "MiniMax-H3".into(),
            content: vec![ContentItem::Text {
                text: "x".into(),
            }],
            duration: 5,
            ratio: None,
        };
        assert!(validate_submit_params(&req).is_err());
    }

    #[test]
    fn validate_t2va_valid() {
        let req = H3ContextIRReq {
            model: "MiniMax-H3".into(),
            content: vec![ContentItem::Text {
                text: "x".into(),
            }],
            duration: 5,
            ratio: Some("16:9".into()),
        };
        assert!(validate_submit_params(&req).is_ok());
    }

    /// P9 回归:content 缺 text 必须校验失败(与 video_generation 一致)。
    /// 之前 P9 实现里前端误把 videoContent(不含 text)当 h3 content 传,Rust 端会拒。
    #[test]
    fn validate_missing_text_in_content_fails() {
        // 只有 image,没 text
        let req = H3ContextIRReq {
            model: "MiniMax-H3".into(),
            content: vec![ContentItem::ImageUrl {
                image_url: crate::video::ImageUrlRef {
                    url: "data:image/png;base64,xxx".into(),
                },
                role: Some("first_frame".into()),
            }],
            duration: 5,
            ratio: Some("16:9".into()),
        };
        let err = validate_submit_params(&req).unwrap_err();
        assert!(
            err.contains("text") || err.contains("prompt"),
            "expected error to mention text/prompt, got: {err}"
        );
    }

    /// P9 回归:text 全空白也算缺(用 trim().is_empty())。
    #[test]
    fn validate_blank_text_fails() {
        let req = H3ContextIRReq {
            model: "MiniMax-H3".into(),
            content: vec![ContentItem::Text { text: "   ".into() }],
            duration: 5,
            ratio: Some("16:9".into()),
        };
        assert!(validate_submit_params(&req).is_err());
    }

    /// P9 回归:i2va 场景 text + first_frame 同时存在应通过。
    #[test]
    fn validate_i2va_with_text_passes() {
        let req = H3ContextIRReq {
            model: "MiniMax-H3".into(),
            content: vec![
                ContentItem::Text { text: "push in slowly".into() },
                ContentItem::ImageUrl {
                    image_url: crate::video::ImageUrlRef {
                        url: "data:image/png;base64,xxx".into(),
                    },
                    role: Some("first_frame".into()),
                },
            ],
            duration: 5,
            ratio: Some("adaptive".into()),
        };
        assert!(validate_submit_params(&req).is_ok());
    }
}
