# Y-agent API 集成笔记
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

#### 5.0 模型默认输出 PNG

Y-agent 业务规则：5.0 Pro / Lite 默认输出 PNG，4.5 / 4.0 不设（让 API 走默认 jpeg）。

实现：前端 `src/lib/jimeng.ts::applyOutputFormatDefault(params)`，每次 `generateImage` / `generateImageStream` 入口自动应用。

- 调用方显式传了 `outputFormat` → 不动
- 5.0 Pro / Lite 且未传 → 强制 `outputFormat: "png"`
- 4.5 / 4.0 未传 → 不设（保持 undefined）

UI 配合：
- PromptBar 输出格式下拉框默认项文案改为「PNG（Y-agent 默认）」
- `ProjectDetail` 的 `useState<"" | "png" | "jpeg">("png")` 默认值也是 png

理由：5.0 Pro / Lite 内部默认就是 PNG（4.5 / 4.0 没 PNG 选项），UI 显式默认 PNG 减少用户认知负担 —— "PNG"是更通用的无损格式，UI 图标/素材场景天然需要。


### 1.7 图层拆分（M2 重点，5.0 Pro 专属）

```typescript
{
  model: "doubao-seedream-5-0-pro-260628",
  layer_decomposition: true,
  // 没有 sequential_image_generation（Pro 不支持组图）
}
```

响应里每张图带 `zIndex` / `name` / `description`，UI 可以按 zIndex 叠放展示。

**当前 Y-agent 状态**：Schema / Rust 端都支持了；`AssetDetailDialog` 已实现 PS 风格的合成视图与图层面板（见下）。

#### 1.7.0 图层信息持久化核对（M3 补丁）

**全链路无损入库**——所有图层信息都已经持久化在 `assets.payload` 字段，足够 1:1 重建原图：

```
5.0 Pro API
  └─ resp.data[].{z_index, name, description, size, output_format,
                  bounding_box.{absolute, normalized}, url, isBase64}
       │
       ▼ Rust 解析 (src-tauri/src/jimeng.rs:227-252)
GeneratedImage (Rust struct, jimeng.rs:264-291)
  #[serde(rename_all = "camelCase")]
  -> { url, isBase64, zIndex, name, description, size,
       outputFormat, boundingBox, error, localPath }
       │
       ▼ serde JSON → Tauri IPC
GeneratedImage (TS src/lib/types.ts:199-215)
       │
       ▼ (src/lib/agent-flow.ts:215 layers: resp.images)
buildAssetPayload({ layers, layerLocalPaths, ... })
       │
       ▼ Tauri create_asset (commands.rs:492-554)
  - serde_json::to_string(&params.payload)  ---> SQLite assets.payload TEXT
       │
       ▼ Tauri list_assets → row_to_asset
  - serde_json::from_str(&s)  ---> 前端收到 asset.payload.layers[i] (完整)
```

**CI 证据**：`src/lib/asset-payload.test.ts` 的 round-trip 用例断言
所有图层字段（含 `boundingBox.normalized`）在 JSON 序列化 → 反序列化
后无任何字段丢失。

**推荐字段**：`boundingBox.normalized`（0-1000）aspect-independent，
是 5.0 Pro 官方"任意尺寸重建"方案。`LayerCompositeStage` 优先使用，
老数据（缺 normalized）由 `layerRectNormalized` 自动 fallback 铺满。

#### 1.7.1 前端合成视图（M3 升级）

- `src/components/workspace/LayerCompositeStage.tsx`：把可见图层按 zIndex 升序叠放在一个固定比例的画布上。**定位用 `boundingBox.normalized` (0-1 浮点 × base 像素)**，aspect-independent，5.0 Pro 官方推荐；底图容器 aspect 用 onLoad 校正后的 base 自然像素（API 报告的 `size` 偶尔不准，作为初值兜底）。
- `src/lib/layer-view.ts`：
  - `pickVisibleLayers(layers, hidden, solo)` 派生"应在画布上渲染的图层"——`solo` 优先于 `hidden`
  - `layerRectNormalized(layer)` 解析 `boundingBox.normalized` 为 [0,1] 浮点矩形（缺/越界/反向 → 铺满）
  - 上述两个纯函数有 11 个 Vitest 用例（`layer-view.test.ts`）覆盖
- `AssetDetailDialog` 顶部加「合成 / 单图层」切换 pill，默认走合成；右侧图层面板新增 Solo（`Focus` 图标，互斥）和"全部显示"按钮（仅在有隐藏/solo 时出现）；图层面板行优先显示 `boundingBox.normalized` 数值（`[l, t, r, b] (0-1000)`），缺失时回退显示 `boundingBox.absolute` 像素值。
- 合成视图下：键盘 ←/→ 禁用（没有"当前图层"概念）；缩略图条 opacity-60 淡化，hover 提示"点击切到单图层视图"。
- 选中图层（点击行）会在合成画布上画 accent 描边 + 名称 tag；行点击在单图层模式切 idx，在合成模式置 selectedLayerIdx。

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
- `transparent background requires a png` → 输入图不是真 PNG，或 PNG 不带至少 1 个透明像素。
  Y-agent 已在 `runTool` 阶段对入参 PNG data URL 左上角补 1 个透明像素
  （`@/lib/image-alpha-patch.ensureHasTransparentPixel`）绕过该校验；该错误码仅在
  源图不是真 PNG（例如 .png 扩展名但实际是 JPEG 字节）时出现。
- 其它错误码同普通生图

**入参补丁（Y-agent 自动处理）**：

即梦 5.0 Pro `background: transparent` 接口对入参图有一个隐性前置校验：必须是**有 alpha 通道、且至少 1 个 alpha < 255 像素**的 PNG。普通由 5.0 Lite/Pro 出的不透明 PNG 也会被拒。

Y-agent 策略：**不教育用户去手动改图**，而是在 `runTool.buildGenParams` 对 `image[]` 中每张 PNG data URL 自动走 `ensureHasTransparentPixel`：

- 用浏览器 `<img>` + `OffscreenCanvas`（不支持时回退 HTMLCanvasElement）解码
- 把 (0,0) 像素的 alpha 置 0，重新打包成 PNG data URL
- 原图字节 0 改动；只有"飞过 API 的那份"被改
- 失败 / 非 PNG / CORS 拒 → 静默回退原 URL，让后端 `explain_error` 兜底
- 缓存按 sourceUrl，避免重选同一图重复 decode

**MIME 推断改进**（同步）：

`commands::read_image_data_url` 从"按扩展名决定 MIME"升级为 **magic bytes 优先、扩展名兜底**：
- 命中 PNG/JPEG/WebP/GIF/SVG/XML → 用真实 MIME
- 都不识别 → 回退到原扩展名逻辑（保持 BMP/TIFF/ICO 等老格式兼容）

避免"以 `.png` 结尾但实际是 JPEG 字节"被错标为 `image/png` 发给 API。

**Skill 模板**：
- `src/skills/builtin/icon-pack-transparent/SKILL.md`（图标合集 + 透明背景）
- `src/skills/builtin/ui-icons/SKILL.md`（已升级到 5.0 Pro + transparent）

### 1.11 24h URL 失效兜底 + 用量统计（P5）

```rust
// Rust：jimeng_generate 返回后，遍历 images[i]，调 download_to_cache 异步下载
//   app_data_dir/assets/<batch_id>/<n>.{png|jpg}
//   成功 → 写 img.local_path = Some(absolute path)
//   失败 → 保持 None（前端回退用 url）
// 流式：每个 partial 同样下载，事件 payload 加 local_path
```

```typescript
// 前端：SafeImage 组件自动用 imageInput(img) 优先取 localPath
// 通过 invoke("read_image_data_url", { path }) 转成 data: URL
// 同一路径缓存 data URL，避免重复 IPC

// 入库：asset-flow 把 localPaths 写进 payload（普通生图与图层拆分都覆盖）
// 资产卡 / 资产详情：优先用 localPath，缺失回退 url
// AssetCard 右下角"本地"徽章
// SettingsPanel 今日用量：聚合近 24h 内所有项目的 asset.payload.usage
```

Rust 端：
- `jimeng::download_to_cache(client, url, cache_dir, asset_id, index) -> Option<PathBuf>`
  - 30s 超时，仅下载 http(s) URL
  - 自动推断扩展名（默认 png）
  - 父目录自动创建
- `commands::read_image_data_url(path) -> String`
  - 路径必须在 `app_data_dir/assets/` 下（防越权）
  - 按扩展名推断 mime
  - 同步返回 base64 data URL（图片通常 < 5MB，IPC 够用）
- `commands::jimeng_generate` 拿 batch_id = uuid，下载所有图
- `commands::jimeng_generate_stream` 每个 partial 异步下载，再 emit 一条带 localPath 的事件

前端：
- `src/lib/image-resolver.ts`
  - `resolveImageUrl(input)` async，按 schema 走不同分支
  - `resolveImageUrlSync(input)` 从内存缓存拿
  - `prefetchImageUrl(input)` 静默预解析
  - dataUrlCache: Map 缓存
- `src/components/shared/SafeImage.tsx`
  - 替代 `<img>`：先同步拿缓存值，effect 里再异步解析替换
  - 卸载时 `cancelled = true` 防止 stale update
- `imageInput(img) => img.localPath ?? img.url` helper

Y-agent 集成：
- AssetCard / AssetDetailDialog / ResultGrid 全部用 SafeImage
- 图层拆分的 layer 也走 `imageInput(layer)` 优先 localPath
- 局部编辑（EditStage）源图、局部编辑结果都走同一路径
- SettingsPanel 打开时聚合所有项目的 asset.createdAt 近 24h 资产，累加 usage

**不破坏既有**：
- 旧资产没有 `localPaths` 字段：直接回退用 url，不报错
- `local_path` 字段缺失 / 缓存文件被删：`resolveImageUrl` catch 后回退到原值
- 图层拆分时 `layer_local_paths` 暂未单独持久化（layer 对象的 localPath 是 Rust 端 GeneratedImage 自身携带，随 payload.layers 一起存）

**Skill 模板**：无新增（P5 是基础设施层，P6 的 icon-pack-transparent 等模板会直接受益）


#### P5+ 增强：入库自动兜底 + 主动 backfill

P5 处理的是「新图下载 + 优先用 localPath」，但遗留一个问题：**P5 之前入的库没有 localPath**。如果用户历史项目里几千张图都靠外链 URL，24h 后会全失效。P5+ 解决这个：

- **任何 `create_asset` 入库即后台兜底**：Rust 端 `create_asset` 改 async，DB 写完立刻 `spawn_local_path_backfill` 串行下缺图的 localPath，写完异步回 `payload.localPaths`。用户响应不等下载（先用 url 看图）
- **主动 backfill**：`commands::backfill_local_assets(project_id?)` 扫「urls 有但 localPaths 缺」的资产，每条 `tokio::spawn` 并发下。返回 `BackfillReport { scanned, downloaded, failed, brokenMarked }`
- **失败标 broken**：下载失败的资产标 `payload.broken = true`。前端目前不消费这个字段，**未来 UI 可以**给「图已过期」角标 + 提示重生成
- **路径安全**：写回时 `canonicalize` 后必须在 `app_data_dir/assets/` 下（防越权，校验失败则该项记空字符串不入 payload）

前端：
- `src/lib/assets.ts::backfillLocalAssets(projectId?)` 暴露给前端（走 Tauri IPC）
- `ProjectDetail` 切项目时 `useEffect([currentProject?.id])` 自动跑一次。下载成功/部分失败时 `reload({ silent: true })` 让 SafeImage 切到本地
- 静默失败不打扰用户（最坏情况就是 24h 后图片过期，与改之前一样）

两个 helper：
- `extract_urls_for_backfill(payload)`：支持两种 payload —— 普通 `payload.urls[]`、图层拆分 `payload.layers[]`（按 zIndex 升序）
- `extract_local_paths_for_backfill(payload)`：平行数组（urls 模式写 `localPaths`，图层模式写 `layerLocalPaths`），缺位填 None 让 backfill 知道要补哪里

**与 P5 的关系**：
- P5 = jimeng_generate 路径下载（同步生图 / 流式 partial）
- P5+ = create_asset 路径兜底（任何入库都触发）+ 主动扫缺图
- 两条链路互补：P5 处理新图，P5+ 修复老图

### 1.12 Skill 模板 + Agent 工具扩展（P6）

```typescript
// 11 个 Skill 模板（4 个分组）
// 基础生图：character-turnaround / expression-grid / character-sheet / scene-mood / kv-poster
// 组图：scene-mood-light-variants / character-consistency-set / product-shot-pack / ui-icons
// 5.0 Pro 专属：layer-separation / local-edit-bbox / icon-pack-transparent / infographic-poster

// 3 个 Agent 工具
// jimeng_generate_image: 文/图生图 + 7 个可选参数（model/size/ref_required/image/max_images/output_format/background/fast_mode/web_search）
// jimeng_decompose_layers: 5.0 Pro 图层拆分
// jimeng_local_edit: 5.0 Pro 局部编辑（bbox 可选）
```

Skill 模板新增（4 个）：

| Skill | 用途 | 模型 | group_count |
|---|---|---|---|
| `scene-mood-light-variants` | 早/午/晚/夜 4 张 | 5.0 Lite | 4 |
| `character-consistency-set` | 同角色 4 个动作 | 5.0 Lite | 4 |
| `product-shot-pack` | 主图 + 角度 + 场景 6 张 | 5.0 Lite | 6 |
| `infographic-poster` | 长 prompt 排版海报 | 5.0 Pro | 1 |

加上之前 P2~P4 已建的 3 个（`layer-separation` / `local-edit-bbox` / `icon-pack-transparent`），总共 12 个。

Agent 工具（3 个）：

| 工具 | schema 关键字段 | 模型 |
|---|---|---|
| `jimeng_generate_image` | `prompt / model / size / ref_required / image / max_images / output_format / background / fast_mode / web_search` | 任意 |
| `jimeng_decompose_layers` | `image / prompt? / model?` | 5.0 Pro 锁定 |
| `jimeng_local_edit` | `image / edit_prompt / bbox? / model?` | 5.0 Pro 锁定 |

System prompt（`renderSystemPrompt`）升级：
- 11 个 Skill 模板按 4 个分组列出（基础生图 / 组图 / 5.0 Pro 专属 / 高级）
- 注入"模型能力矩阵"（哪类需求该用哪个 API）
- "判断原则"段：默认 5.0 Lite，特殊需求（拆图/局部/透明/排版）升级 5.0 Pro

SkillPicker UI（`SkillPicker.tsx`）按 group 分组渲染：
- 4 个分组用不同 lucide icon（Wand2 / ImagePlus / Sparkles / Layers）
- 头部 sticky 展示分组名 + 数量
- 键盘导航 / 滚动跟随仍按扁平化 idx

`Skill` 类型扩展：
- 新增 `group?: SkillGroup` 字段
- `SkillGroup = "基础生图" | "组图" | "5.0 Pro 专属" | "高级"`
- `inferSkillGroup(skill)` 按 `groupCount` + `modelHint` 自动推断

**冒烟**：12 个 Skill 模板 + 3 个 Agent 工具（demo 模式跑通）

### 1.13 工具工作台（Tools Tab）

> ModeSwitch 加了第三个 tab「工具」：即梦 API 全部能力的快捷入口，每个工具用合适的模型预设参数，避开"翻参数面板"的成本。

入口：`src/components/workspace/ModeSwitch.tsx` 第三个 tab `tools`（Wrench icon），切到后 `ProjectDetail` 渲染 `<ToolsTab>`，隐藏 PromptBar。

5 个工具：

| 工具 | 模型 | 关键参数 | 用途 |
|---|---|---|---|
| 批量组图 | 5.0 Lite / 4.5 / 4.0 | maxImages 1-N | 一次出 N 张同 prompt（挑选用） |
| 联网出图 | 5.0 Lite | `tools=[web_search]` | 模型先搜互联网再画（天气/商品/新闻等实时信息） |
| 背景去背 | 5.0 Pro | `background=transparent`, `outputFormat=png` | 把已有图导出为 PNG 透明背景（UI 图标/素材） |
| 图层拆分 | 5.0 Pro | `layerDecomposition=true` | 把一张图拆为底图 + 多个可编辑图层 |
| 局部编辑 | 5.0 Pro | `image` + `bbox` | 在图上拖框 + 改写 prompt 重画局部 |

#### 共享组件

- `src/components/workspace/tools/AssetPicker.tsx`：从资产库选一张图（弹窗）。回调用 `resolveImageUrl` 把路径转成 jimeng API 接受的格式（本地路径 → dataURL / 外链 URL 直传 / dataURL 直传）
- `src/components/workspace/tools/runTool.ts`：统一执行 helper
  - 模型支持 stream（5.0 Lite / 4.5 / 4.0）→ `runToolStream`，partial 立刻入主资产，completed 时合并
  - 模型不支持 stream（5.0 Pro）→ `runToolSync`，阶段提示：requesting → downloading → persisting → done
  - 任何阶段报错都走 `onProgress('error', ...)` 并 reject，UI 负责 catch + toast
  - `ToolProgress { phase, message, partialCount?, totalCount? }` 进度回调

#### 透明工具的入参处理

5.0 Pro 的 `background: transparent` 接口对入参图有两个隐性约束：① 必须是 PNG（不是 JPEG/WebP）；② PNG 必须有至少 1 个 alpha < 255 的透明像素。

`ToolsTab` 检测当前选中的资产：

- 是 JPEG → 禁用提交按钮，黄色提示条告诉用户怎么解决（"去批量组图用输出格式 PNG 重出一张" / "用局部编辑把这张图转一道再回来选"）
- `isAssetJpeg(asset)` 优先看 `payload.outputFormat`，回退看 URL 扩展名（兼容老数据 / 外部导入）

不透明 PNG 不会被前端预检拦截（前端没有扫像素的能力，且这会引入额外 IO）；Y-agent 走
**入参补丁**自动处理：见 § 1.10「入参补丁（Y-agent 自动处理）」。简单说，`runTool` 阶段
会把每张 PNG data URL 左上角 1 像素改成透明再发，原图不动。

`commands::explain_error` 兜底文案（仅在 API 仍拒时显示，通常说明源图不是真 PNG）：

```
"5.0 Pro 的「背景透明」要求输入图是带至少一个透明像素的 PNG（不透明 PNG、JPEG、WebP 都会被拒）。
通常 Y-agent 已经自动处理了左上角 1 像素，若仍报此错，多半是源图不是真 PNG
（例如 .png 扩展名但实际是 JPEG 字节），请换一张真 PNG 再试。"
```

匹配关键字：`transparent background requires a png`（API 实际报错）。

#### 局部编辑的 bbox

UI：在图上拖鼠标画框，屏幕坐标自动换算成图像素（`naturalSize` 记录 `naturalWidth/Height`）。

Prompt 格式（5.0 Pro 文档要求）：

```
{userPrompt} <bbox>x1 y1 x2 y2</bbox>
```

坐标是源图像素。提交后 `runTool` 把 `sourceAssetId` + `bbox` 写进新资产 payload（保留溯源链）。

#### 与已有功能的关系

- 局部编辑在 `AssetDetailDialog` 里早就有了（资产详情页"局部编辑"按钮）。ToolsTab 把这个能力独立出来 + 配合 AssetPicker 选图 → 形成"工作台"
- 图层拆分：之前只能通过 Agent 调 `jimeng_decompose_layers` 工具，ToolsTab 给了直观的 UI 入口
- 批量组图 / 联网出图：等价于 PromptBar 的"数量"+"联网"开关，但 UI 简化、不混其它能力位
- 背景去背：等价于 PromptBar 的"输出格式=png"+"透明背景"，但要求"基于已有图"（PromptBar 是文生图场景）

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

## Part 2.5 P7 · 对话模式模型决策权

> 让 PromptBar 里选定的模型成为对话生图的**权威**，LLM 不再私自切换；规则路由也不再覆盖用户选择。

### 2.5.1 设计原则

- **模型决策权归属**：用户在 PromptBar（底部输入框）选定的 `model` 是单一真相源
- **LLM 行为**：`jimeng_generate_image` 工具的 `model` 字段是**受控 hint**
  - 默认不要传（system prompt 注入 `userModelName` 作为强偏好）
  - 仅当用户消息里**显式要求**（"用 4.5 重新画"/"换成 Pro 做图层拆分"）时才传
  - 传了就尊重（受控升级路径）
- **规则路由**：`agent-router.ts::pickModel` 不再覆盖用户当前模型
  - Skill 推荐降级为 UI 提示（`RouteDecision.suggestedModelName`）
  - PlanCard 在用户当前模型 ≠ Skill 推荐时显示"💡 Skill 推荐 X 更合适"提示
- **能力位预检**：`runLlmTurn` 和 `onConfirmPlan` 在执行前用 `modelCapabilities()` 检查
  - 例：用户选 5.0 Pro + `max_images > 1` → 自动降级到 1 + toast 提示
  - 例：用户选 Lite + 想要图层拆分 → LLM 应主动反问"切 Pro 吗？"

### 2.5.2 数据流

```
用户切到 5.0 Pro
  ↓
useProjectBootstrap.setModel(proModel)
  ↓
PromptBar.onChange → ProjectDetail state 同步
  ↓
runLlmTurn 调用：
  - renderSystemPrompt({ userModelName: proModel.name })  // 注入 system prompt
  - 工具回调：args.model ?? proModel.id  // 受控 hint
  - 能力位预检：useModelOpt.capabilities.groupGeneration
  - executePlanStream（流式 partial 入库）
  ↓
onConfirmPlan 调用：
  - useModelId = plan.modelId ?? model.id  // 兼容老 chat 数据
  - 能力位预检
  - executePlanStream
```

### 2.5.3 关键代码改动

| 文件 | 改动 |
|---|---|
| `src/lib/agent-tools.ts` | `jimeng_generate_image.model` 字段 description 改为"通常不要传"；`renderSystemPrompt` 新增 `userModelName` 参数 |
| `src/lib/agent-router.ts` | `pickModel` 不覆盖用户；新增 `skillModelSuggestion` + `RouteDecision.suggestedModelName` |
| `src/lib/agent-event.ts` | `PendingPlan.modelId/modelName` 改 optional；新增 `suggestedModelName` |
| `src/components/workspace/ProjectDetail.tsx` | `runLlmTurn` 改走 `executePlanStream` + 能力位预检；`runRulePlan` plan 不再存 modelId；`onConfirmPlan` 用当前 model；`renderSystemPrompt` 调用注入 `userModelName` |
| `src/components/workspace/ChatMessageList.tsx` | PlanCard 展示 currentModelName + suggestedModelName 提示；按钮 generating 时禁用；ToolCallCard 工具名中文化 |

### 2.5.4 兼容性

- 老 chat 历史里的 `pendingPlan.modelId/modelName` 仍可读（字段变 optional），`onConfirmPlan` 有 `plan.modelId ?? model.id` 的 fallback
- 老 chat 历史里没有 `suggestedModelName`，UI 静默不显示
- LLM 传了未知的 `model`（不在枚举里）→ fallback 到 PromptBar + 静默 log

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
