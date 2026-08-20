use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};

const ENDPOINT: &str = "https://ark.cn-beijing.volces.com/api/v3/images/generations";

/// 5.0 Pro 不支持的参数组合：调用前在 Rust 端做护栏，避免回 400 时还要走 explain_error。
fn validate_params(params: &GenerateImageParams) -> Result<(), String> {
    let is_5_0_pro = params.model == "doubao-seedream-5-0-pro-260628";
    let is_4_5_or_4_0 = matches!(
        params.model.as_str(),
        "doubao-seedream-4-5-251128" | "doubao-seedream-4-0-250828"
    );
    if is_5_0_pro && params.sequential_image_generation.is_some() {
        return Err(
            "InvalidParameter: 5.0 Pro 不支持组图（sequential_image_generation）".into(),
        );
    }
    if let Some(fmt) = &params.output_format {
        if is_4_5_or_4_0 && fmt == "png" {
            return Err(
                "InvalidParameter: 该模型仅支持 jpeg 输出（output_format=png 不可用）".into(),
            );
        }
    }
    if let Some(opts) = &params.optimize_prompt_options {
        if let Some(mode) = &opts.mode {
            if mode == "fast"
                && !matches!(
                    params.model.as_str(),
                    "doubao-seedream-5-0-pro-260628" | "doubao-seedream-4-0-250828"
                )
            {
                return Err("InvalidParameter: optimize_prompt_options.mode=fast 仅 5.0 Pro / 4.0 支持".into());
            }
        }
    }
    Ok(())
}

/// Demo 模式：API Key 以 "demo-" 开头时触发。
/// 用于在没有真实 Key 的情况下让 UI 走通，节省 token 调试。
fn is_demo_key(api_key: &str) -> bool {
    api_key.starts_with("demo-")
}

fn make_demo_svg(label: &str) -> String {
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a20"/>
      <stop offset="100%" stop-color="#2a1a4a"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <text x="512" y="480" text-anchor="middle" fill="#7c5cff" font-family="sans-serif" font-size="48" font-weight="600">Y-agent DEMO</text>
  <text x="512" y="540" text-anchor="middle" fill="#a0a0a8" font-family="sans-serif" font-size="22">{label}</text>
  <text x="512" y="600" text-anchor="middle" fill="#6a6a72" font-family="sans-serif" font-size="18">在设置中填入真实即梦 API Key 即可生成真实图像</text>
</svg>"##
    );
    format!("data:image/svg+xml;base64,{}", B64.encode(svg.as_bytes()))
}

#[derive(Debug, Serialize)]
pub struct GenerateImageParams {
    pub model: String,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequential_image_generation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequential_image_generation_options: Option<SequentialOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layer_decomposition: Option<bool>,
    /// 是否在生成图右下角加 "AI生成" 水印。
    /// 即梦/豆包 Seedream API 默认 `true`（加水印），与 Y-agent 期望不符。
    /// 调用方可不传；`generate()` 会补 `false`。
    /// 未来要做 UI 开关时，前端传 `true` 进来即可生效。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub watermark: Option<bool>,
    /// 输出文件格式：仅 5.0 Pro / 5.0 Lite 支持 png|jpeg；4.5/4.0 固定 jpeg。
    /// Y-agent 留 None 时后端不传该字段（走 API 默认）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_format: Option<String>,
    /// 工具调用：当前只支持 `web_search`（5.0 Lite 专属）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolSpec>>,
    /// 提示词优化模式：standard（默认）|fast（5.0 Pro / 4.0 专属）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optimize_prompt_options: Option<OptimizePromptOptions>,
    /// 背景透明：仅 5.0 Pro 专属、图生图场景、PNG 输出。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SequentialOptions {
    pub max_images: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolSpec {
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OptimizePromptOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiResponse {
    data: Vec<ApiImage>,
    #[serde(default)]
    usage: Option<Usage>,
    #[serde(default)]
    error: Option<ApiError>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ApiError {
    pub code: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Usage {
    #[serde(default, rename = "generated_images")]
    pub generated_images: Option<i32>,
    #[serde(default, rename = "input_images")]
    pub input_images: Option<i32>,
    #[serde(default, rename = "output_tokens")]
    pub output_tokens: Option<i32>,
    #[serde(default, rename = "total_tokens")]
    pub total_tokens: Option<i32>,
    #[serde(default, rename = "tool_usage")]
    pub tool_usage: Option<ToolUsage>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ToolUsage {
    #[serde(default, rename = "web_search")]
    pub web_search: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct ApiImage {
    url: Option<String>,
    #[serde(rename = "b64_json", alias = "b64Json")]
    b64_json: Option<String>,
    /// 实际像素尺寸，如 `2048x2048`（仅 5.0 pro / lite 返回）
    #[serde(default)]
    size: Option<String>,
    /// 输出文件格式（仅 5.0 pro / lite 返回）
    #[serde(rename = "output_format", default)]
    output_format: Option<String>,
    /// 图层拆分场景下返回，底图固定为 0
    #[serde(default, alias = "zIndex")]
    z_index: Option<i32>,
    /// 图层名称
    #[serde(default)]
    name: Option<String>,
    /// 图层描述
    #[serde(default)]
    description: Option<String>,
    /// 图层边界框（图层拆分场景，仅 5.0 pro）
    #[serde(default, rename = "bounding_box")]
    bounding_box: Option<BoundingBox>,
    /// 单图错误（组图场景下某张失败时填）
    #[serde(default)]
    error: Option<ApiError>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct BoundingBox {
    /// 输出底图坐标系绝对像素坐标 [left, top, right, bottom]
    #[serde(default)]
    pub absolute: Option<Vec<i32>>,
    /// 归一化坐标 [left, top, right, bottom]（0-1000）
    #[serde(default)]
    pub normalized: Option<Vec<i32>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedImage {
    pub url: String,
    #[serde(default)]
    pub is_base64: bool,
    /// 图层叠放顺序：底图=0，图层从 1 起
    #[serde(skip_serializing_if = "Option::is_none")]
    pub z_index: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// 实际像素尺寸，如 `2048x2048`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    /// 输出文件格式：png|jpeg
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_format: Option<String>,
    /// 图层边界框（图层拆分场景）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bounding_box: Option<BoundingBox>,
    /// 单图错误（组图场景下某张失败时填）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ApiError>,
}

#[derive(Debug, Serialize)]
pub struct GenerateResult {
    pub images: Vec<GeneratedImage>,
    /// 是否走 demo 模式（前端用这个决定是否入库 demo 资产）
    pub is_demo: bool,
    /// API 顶层 usage（生成张数 / token / 工具调用次数等）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,
    /// API 顶层 error（整个请求都没生成图时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ApiError>,
}

/// 调用即梦图像生成 API。
/// 返回的图片以 data URL（若返回 b64_json）或外链 URL 形式。
///
/// 当 API Key 以 "demo-" 开头时进入 demo 模式，返回占位 SVG，不消耗 token。
pub async fn generate(
    api_key: &str,
    params: GenerateImageParams,
) -> anyhow::Result<GenerateResult> {
    // P0：调用前做参数护栏。错误字符串以 `InvalidParameter:` 开头，
    // 这样前端 `explainError` 能识别并给出针对性提示。
    validate_params(&params).map_err(anyhow::Error::msg)?;

    // Demo 模式：返回占位图，不消耗 token
    if is_demo_key(api_key) {
        let count = params
            .sequential_image_generation_options
            .as_ref()
            .map(|o| o.max_images.min(4) as usize)
            .unwrap_or(1);
        let label = if params.prompt.chars().count() > 60 {
            let mut s: String = params.prompt.chars().take(60).collect();
            s.push('…');
            s
        } else {
            params.prompt.clone()
        };
        let url = make_demo_svg(&label);
        return Ok(GenerateResult {
            images: (0..count)
                .map(|i| GeneratedImage {
                    url: url.clone(),
                    is_base64: true,
                    z_index: if i == 0 { Some(0) } else { None },
                    name: None,
                    description: None,
                    size: None,
                    output_format: None,
                    bounding_box: None,
                    error: None,
                })
                .collect(),
            is_demo: true,
            usage: None,
            error: None,
        });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()?;

    // Y-agent 默认行为：永远显式关闭 AI 水印。
    // Seedream API 的 watermark 字段默认是 true（加水印），不传就走默认值。
    // 改成 None 时在这里补 false，保证请求 payload 里一定带 watermark: false。
    let mut body = serde_json::to_value(&params)?;
    if body.get("watermark").is_none() {
        if let Some(obj) = body.as_object_mut() {
            obj.insert("watermark".into(), serde_json::Value::Bool(false));
        }
    }
    log::info!("jimeng request: model={}, prompt_len={}", params.model, params.prompt.len());
    log::debug!("jimeng payload: {}", body);

    let resp = client
        .post(ENDPOINT)
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
    log::debug!("jimeng response: {}", text);

    let parsed: ApiResponse = serde_json::from_str(&text)
        .map_err(|e| anyhow::anyhow!("parse response failed: {e}; body: {text}"))?;

    // 顶层 error 透传：API 在整体失败时会把 code/message 放在这里（data 为空）。
    let top_error = parsed.error.clone();

    let mut out = Vec::with_capacity(parsed.data.len());
    for img in parsed.data {
        // 单图错误：组图场景下某张生成失败会带 error；保留该图占位但把 error 也传过去。
        let per_image_error = img.error.clone();
        let has_url = img.url.is_some();
        let url = if let Some(u) = img.url {
            u
        } else if let Some(b64) = img.b64_json {
            let bare = b64.split(',').next_back().unwrap_or("").trim_end_matches('=');
            if B64.decode(bare).is_err() {
                anyhow::bail!("b64_json is not valid base64");
            }
            if b64.starts_with("data:") {
                b64
            } else {
                format!("data:image/png;base64,{}", b64)
            }
        } else {
            // 没 url 也没 b64_json，但有 error → 跳过（前端不会看到这张图，usage 仍计 1 张成功）
            continue;
        };
        out.push(GeneratedImage {
            url,
            is_base64: !has_url,
            z_index: img.z_index,
            name: img.name,
            description: img.description,
            size: img.size,
            output_format: img.output_format,
            bounding_box: img.bounding_box,
            error: per_image_error,
        });
    }
    if out.is_empty() {
        // 顶层 error 优先展示
        if let Some(e) = top_error {
            let code = e.code.unwrap_or_default();
            let msg = e.message.unwrap_or_default();
            anyhow::bail!("API error ({code}): {msg}");
        }
        anyhow::bail!("API returned no images");
    }
    Ok(GenerateResult {
        images: out,
        is_demo: false,
        usage: parsed.usage,
        error: top_error,
    })
}
