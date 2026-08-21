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

#### 透明工具的 PNG 校验

5.0 Pro 的 `background: transparent` **严格要求输入图是 PNG**（不是 JPEG）。`ToolsTab` 检测当前选中的资产：

- 是 JPEG → 禁用提交按钮，黄色提示条告诉用户怎么解决（"去批量组图用输出格式 PNG 重出一张" / "用局部编辑把这张图转一道再回来选"）
- `isAssetJpeg(asset)` 优先看 `payload.outputFormat`，回退看 URL 扩展名（兼容老数据 / 外部导入）

`commands::explain_error` 也加了对应的中文提示：

```
"5.0 Pro 的「背景透明」要求输入图必须是 PNG 格式。请在「去背」工具里改用 PNG 来源的资产，或先用「局部编辑」把图重出为 PNG 格式。"
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
