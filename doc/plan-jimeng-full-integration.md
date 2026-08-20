# 即梦 API 全能力集成计划

> 对应 issue/讨论: 用户要求把火山方舟「图片生成 API」文档（`console.volcengine.com/ark/region:cn-beijing/docs/82379/1824121`）中列出的全部能力集成进 Y-agent。
> 本计划是路线图，每个阶段独立可发布、可冒烟、可回滚。

---

## 0. 现状速查（写计划时的代码基线）

| 能力 | Y-agent 状态 | 落点 |
|---|---|---|
| 文生图（单图） | ✅ 已支持 | `jimeng.rs::generate` |
| 图文生图（单图） | ✅ `image: Vec<String>` | 同上 |
| 多图融合 | ✅ `image: Vec<String>` | 同上 |
| 组图（max_images） | ✅ `sequential: "auto"` | 仅 5.0 lite / 4.5 / 4.0 |
| 图层拆分 | ⚠️ Schema 通，UI 缺 | `payload.layers` + `zIndex/name/description` |
| `bounding_box` | ❌ 响应里没解析 | Rust 端 `ApiImage` 缺字段 |
| `output_format` | ❌ 未传 | 模型是 png/jpeg 都能选，但代码没接口 |
| `size` 完整档位 | ⚠️ 只前 4 个 | 缺 `1.5K` / 扩展像素写法 `WxH` |
| 5.0 lite 别名 `doubao-seedream-5-0-260128` | ❌ 没列入 | `MODEL_OPTIONS` 缺 |
| `tools: [{type:"web_search"}]` | ❌ 未实现 | 仅 5.0 lite |
| `optimize_prompt_options.mode` | ❌ 未实现 | 5.0 pro / 4.0 支持 fast |
| `stream: true` 流式 | ❌ 未实现 | reqwest 当前一次性阻塞读 |
| `background: "transparent"` | ❌ 未实现 | 仅 5.0 pro |
| 交互编辑（坐标/框选 prompt） | ❌ 未实现 | 仅 5.0 pro |
| 响应 `usage` 字段回读 | ❌ 未实现 | `cost_ms` 现在是墙钟时间 |
| 单图生成错误（data[].error） | ❌ 未实现 | 组图场景下 1 张失败会带 error |
| `InternalServiceError` 识别 | ❌ 未实现 | 流式中断判断要用 |
| AssetBoard 图层 UI | ❌ 未实现 | 只展示主图 |
| 24h URL 失效 → 本地缓存 | ❌ 未实现 | 资产只在 `payload.urls` 字符串里 |
| Agent 工具 schema 扩展 | ❌ 未实现 | `agent-tools.ts` 只有 generate |
| 新 Skill 模板（多用 LLM） | ❌ 未实现 | 6 个全是单图场景 |
| 错误码解释 | ⚠️ 5 类基本 | 缺 `InternalServiceError`、参数详解、限流详细 |

底层已有的、可以复用的：
- `jimeng.rs::generate` 的参数结构（扩字段即可）
- `payload: Value` 的 JSON 透传（前/后端不必同步加新字段）
- `Asset` 表的 `is_layer_decomposition` 标志位（图层资产可入库）
- `agent-tools.ts` 的 OpenAI function calling 框架（加工具即可）
- `skill.ts` 的 `import.meta.glob` 模板加载（加 markdown 即可）
- 加密 KV、SQLite、`commands::explain_error` 的错误识别表

---

## 1. API 能力矩阵（计划要覆盖的全集）

来源：`https://console.volcengine.com/ark/region:cn-beijing/docs/82379/1824121`

| 域 | 能力 | 5.0 pro | 5.0 lite | 4.5 | 4.0 |
|---|---|---|---|---|---|
| 基础 | 文生图 | ✓ | ✓ | ✓ | ✓ |
| 基础 | 图文生图（1→1） | ✓ | ✓ | ✓ | ✓ |
| 基础 | 多图融合（N→1） | ✓ | ✓ | ✓ | ✓ |
| 组图 | 文生组图（1→N） | ✗ | ✓ | ✓ | ✓ |
| 组图 | 单图生组图（1→N） | ✗ | ✓ | ✓ | ✓ |
| 组图 | 多图生组图（N→N） | ✗ | ✓ | ✓ | ✓ |
| 进阶 | 联网搜索（web_search） | ✗ | ✓ | ✗ | ✗ |
| 进阶 | 流式输出（stream） | ✗ | ✓ | ✓ | ✓ |
| 进阶 | 提示词优化 fast 模式 | ✓ | ✗ | ✗ | ✓ |
| 进阶 | 背景透明 | ✓ | ✗ | ✗ | ✗ |
| 高阶 | 图层拆分（layer_decomposition） | ✓ | ✗ | ✗ | ✗ |
| 高阶 | 交互编辑（bbox 提示） | ✓ | ✗ | ✗ | ✗ |

**输出参数全集**：`size` / `response_format` / `output_format` / `watermark` / `image[]` / `prompt` / `model` / `tools[]` / `optimize_prompt_options` / `sequential_image_generation` / `sequential_image_generation_options.max_images` / `stream` / `background` / `layer_decomposition`

**响应字段全集**（要解析的）：`data[].url` / `data[].b64_json` / `data[].size` / `data[].output_format` / `data[].error` / `data[].z_index` / `data[].name` / `data[].description` / `data[].bounding_box.{absolute,normalized}` / `usage.{generated_images,input_images,output_tokens,total_tokens,tool_usage.web_search}` / 顶层 `error` / `created` / `model`

---

## 2. 阶段路线图（每阶段独立可发布）

> 编号原则：能独立冒烟的最小可玩版本优先；面向"独立游戏开发者单人"的 ROI 优先。
> 每阶段对应 1~N 个 commit，遵守 AGENTS.md 的"一个 commit 一件事"。

### P0 · 补齐参数 + 错误体系（1 个 PR，~半天）

> 目标：让现有 jimeng.rs / jimeng.ts / types.ts / commands.rs 跟上文档的字段表；用户先用上 output_format、5.0 lite 别名、fast 模式、web_search。

**Rust 端（`src-tauri/src/jimeng.rs`）**
- `GenerateImageParams` 加字段：
  - `output_format: Option<String>`（仅 5.0 pro/lite 生效，前端若传 `jpeg` 遇到 4.5/4.0 在 explain_error 提示）
  - `tools: Option<Vec<ToolSpec>>`（结构 `{ type: String }`，先只接受 `"web_search"`）
  - `optimize_prompt_options: Option<OptimizePromptOptions { mode: Option<String> }>`（`"standard"|"fast"`）
  - `background: Option<String>`（仅 5.0 pro）
- `ApiImage` 加：
  - `size: Option<String>`（响应 `data[].size`）
  - `output_format: Option<String>`（响应 `data[].output_format`）
  - `error: Option<ApiError>`（单图错误，序列级用）
  - `bounding_box: Option<BoundingBox>`（含 `absolute: [i32;4]` / `normalized: [i32;4]`，仅图层场景）
- 顶层响应解析加 `usage: Option<Usage>` + `error: Option<ApiError>`（顶层 error）
- `GeneratedImage` 加：
  - `size: Option<String>`
  - `output_format: Option<String>`
  - `bounding_box: Option<...>` 透传
- 整体响应结构加 `usage` 透传到 `JsGenerateResponse`（给前端做"今日生成 X 张 / 估费"的统计）
- 文案/参数校验（在 Rust 端做 1 次护栏，挡掉前端忘了处理的冲突）：
  - `5.0 pro` + `sequential_image_generation` 互斥 → 显式报错给 explain_error 关键词 `5.0 pro 不支持组图`
  - `5.0 pro` + `stream` 互斥 → 显式报错
  - `4.5 / 4.0` + `output_format: "png"` → 显式报错（`4.5/4.0 仅 jpeg`）

**前端（`src/lib/jimeng.ts`、`src/lib/types.ts`）**
- `GenerateImageParams` 同步加：`outputFormat?` / `tools?` / `optimizePromptOptions?` / `background?`
- `GeneratedImage` 同步加：`size?` / `outputFormat?` / `boundingBox?`
- `AssetPayload` 加：`outputFormat?` / `usage?` / `raw` 字段按需
- `MODEL_OPTIONS` 加别名 `doubao-seedream-5-0-260128` 入口（5.0 lite 正式 ID）
- `MODEL_OPTIONS` 每个 model 加能力位：`supportsWebSearch` / `supportsStream` / `supportsFastMode` / `supportsBackground` / `outputFormats: ['jpeg'] | ['png','jpeg']` / `sizePresets: string[]`
- 在 `MODEL_OPTIONS` 同位置加一个从模型 ID 反查这些能力位的辅助函数（`modelCapabilities(id)`）

**UI（`src/components/workspace/ModelSelect.tsx` + `SizeSelect.tsx`）**
- ModelSelect：选中后按模型能力位动态显示/隐藏"联网搜索"复选框 / "Fast 模式"复选框
- SizeSelect：按 `sizePresets` 动态列档位（含 `1.5K`、5.0 lite 的 `3K/4K`）
- PromptBar：output_format 复选框（PNG，5.0 pro/lite 才显示）

**错误（`src-tauri/src/commands.rs::explain_error`）**
- 新增关键词匹配：
  - `5.0 pro 不支持` → 提示用 lite 系列
  - `output_format` + 4.5/4.0 → 提示换成 5.0 lite
  - `size` 像素写法不在区间 → 贴出该模型允许范围
- `usage` 拿不到时降级为墙钟时间，但 explain_error 文案要能区分

**文档（`doc/api-integration.md`）**
- 顶部加「能力矩阵」表，列出每个模型支持什么
- 错误码解释表加新条目
- 5.0 lite 别名 / 1.5K 等"小知识"加进坑位

**冒烟**
- `pnpm test` 全过（纯函数模块未动则无新测试；如加新工具函数则补）
- `pnpm build` 0 warning
- 手动跑 4 个模型 × 各种参数组合，确认不报 4xx/5xx 字段错误

---

### P1 · 流式输出（1~2 个 PR，~1.5 天）

> 目标：让 5.0 lite / 4.5 / 4.0 走 SSE，用户看到"图 1/4 已就绪，图 2/4 生成中…"的进度。IPM 500 的限制下尤其重要，组图不必等所有图都生成完。

**Rust 端**
- `jimeng.rs` 新增 `generate_stream(api_key, params) -> impl Stream<Item = StreamEvent>`，使用 `reqwest` 的 `bytes_stream()` 解析 SSE
- `StreamEvent` 枚举：`PartialImage { url, size, index }` / `PartialFailed { error, code }` / `Completed { usage }` / `PartialImageB64 { b64, index }`（参考文档里 `image_generation.partial_succeeded` / `image_generation.partial_failed` / `image_generation.completed` / `image_generation.partial_image`）
- 增量把 partial 成功的图入资产库（不阻塞等 completed），用 `tokio::sync::mpsc` 在 Tauri 里 emit
- 流式请求不要走现有 `jimeng_generate` command；新加 `jimeng_generate_stream`，前端用 `@tauri-apps/api/event::listen` 收事件，event 名 `jimeng://partial-image` / `jimeng://partial-failed` / `jimeng://completed`
- `InternalServiceError`（`recv.error.code.equal("InternalServiceError")`）→ 中断流，给前端明确错误

**前端**
- `src/lib/jimeng.ts` 加 `generateImageStream(params, onPartial, onCompleted, onError)`
- `agent-flow.ts` 新增 `executePlanStream()` 路径（不破坏旧路径）
- `AssetBoard` / `ResultGrid` 流式追加图（占位 → 替换为真实 URL）
- LLM tool calling 走流式：partial 成功即可 `createAsset`，让用户早点看到图

**Demo 模式兼容**
- demo- 前缀时直接 emit 4 个 partial 事件（间隔 200ms 模拟），UI 走通

**错误**
- 流中断：明确告诉用户"流在第 N 张中断" + 失败原因
- 限流：`usage.tool_usage.web_search` 之外没有直接的 IPM 反馈，结合 `Throttling` 错误码

**冒烟**
- 用真实 Key 跑 5.0 lite 4 张组图，UI 应该能看见 4 个图陆续出现
- 用 demo 模式同步跑一遍，UI 行为一致
- 模拟 `InternalServiceError`（在 Rust 端插桩）：UI 显示"流中断，已生成 X 张"

---

### P2 · 5.0 Pro 图层 UI（1~2 个 PR，~2 天）

> 目标：让图层拆分的资产在 AssetDetailDialog 里可看、可拖、可导出。前端最缺的"图层"体验。

**数据**
- `payload.layers` 已有，但要解析 `bounding_box.{absolute, normalized}`（P0 加字段）
- 新增 `payload.boundingBoxUnits: "absolute" | "normalized"`（默认 absolute）

**UI（`src/components/workspace/AssetDetailDialog.tsx`）**
- 当前已支持图层展示（图层在前/底图在后的 flat 排序在 `flatAssetImages`），加：
  - 左侧图层列表（缩略图 + `name` + `description` tooltip）
  - 主画布可"叠放预览"：勾选图层即时显示
  - 隐藏/显示图层（眼睛图标）
  - 单图层导出为 PNG（前端 `canvas.toBlob` + `Tauri save` dialog）
  - 还原到画布的小工具：按 `bounding_box.absolute` 自动排到底图坐标上（已由 `flatAssetImages` 排序提供）
- 资产卡片 `AssetCard` 在 `isLayerDecomposition` 时显示一个"L"小角标，hover 看图层数

**M3 增量：合成视图升级**
- 新增 `src/components/workspace/LayerCompositeStage.tsx`：把可见图层按 zIndex 升序叠放，前景层按 `boundingBox.absolute` 定位到底图层画布上；底图之上用 8px 棋盘背景让 alpha 通道一眼可见。
- 新增 `src/lib/layer-view.ts::pickVisibleLayers` 纯函数（带 6 个 Vitest 用例），处理 `solo` 优先于 `hidden` 的逻辑。
- `AssetDetailDialog` 顶部加「合成 / 单图层」切换 pill（仅图层资产可见）；图层面板新增 Solo（`Focus` 图标，互斥）和"全部显示"按钮。
- 单图层模式保留旧逻辑（缩略图条 + 键盘 ←/→）；合成模式下 ←/→ 禁用、缩略图条淡化。
- **M3+ 补丁**：合成画布改用 `boundingBox.normalized`（0-1000 aspect-independent）作为主坐标系（5.0 Pro 官方"任意尺寸重建"方案），修复 API 报告 base size 不准（如 portrait 图返回 2048×2048）导致的 bbox 越界/错位。详情见 `doc/api-integration.md` §1.7.0。

**导出（Rust 新 command）**
- `export_layer_png(asset_id, layer_index, dest_path)` — 直接把 b64 的图层落盘（绕过 b64 解析后的下载链路）

**Skill 模板新增**
- `assets/builtin/layer-separation.md`：从一张图提取 1 底图 + N 图层，便于后续编辑
- 走 `model: doubao-seedream-5-0-pro-260628` + `layer_decomposition: true`

**冒烟**
- 用真实 5.0 Pro 跑一次图层拆分（图选带可拆元素的图）
- UI 看 1 底图 + N 图层列表
- 隐藏某图层、导出单图层为 PNG，PNG 打开正常

---

### P3 · 5.0 Pro 交互编辑（1 个 PR，~1.5 天）

> 目标：在 AssetDetailDialog 里给图加可拖的"bbox 框/箭头标注"，prompt 拼成 `<bbox>x1 y1 x2 y2</bbox>` 语法（文档示例），调用 5.0 Pro 重新出图。覆盖"局部修改"场景。

**Rust 端**
- `jimeng.rs` 加：把 `<bbox>...</bbox>` 注入 prompt 的工具函数（实际是前端 prompt 模板处理）
- 不需要新参数，5.0 Pro 走标准 generate，但前端要构造带 bbox 的 prompt

**前端（`AssetDetailDialog.tsx`）**
- 加一个"局部编辑"模式：用户画矩形 → 工具自动在 prompt 里追加"在 <bbox>x1 y1 x2 y2</bbox> 区域加一束花"
- 提供 3 种标注：
  - 矩形（`<bbox>` 语法）
  - 箭头（prompt 自由描述，Pro 支持）
  - 自由笔刷（"在此处加……"）
- 编辑结果入资产库，`payload.parentAssetId` 关联源资产（沿用现有 schema 的 `payload` 字段塞 JSON 即可，无需改表）

**Skill 模板新增**
- `assets/builtin/local-edit.md`：bbox 局部编辑工作流

**冒烟**
- 在一张 5.0 Pro 生成的图上画 bbox + "把这里改成红色"
- 新结果入资产，源资产保留
- 多次叠加编辑（在新结果上再画 bbox）

---

### P4 · 5.0 Pro 背景透明（半 PR，~半天）

> 目标：把 `background: "transparent"` 暴露给 UI，专做 UI 图标 / KV 海报的去背场景。

**Rust 端**
- `jimeng.rs` 加 `background: Option<String>` 字段（已在 P0 加上）
- 加护栏：`background: transparent` + `output_format: jpeg` → 报错（文档明示）

**前端**
- PromptBar / Skill 模板里加"去背 / 透明背景"开关
- 仅当模型是 5.0 pro 且 PNG 选中时显示
- 资产入库时把 `payload.transparent: true` 写上（用于 AssetCard 角标"PNG 透明"）

**Skill 模板新增**
- 改 `ui-icons` 模板：默认走 5.0 pro + transparent
- 新增 `assets/builtin/icon-pack-transparent.md`：6 个统一风格 UI 图标 + 透明背景

**冒烟**
- 用 5.0 Pro + transparent 出图，PS 看 alpha 通道非空
- 与 PNG jpeg 同时刻请求，trigger 报错的提示语验证

---

### P5 · 24h URL 失效兜底 + 用量统计（1 个 PR，~1 天）

> 目标：现在 24h 后 URL 失效，资产变空白。需要：(1) 后台立即下载到 `app_data_dir/assets/`，改本地路径；(2) 记 usage 字段，前端出"今日 N 张 / 估费 ¥X"。

**Rust 端**
- 在 `commands::jimeng_generate` / 流式 partial 成功时，触发一个 `tokio::spawn` 下载 URL → 本地 `app_data_dir/assets/<asset_id>/<n>.png`
- 下载完成后回写 `assets.payload.localPaths: [String]`
- 新加 Tauri command `asset_local_paths(asset_id) -> Vec<String>`，前端读
- Asset detail 加载时优先用 `localPaths`，没有再退到外链 URL
- `usage` 字段也写进 payload

**前端**
- `flatAssetImages` / `assetMainImage` 优先用 `localPaths[i]`
- SettingsPanel 加"今日用量"卡片（读最近 24h 的 usage 累加）
- 资产列表 AssetCard 显示"已本地化"角标

**冒烟**
- 生图后 `app_data_dir/assets/<id>/` 看到真实 png
- 模拟外链 404（手动改 payload 里的 URL），UI 仍能显示（走本地）

---

### P6 · Skill 模板 + Agent 工具扩展（1~2 个 PR，~2 天）

> 目标：把"全集能力"通过 Skill 模板和 Agent 工具暴露给自然语言用户。这是面向"开箱即用"最关键的一步。

**Skill 模板新增（`src/skills/builtin/`）**
| 模板 | 用什么 API | 关键参数 |
|---|---|---|
| `local-edit-bbox` | 5.0 Pro 单图生图 | prompt 拼 bbox，源图作 image 输入 |
| `icon-pack-transparent` | 5.0 Pro 组图 + transparent | `max_images: 6~9`，`background: transparent` |
| `scene-mood-light-variants` | 5.0 lite 组图 | `max_images: 4`，prompt 强调"同一场景 × 早午晚夜" |
| `character-consistency-set` | 5.0 lite 多图生组图 | `max_images: 4`，同一角色不同动作 |
| `product-shot-pack` | 5.0 lite 组图 | `max_images: 6`，主图 + 角度/细节/场景变体 |
| `infographic-poster` | 5.0 Pro | "密集文字 + 排版"专项 prompt |
| `layer-separation` | 5.0 Pro layer_decomposition | 见 P2 |

**Agent 工具（`src/lib/agent-tools.ts`）**
保留 `jimeng_generate_image` 主工具，扩其 schema：
- 加 `output_format` / `web_search` / `fast_mode` / `background` / `tools` 参数
- size 的 enum 改成动态（按当前 default model 的 presets 算）

新增 2 个工具：
- `jimeng_decompose_layers(image, model?, prompt?)` — 图层拆分
- `jimeng_local_edit(image, edit_prompt, bbox?, arrows?)` — 5.0 Pro 局部编辑

**System prompt 升级（`renderSystemPrompt`）**
- 注入"能力矩阵"（哪类需求该用哪个 API），让 LLM 知道 web_search / layer_decomposition / bbox 何时该用
- 注入新 Skill 模板列表

**Skill Picker UI**
- 在 `SkillPicker` 加分组（"基础生图 / 局部编辑 / 图层"）

**冒烟**
- 6 个新 Skill 模板都跑一遍（demo 模式即可）
- Agent 工具 3 个都让 LLM 主动调一次，schema 走通

---

## 3. 横切关注点（每阶段都带，不单列阶段）

### 3.1 错误处理统一约定

```
外部 API 原始错误
  ↓
Rust commands::xxx → Result<T, String>
  ↓
前端 invoke() 抛 Error
  ↓
catch (e) → explainError(e.message) → 用户友好提示 + toast
  ↓
toast.error 还能点"复制详情"（开发场景）
```

`commands::explain_error` 关键词表（P0 起维护，逐步加）：
- `InvalidEndpointOrModel.NotFound` / `notfound` → 模型 ID 错
- `invalidparameter` → 参数（按 model 提示）
- `authentication` / `401` → Key 错
- `accessdenied` / `403` → 子账号无权限
- `throttling` / `429` → IPM 限流（带本分钟已用估算）
- `InternalServiceError` → 服务异常（流式中断）
- `output_format` + `4.5/4.0` → 提示用 5.0
- `layer_decomposition` + 非 5.0 pro → 提示开 5.0
- `stream` + 5.0 pro → 提示用 lite 系列

### 3.2 模型能力矩阵（运行时元数据）

`src/lib/types.ts::MODEL_OPTIONS` 升级成 `{ id, name, capabilities: { ... } }`，在每阶段都更新。

```typescript
interface ModelCapabilities {
  webSearch: boolean;     // 5.0 lite
  stream: boolean;        // 5.0 lite / 4.5 / 4.0
  fastMode: boolean;      // 5.0 pro / 4.0
  background: boolean;    // 5.0 pro
  layerDecomposition: boolean;  // 5.0 pro
  interactiveEdit: boolean;     // 5.0 pro
  groupGeneration: boolean;     // 除 5.0 pro 都支持
  outputFormats: ('png' | 'jpeg')[];
  sizePresets: string[];        // ['1K','1.5K','2K'] | ['2K','3K','4K'] | ...
  maxGroupImages: number;       // 15（lite/4.5/4.0） | 1（pro）
  maxInputImages: number;       // 10（pro）| 14（其它）
  maxLayers: number;            // 16（pro）| 0
}
```

### 3.3 Demo 模式覆盖

每个阶段都把 demo 模式补齐：
- demo 模式下所有新能力返回占位（不要发真请求）
- 流式 demo 模拟 200ms 间隔吐事件
- 图层 demo 返回 1 底图 + 3 占位图层

### 3.4 文档同步

每次 PR 改 `doc/api-integration.md`：
- 加新模型 / 新参数
- 加新坑 / 新错误码
- 加新 Skill 模板用法
- 加新工作流（bbox 编辑等）

---

## 4. 阶段排序与依赖

```
P0 ──┬─→ P1 (流式，依赖 P0 的 usage 字段)
     ├─→ P2 (图层 UI，依赖 P0 的 bounding_box 解析)
     ├─→ P3 (交互编辑，依赖 P2 的图层展示基础)
     ├─→ P4 (背景透明，依赖 P0)
     └─→ P5 (本地化 + 用量，依赖 P0 + P1 的 usage)

P0 + P1 + P2 + P3 + P4 + P5 ──→ P6 (Skill + Agent 工具)
```

**可并行**：P2 / P3 / P4 / P5 在 P0 完成后可由不同人同时做。
**串行**：P6 必须等 P0~P5 全部完成（agent 工具要调用所有能力）。

---

### P7 · 对话生图能力优化：模型选择跟随 PromptBar（已完成，1 PR 1.5 天）

**目标**：让对话模式下 LLM 调工具生图时，**模型选择遵循用户在 PromptBar 的设置**，而不是 LLM 自主决定；同时把对话生图也改成流式，UX 更顺。

**改动**：
- `agent-tools.ts`：`jimeng_generate_image` 的 `model` 字段保留但降级为"受控 hint"；`renderSystemPrompt` 接受 `userModelName` 参数，注入硬规则
- `agent-router.ts`：`pickModel` 不再覆盖用户当前模型；新增 `RouteDecision.suggestedModelName` 用于 PlanCard 提示
- `agent-event.ts`：`PendingPlan.modelId/modelName` 改 optional（避免和 PromptBar 双源），新增 `suggestedModelName`
- `ProjectDetail.tsx`：
  - `runLlmTurn` 改走 `executePlanStream`（流式 partial 入库）
  - 加能力位预检（`useModelOpt.capabilities.groupGeneration` 与 `maxImages` 校验）
  - `runRulePlan` 创建的 plan 不再存 `modelId`；`onConfirmPlan` 用当前 `model.id`（fallback 兼容老 chat）
  - `renderSystemPrompt` 注入 `model.name`
- `ChatMessageList.tsx`：PlanCard 加 `currentModelName` 显示 + `suggestedModelName` 提示 + generating 时按钮禁用；ToolCallCard 工具名中文化

**为什么不在 P6 做**：P6 阶段模型只有 5.0 Lite / 5.0 Pro，schema 默认参数没那么刺眼。Skill 模板数量从 6 扩到 11 后，用户在对话里"画 4 张变体"和 PromptBar 选 Pro 的冲突就凸显了。

**已知边界**：
- 5.0 Pro 不支持流式 + 不支持组图：用户选 Pro + 要求 maxImages>1 → 自动降级 1 + toast 提示
- 改 schema 可能让 LLM 在某些 prompt 上行为微调（之前它自己选 5.0 Pro 的，现在被强制用用户选的），但功能更可预测

---

## 5. 范围外（明确不做）

| 想法 | 不做的理由 |
|---|---|
| 视频生成（Seedance） | 即梦 API 这页只讲图片，video 另开 API |
| 训练/微调 Seedream | 个人开发者用不到，预算风险高 |
| 多人协作 / review / 权限 | Y-agent 定位是单人工具 |
| 24h 外的资产云备份 | 本地化已覆盖日常 |
| 自托管文/图生图模型 | 与即梦 API 无关 |
| AR 道具、3D 模型生成 | API 不支持 |

---

## 6. 验收标准（每个 PR 都要过的最低线）

- `pnpm lint` 0 warning
- `pnpm test` 全过（新增纯函数模块补 Vitest）
- `pnpm build` 0 TS error
- `pnpm tauri info` 不退化（Rust 端改完跑 `./build-with-msvc.cmd` 一次）
- 冒烟：相关能力至少跑通 demo 模式（不烧 token 也走 UI 闭环）
- 真实 Key 冒烟：能拿出 1 张图证明 API 路径正确
- `doc/api-integration.md` 同步更新
- 若有架构变更（新模块 / 新数据流 / 新 command）→ 同步 `doc/architecture.md`

---

## 7. 时间估算与里程碑

| 阶段 | 工时 | 累计 | 里程碑 |
|---|---|---|---|
| P0 | 0.5 d | 0.5 d | 文档里所有参数都能从 UI 调通 |
| P1 | 1.5 d | 2 d | 流式 + 进度反馈上线 |
| P2 | 2 d | 4 d | 图层资产可看/可导 |
| P3 | 1.5 d | 5.5 d | bbox 局部编辑 |
| P4 | 0.5 d | 6 d | 透明背景 |
| P5 | 1 d | 7 d | 24h 失效兜底 |
| P6 | 2 d | 9 d | 全集 Skill + Agent 工具 |
| **合计** | | **~9 d** | 全集能力集成完毕 |

> 注：单人串行做的估算，并行可缩到 5~6 天。

---

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 5.0 Pro 需手动开通 | 部分能力用户用不了 | UI 显式提示"需开通"，demo 模式可走通 |
| 24h URL 失效已发生 | 旧资产可能空白 | P5 一并补全历史数据迁移 |
| 流式中途网络断 | 用户看到一半结果 | 已 partial 成功的图入库，error toast 标"已完成 X/Y" |
| IPM 500 限制 | 组图 4 张刚好 4/500 | 流式 + usage 上报，提前 1 分钟做软告警 |
| 4.5/4.0 默认 jpeg | 用户想 PNG 失败 | explain_error 明确提示，UI output_format 仅在 5.0 pro/lite 显示 |
| 用户 prompt 超过 300 字 | 模型忽略细节 | LLM system prompt 限制 + Skill 模板自带"≤300 字"检查 |
| 5.0 Pro 图层 API 单次 17 IPM | 不小心连发 5 次 = 85 IPM | UI 加"图层拆分每分钟最多 N 次"的软提示（按 IPM 500 折算） |

---

## 9. 接下来

- **本计划的 meta**：每完成 1 阶段勾掉对应小节，并 append 一段"完成记录"（commit hash + 冒烟结论）
- **同步给用户的钩子**：
  - 完成 P0 后看 UI 整体参数面板
  - 完成 P1 后看组图"图 1/4 出来"实时反馈
  - 完成 P2 后试图层拆分的资产
  - 完成 P6 后试全套 Skill 模板 + LLM 主动调工具

> 用户随时可以打断插入新需求。当前 plan 假设按 P0 → P1 → P2 → P3 → P4 → P5 → P6 推进。
