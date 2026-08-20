﻿# Y-agent API 集成笔记

> 即梦（豆包 Seedream）API + LLM Provider 集成的所有细节、坑、调优点。
> 是踩了 N 次坑之后的实操记录，不是 API 官方文档的复制。

---

## Part 0. 模型能力矩阵（P0）

> 数据源：`src/lib/types.ts::MODEL_OPTIONS[*].capabilities`，由 UI 用来动态显隐参数。
> 后端 `src-tauri/src/jimeng.rs::validate_params` 用 model id 做同样的硬校验。

| 模型 ID | 文生图 | 组图 | 图层拆分 | 交互编辑 | 联网搜索 | 流式 | 极速 | 透明背景 | 输出格式 | size 档位 |
|---|---|---|---|---|---|---|---|---|---|---|
| `doubao-seedream-5-0-lite-260128` | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | png/jpeg | 2K/3K/4K |
| `doubao-seedream-5-0-260128`（lite 别名） | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | png/jpeg | 2K/3K/4K |
| `doubao-seedream-4-5-251128` | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | 仅 jpeg | 2K/4K |
| `doubao-seedream-4-0-250828` | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | 仅 jpeg | 1K/2K/4K |
| `doubao-seedream-5-0-pro-260628` | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | png/jpeg | 1K/1.5K/2K |

**关键约束**：
- 5.0 Pro 不支持组图、流式、联网搜索；专门做"图层拆分 + 交互编辑 + 透明背景"
- 4.5 / 4.0 输出格式固定 jpeg，UI 的 PNG 开关会隐藏
- `optimize_prompt_options.mode=fast` 仅 5.0 Pro / 4.0 支持
- 输入参考图上限：Pro 10 张，其它 14 张（Y-agent UI 暂只支持 4 张，未来扩）
- 图层最大 16 个（5.0 Pro 专属）
- 组图最多 15 张（含输入参考图总和；Y-agent UI 暂只允许 1~4 张）

---

## Part 1. 即梦（豆包 Seedream）API

### 1.1 接入基础

- **Endpoint**：`https://ark.cn-beijing.volces.com/api/v3/images/generations`
- **认证**：`Authorization: Bearer <API_KEY>`
- **请求体**：JSON
- **控制台**：[火山方舟](https://console.volcengine.com/ark/region:cn-beijing/apiKey) 开 Key + 开通模型

### 1.2 支持的模型

| 模型 ID | 用途 | 图层拆分 | 组图 | 默认状态 |
|---|---|---|---|---|
| `doubao-seedream-5-0-lite-260128` | **默认**，多数账号已开通 | ❌ | ✅ | 开箱即用 |
| `doubao-seedream-4-5-251128` | 备选 | ❌ | ✅ | 开箱即用 |
| `doubao-seedream-4-0-250828` | 备选 | ❌ | ✅ | 开箱即用 |
| `doubao-seedream-5-0-pro-260628` | **M2 重点**，图层拆分 + 交互编辑 | ✅ | ❌ | **需手动开通** |

**自定义**：用户在「设置」里可以填任意 Endpoint ID（火山方舟支持自定义推理接入点）。

### 1.3 请求参数

Y-agent 实际用到的（`src-tauri/src/jimeng.rs::GenerateImageParams`）：

```typescript
{
  model: string,                 // 模型 ID
  prompt: string,                // 中文/英文 prompt
  image?: string[],              // 参考图（dataURL / 外链 URL）
  size?: "1k" | "1.5k" | "2k" | "3k" | "4k",   // ⚠️ 必须小写
  sequential_image_generation?: "auto",         // 组图时必填，**不要传 "disabled"**
  sequential_image_generation_options?: { max_images: number },  // 1-15
  response_format: "url",        // Y-agent 固定 "url"
  layer_decomposition?: boolean, // 仅 5.0 Pro 支持
  watermark: false,              // ⚠️ 必须显式 false，否则默认带 "AI生成" 水印
  output_format?: "png" | "jpeg",          // P0：仅 5.0 Pro/Lite；4.5/4.0 固定 jpeg
  tools?: [{ type: "web_search" }],        // P0：仅 5.0 Lite 联网搜索
  optimize_prompt_options?: { mode: "standard" | "fast" },  // P0：fast 仅 Pro/4.0
  background?: "transparent" | "opaque",   // P0：仅 5.0 Pro 图生图场景
}
```

**Rust 端护栏（`validate_params`）**：
- 5.0 Pro + `sequential_image_generation` 互斥
- 5.0 Pro + `stream`（未来 P1 加） 互斥
- 4.5 / 4.0 + `output_format: "png"` 报错
- `optimize_prompt_options.mode=fast` 仅 5.0 Pro / 4.0

### 1.4 响应结构

```json
{
  "data": [
    {
      "url": "https://...",
      "b64_json": null,
      "size": "2048x2048",            // P0：实际像素（仅 5.0 pro/lite 返回）
      "output_format": "png",         // P0：输出格式（仅 5.0 pro/lite 返回）
      "zIndex": 0,                   // 图层拆分时返回，底图=0
      "name": "前景角色",              // 图层名称
      "description": "...",          // 图层描述
      "bounding_box": {              // P0：仅 5.0 pro 图层返回
        "absolute": [225, 442, 796, 1414],     // [left, top, right, bottom] 像素
        "normalized": [220, 432, 777, 1000]    // 0-1000 归一化
      },
      "error": null                  // P0：组图场景下某张失败时填 {code, message}
    }
  ],
  "usage": {                         // P0：API 顶层 usage
    "generated_images": 4,
    "input_images": 0,
    "output_tokens": 16384,
    "total_tokens": 16384,
    "tool_usage": { "web_search": 1 }
  },
  "error": null                       // P0：API 顶层 error（整体失败时）
}
```

Y-agent 解析时：
- `url` 优先（外链 24h 有效）
- 退化到 `b64_json`（自带 `data:` 前缀则直接用；否则补 `data:image/png;base64,` 前缀）
- `zIndex` / `name` / `description` / `bounding_box` 用于图层展示
- `usage` 透传到 `AssetPayload.usage`，前端可选做"今日 N 张"统计
- `error` 顶层优先于空 data（前端会看到明确的"API error (code): message"）

### 1.5 5 个常见坑（按踩坑频次排）

> 全部由 `commands::explain_error` 自动识别 + 提示。可在前端单独调 `explainError(raw)` 测试。

#### 坑 1：模型 ID 不存在 / 未开通

**错误特征**：
```
{"code":"InvalidEndpointOrModel.NotFound","message":"..."}
{"code":"NotFound",...}
```

**原因**：
- 5.0 Pro 没开通就用
- 自定义 Endpoint ID 拼错
- 复制了别人账号的 Endpoint ID（每个账号独立）

**解决**：
- [火山方舟控制台](https://console.volcengine.com/ark/region:cn-beijing/openManagement) 查模型列表
- 自定义 ID 必须在「在线推理 → 自定义推理接入点」先创建

#### 坑 2：`InvalidParameter`（参数错误）

**错误特征**：`{"code":"InvalidParameter",...}`

**最常见原因**：

1. **`size` 写错大小写** —— 必须是 `1k` / `2k`，不是 `1K` / `2K`
2. **单图请求误传 `sequential_image_generation`** —— 字段值是 `"auto"`，单图时不传这个字段
3. **size 配错模型** —— 比如给 5.0 Lite 传 4k（Lite 最高 2k）

**解决**：看 `jimeng.rs::generate` 入参 + 错误消息关键字。

#### 坑 3：`Authentication`（认证失败）

**错误特征**：`Authentication` / `401`

**原因**：
- API Key 错了
- API Key 过期了
- API Key 复制时多了空格 / 换行

**解决**：在「设置」面板重填，**完全复制** 不要带空格。

#### 坑 4：`AccessDenied`（权限不足）

**错误特征**：`AccessDenied` / `403`

**原因**：
- 当前 API Key 是子账号的，主账号没给该模型授权
- 5.0 Pro 类特殊模型需要单独授权

**解决**：用主账号 Key，或主账号在控制台给子账号加权限。

#### 坑 5：`Throttling`（限流）

**错误特征**：`Throttling` / 429

**原因**：火山方舟默认 **IPM 500 张/分**（约 8 张/秒）。批量生图触发。

**解决**：
- 等几秒再试
- 减少单次 `max_images`
- 走多次单图

### 1.6 Y-agent 主动避免的坑

#### 主动关水印

```rust
// src-tauri/src/jimeng.rs::generate
let mut body = serde_json::to_value(&params)?;
if body.get("watermark").is_none() {
    if let Some(obj) = body.as_object_mut() {
        obj.insert("watermark".into(), serde_json::Value::Bool(false));
    }
}
```

**为什么**：Seedream API 的 `watermark` 字段默认 `true`（加 "AI生成" 水印），Y-agent 业务上不想要。每次请求都显式补 `false`。

#### Demo 模式

API Key 以 `demo-` 开头时，`jimeng::generate` 直接返回占位 SVG（不调 HTTP），省 token 给 UI 调试用：

```rust
fn is_demo_key(api_key: &str) -> bool {
    api_key.starts_with("demo-")
}
```

UI 在资产上标 `isDemo: true`，给视觉区分。

#### `sequential_image_generation: "disabled"` 是错的

很多人照搬 OpenAI 习惯写 `"disabled"`，但 Seedream 不接受 —— **不传这个字段** = 单图模式。
Y-agent 严格只在 `maxImages > 1` 时才传 `sequential: "auto"`。

#### `b64_json` 解析

火山方舟有时会返回 `b64_json`，有时是 dataURL（带 `data:` 前缀），有时裸 base64。Y-agent 兼容三种情况：

```rust
if b64.starts_with("data:") {
    b64
} else {
    format!("data:image/png;base64,{}", b64)
}
```

并且会先 `B64.decode(bare)` 验证一遍（剥 padding），不合法直接报错。

### 1.7 图层拆分（M2 重点，5.0 Pro 专属）

```typescript
{
  model: "doubao-seedream-5-0-pro-260628",
  layer_decomposition: true,
  // 没有 sequential_image_generation（Pro 不支持组图）
}
```

响应里每张图带 `zIndex` / `name` / `description`，UI 可以按 zIndex 叠放展示。

**当前 Y-agent 状态**：Schema / Rust 端都支持了，但前端 AssetBoard 还没做图层 UI（计划在 M3 一起做）。

### 1.8 流式输出（P1，5.0 Lite / 4.5 / 4.0 支持，5.0 Pro 不支持）

```typescript
// 前端调用
const requestId = await generateImageStream(
  { model: "doubao-seedream-5-0-lite-260128", prompt: "...", maxImages: 4, sequential: "auto" },
  {
    onPartial: ({ index, url }) => console.log("第", index + 1, "张就绪", url),
    onPartialFailed: (info) => console.warn("第", info.index, "张失败", info.code, info.message),
    onCompleted: (info) => console.log("全部完成", info.usage),
    onAborted: ({ reason }) => console.error("流中断", reason),
  }
);
```

Rust 端：
- `jimeng::generate_stream(api_key, params, request_id, on_event)` 走 reqwest `bytes_stream()`，按 `\n\n` 切 SSE 事件
- 事件类型：`image_generation.partial_succeeded` / `image_generation.partial_image` / `image_generation.partial_failed` / `image_generation.completed`
- `InternalServiceError` 立即中断流 + emit `Aborted`
- 顶层 `error` 透传到 `Aborted.reason`

Tauri command：
- `jimeng_generate_stream` 立即返回 `request_id`（`String`），后台 `tokio::spawn` 跑流式循环
- 通过 Tauri event `jimeng://stream` 推 `StreamEvent`，payload 里有 `request_id` 用于前端过滤

Demo 模式：每 200ms 推一张 partial_image，4 张后 emit Completed。

Y-agent 集成：
- `agent-flow.executePlanStream(plan, projectId, callbacks)`：每张 partial 立刻 `createAsset` 入库，UI 实时看到图；completed 时合并为一张主资产返回
- 5.0 Pro 自动 fallback 到 `executePlan`（非流式）
- 异常时（`onAborted` 触发）也 `reload()`，已入库的 partial 会出现在资产列表

**错误处理**：
- 验证 `5.0 Pro + stream` 互斥（在 `jimeng::validate_params` 后加 stream 专属 check）
- 5.0 Pro + stream 走 Rust 端直接报错：`InvalidParameter: 5.0 Pro 不支持流式输出（stream），请改用 5.0 Lite / 4.5 / 4.0`

### 1.9 局部编辑（P3，5.0 Pro 专属）

```typescript
// 前端：在资产详情页"局部编辑"按钮
// 1. 用户画 bbox（图像素坐标，屏幕自动换算）
// 2. 拼 prompt: `${userPrompt} <bbox>${x1} ${y1} ${x2} ${y2}</bbox>`
// 3. 调 jimengGenerate({ model: "doubao-seedream-5-0-pro-260628", prompt, image: [srcUrl] })
// 4. createAsset 新资产，payload.parentAssetId = 源图 id，payload.bbox = 框
```

Rust 端：
- 与普通生图同走 `jimeng::generate`，无新 command
- `validate_params` 不拦截 `<bbox>` 标签（是 prompt 内容，Y-agent 拼好后传进来）
- bbox 合法性由前端校验（x1<x2, y1<y2, 在图内），Rust 端不重复检查

Y-agent 集成：
- 资产详情页 `AssetDetailDialog.tsx` 多了「局部编辑」按钮（仅 5.0 Pro 资产可见）
- 进入编辑模式：`EditStage` 显示原图 + 覆盖层，用户拖鼠标画框
- `EditBar` 底部输入 prompt + 提交/取消，Enter 也提交
- 提交后调 `jimengGenerate` → `createAsset` → `onAssetCreated` 通知 ProjectDetail reload
- 新资产 `payload.parentAssetId` 记录源图；`payload.bbox` 记录画的框

**与流式输出互斥**：
- 5.0 Pro 走非流式（局部编辑调用 `jimengGenerate` 而非 `jimengGenerateStream`）
- 这与 P1 的 5.0 Pro 自动 fallback 到 `executePlan` 一致

**错误码**：
- `400 bbox out of range` / `400 invalid bbox` → 框坐标异常（理论上前端已校验，服务端兜底）
- `model_not_support` → 切到 5.0 Pro
- 其它错误码同普通生图

**Skill 模板**：`src/skills/builtin/local-edit-bbox/SKILL.md`（用户描述"局部编辑/改图/框内改"时自动触发）

### 1.10 透明背景（P4，5.0 Pro 专属）

```typescript
// 前端：PromptBar 透明背景 checkbox（仅 caps.background=true 时显示）
// 勾选时：background="transparent" + outputFormat="png"（自动联动）
// 取消 JPEG：透明背景强制关掉

// Y-agent 入库时把 transparent 写进 payload
payload: {
  urls: [...],
  transparent: true,            // 5.0 Pro + transparent 时为 true
  outputFormat: "png" | "jpeg", // API 实际返回的格式
}
```

Rust 端护栏（`jimeng::validate_params`）：
- `background: "transparent" + model != 5.0 Pro` → `InvalidParameter: 透明背景（background=transparent）仅 5.0 Pro 支持`
- `background: "transparent" + output_format: "jpeg"` → `InvalidParameter: 透明背景必须用 PNG 输出（output_format=jpeg 与 background=transparent 互斥）`

Y-agent 集成：
- PromptBar 加 checkbox（`Droplet` 图标），模型切换时自动显隐（`caps.background`）
- jpeg → transparent 强制关；transparent → 强制切到 png
- AssetCard 左上角「透明」绿色徽章（`payload.transparent`）
- AssetDetailDialog 元数据「格式」字段显示 `PNG（透明）` / `JPEG`
- 图标合集场景：自动套 `icon-pack-transparent` Skill 模板

**错误码**：
- `400 invalid parameter` → transparent + jpeg 互斥（前端已防）
- `model not support` → 切到 5.0 Pro
- 其它错误码同普通生图

**Skill 模板**：
- `src/skills/builtin/icon-pack-transparent/SKILL.md`（图标合集 + 透明背景）
- `src/skills/builtin/ui-icons/SKILL.md`（已升级到 5.0 Pro + transparent）

---

## Part 2. LLM API（OpenAI 兼容协议）

### 2.1 通用约定

所有 Provider 都走 OpenAI 兼容 `/v1/chat/completions` 协议，**前端直接调**（不绕 Rust，因为 LLM Key 也存加密但前端访问更频繁，加解密开销大）。

### 2.2 Provider 对比

| Provider | Endpoint | 默认 model | 多模态 | 推荐度 |
|---|---|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` | `deepseek-v4-flash` | ❌ | ⭐⭐⭐ 性价比高，中文好 |
| 豆包 Lite（火山方舟） | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` | `doubao-lite-32k` | ❌ | ⭐⭐ 中文好但不便宜 |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` | ✅ | ⭐⭐ 国内访问不便 |
| 自定义 | 自己填 | 自己填 | 默认 true | 灵活 |

### 2.3 消息转换坑点

`src/lib/llm.ts::llmChat` 干了几件容易踩的事：

1. **多模态转换**：
   - 不支持多模态的 Provider → **剥离 `images` 字段**（避免 400 / 噪音）
   - OpenAI 多模态 → `content: [{type:"text",...}, {type:"image_url",...}]`

2. **assistant 消息不能空**：
   ```typescript
   // DeepSeek 报 "Invalid assistant message: content or tool_calls must be set"
   content: m.content ?? ""  // 强制有值
   ```

3. **空 `tool_calls` 数组被 DeepSeek 拒绝**：
   ```typescript
   if (m.tool_calls && m.tool_calls.length > 0) {
       out.tool_calls = m.tool_calls;
   }
   // 不要无脑 out.tool_calls = m.tool_calls ?? undefined
   ```

4. **超时 60s**：AbortController 强杀，给明确错误而不是让用户看 spinner 转死。

5. **工具调用循环最多 5 轮**：超限给提示，不静默。

### 2.4 自定义 Provider 配置

`LLMConfig.supportsMultimodal` 决定是否发图片：
- 预设 Provider 写死
- 自定义默认 `true`（OpenAI 兼容协议通常支持；但用户填的是哪类模型自己负责）

`config.json` 走加密 KV 存储（`agent_llm` key），UI 在 SettingsPanel 编辑。

### 2.5 已知的 LLM 行为模式

- **DeepSeek** 经常一上来就调工具，不会反问（学 6.2 system prompt 里的"先反问"有时会失效）
- **豆包 Lite** 中文好，但**对工具调用的支持参差**，有时拒绝调工具
- **gpt-4o-mini** 反问最稳定，但延迟高（5-10s）+ 贵

**实战经验**：
- 想 AI 主动反问 → 用 OpenAI 或 DeepSeek
- 想省钱 + 接受"瞎猜" → 用 DeepSeek
- 中文专业术语准确度 → 豆包

---

## Part 3. 错误处理统一约定

### 3.1 错误传播链

```
外部 API 原始错误
  ↓
Rust commands::xxx → Result<T, String> (to_string())
  ↓
前端 invoke() 抛 Error
  ↓
catch (e) → explainError(e.message) → 用户友好提示 + toast
```

### 3.2 `explain_error` 规则表

`src-tauri/src/commands.rs::explain_error` 关键词匹配：

| 关键词 | 提示 |
|---|---|
| `InvalidEndpointOrModel.NotFound` / `"code":"notfound"` | 模型 ID 不存在或账号未开通 |
| `5.0 Pro 不支持组图` | 提示改用 lite / 4.5 / 4.0 |
| `仅支持 jpeg 输出` | 当前模型仅 jpeg，去掉 PNG 开关 |
| `fast 仅 5.0 Pro / 4.0 支持` | 关掉极速模式 |
| `internalserviceerror` | 5xx，重试或等几分钟 |
| `invalidparameter` | 参数详细（size 大小写 / sequential 字段 / jpeg+png 冲突） |
| `authentication` | API Key 无效或过期 |
| `accessdenied` | 权限不足（子账号未授权） |
| `throttling` | 限流（IPM 500 张/分） |
| `API Key 未设置` | 前置检查，没设 Key |

**前端调用**：
```typescript
import { explainError } from "@/lib/jimeng";
try {
  await generateImage(...);
} catch (e) {
  const friendly = await explainError(String(e));
  toast.error(friendly);
}
```

### 3.3 调试时拿完整错误

`RUST_LOG=debug` 启动 dev 模式 → 终端看 `jimeng request` / `jimeng response` / `jimeng payload` 完整日志。

---

## Part 4. 数据流参考

### 4.1 即梦一次生图

```
前端 PromptBar
  └─ generateImage({ model, prompt, size, sequential?, maxImages? })
       └─ invoke("jimeng_generate", { params })
            └─ Rust commands::jimeng_generate
                 ├─ 解密 API Key (AES-GCM)
                 ├─ 检查 demo 前缀
                 └─ jimeng::generate(apiKey, params)
                      ├─ demo → 返回占位 SVG
                      └─ 真实 → reqwest POST → 解析 data[]
                 └─ JsGenerateResponse { images, is_demo }
       └─ 回到前端
            └─ agent-flow.executePlan()
                 ├─ createAsset() → SQLite INSERT
                 └─ learnFromGeneration() → 自动学风格
```

### 4.2 LLM 一次对话

```
前端 PromptBar (chat mode)
  └─ 构造 messages: [system, ...history, user]
       system = renderSystemPrompt({ styleHints, recentModels })
  └─ llmChatLoop(cfg, messages, AGENT_TOOLS, executeTool)
       [src/lib/llm.ts]
       for (i < 5):
         ├─ llmChat(cfg, messages, tools)
         │   ├─ 多模态转换 / 字段清理
         │   ├─ POST cfg.endpoint (60s timeout)
         │   └─ 解析 OpenAI 响应
         ├─ 无 tool_calls → push assistant + break
         └─ 有 tool_calls → executeTool(name, args)
              └─ jimeng_generate_image
                   ├─ generateImage() → 拿图
                   └─ createAsset() → 入库
                   └─ return { result, artifacts }
  └─ persistUpdate(agentMsg, { content, events, skillLog, assetIds })
```

---

## Part 5. 接下来要读

- [architecture.md](./architecture.md) — 系统全貌
- [agent-system.md](./agent-system.md) — Agent 引擎 / Router / Memory
- [development.md](./development.md) — 怎么 setup / build / test
