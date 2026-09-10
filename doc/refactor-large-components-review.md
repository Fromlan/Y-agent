# 大型 React 组件拆分 + Rust 端顺手扫 — 重构报告

> 评审日期：2026-09-10
> 范围：3 个超大 React 组件 + 1 个巨型 hook + Rust commands.rs 扫读
> 状态：实施完成 2/3 commit;Rust 报告列后续

---

## 0. 背景与目标

Y-agent M3.x 阶段三个 React 组件已膨胀至:

| 文件 | 旧体量 | hook 数量 | 内嵌子组件 |
|---|---|---|---|
| `AssetDetailDialog.tsx` | 47 KB | 16 | EditBar(实际是内嵌 state) |
| `ToolsTab.tsx` | 41 KB | 28 | ToolModal / ProgressBar / 6 个 Form |
| `ProjectDetail.tsx` | 36 KB | 28 | — (已下沉到 hook) |
| `useChatSubmit.ts` | 30 KB | 1 | 5 个 sibling useCallback |

且 useChatSubmit 注释明确说「ProjectDetail 里 chat 流的所有 callback 1:1 搬过来」,说明它本身就是巨型 hook 的早期抽离产物。

**目标**: 按既有 `tools/` / `hooks/` 子目录约定做有控制拆分,不引入新依赖、不改视觉/交互语义。

---

## 1. Plan 阶段的判断偏差(诚实记录)

**实施时发现**: Plan 阶段有几处事实基础不成立,实施了修订版:

| Plan 假设 | 实际情况 | 修订 |
|---|---|---|
| `EditBar` 是独立函数组件 | 实际没有。AssetDetailDialog 47 KB 中,**局部编辑**只占 ~3.1 KB(state + 1 个 useCallback),剩余 ~44 KB 是**图层管理 UI**(hiddenLayers / solo-composite / jump-to-layer) | 跳过 LocalEditPanel 抽取 |
| `EditBar` 与 `LocalEditForm` 是重复实现 | 形态不同(内嵌 state vs 独立 Form),不构成直接重复 | — |
| `SplitSpriteForm` 不存在 | 实际存在 6.3 KB | 已抽出到独立文件 |
| useChatSubmit 抽 3 个 hook 时 `runLlmTurn` 是「400+ 行」 | 实际 15 KB,闭包捕获 hook 顶层所有 props + 4 个流式辅助 | `runLlmTurn` 留原位,只抽 2 个 hook |

**结论**: Plan 阶段的「合并 EditBar + LocalEditForm」不是真正的重复实现;真正的负担(图层 UI + 巨型 hook)各有不同的拆分路径。本次只做了能成立的部分,跳过有偏差的部分。

---

## 2. 已实施(2 个 commit)

### Commit 1 — `refactor(ui): ToolsTab 子组件拆到 tools/ 子目录`

新增 10 个文件,`ToolsTab.tsx` 从 39 KB → 4.7 KB(↓ 88%):

```
src/components/workspace/tools/
├── tool-constants.tsx       # TOOLS / ToolKind / ToolDef / PRO_ID / LITE_ID / PRO_NAME / isAssetJpeg
├── form-primitives.tsx      # FormProps / ImageFormProps / Field / Submit
├── ProgressBar.tsx
├── ToolModal.tsx
├── BatchForm.tsx
├── WebSearchForm.tsx
├── TransparentForm.tsx
├── LayerForm.tsx
├── LocalEditForm.tsx
└── SplitSpriteForm.tsx
```

**关键设计**:

- `TOOLS` 常量 + `ToolKind` 类型从 `ToolsTab.tsx` 提到 `tool-constants.tsx`,被 ToolModal(用于 kind → title/icon/tag 查找) 和 ToolsTab(网格渲染)共享。
- `FormProps` / `ImageFormProps` 提到 `form-primitives.tsx`,被 6 个 Form 共享。
- `ToolModal` 在 `tools/` 子目录内 import 各 Form,符合既有模式(`AssetPicker`/`runTool` 已在 `tools/` 下)。
- `runTool` 仍保留 `type ToolProgress` 导出,ToolsTab 用它给 `progress` state 标类型。

### Commit 2 — `refactor(agent): useChatSubmit 抽出 useRulePlan + usePlanActions`

新增 2 个文件,`useChatSubmit.ts` 从 27 KB → 21 KB(↓ 22%):

```
src/lib/hooks/
├── useRulePlan.ts      # runRulePlan 2.6 KB 抽出
├── usePlanActions.ts   # onConfirmPlan + onCancelPlan 4.4 KB 抽出
└── useChatSubmit.ts    # 留 onSubmitChat + runLlmTurn(15 KB,不动)
```

**为什么 `runLlmTurn` 留原位**: 它在 `useChatSubmit` 顶层闭包中捕获了:
- hook 顶层解构的 ~10 个 props(setMessages / agentCtx / characterArchives / ...)
- `messages` / `refs`(来自 onSubmitChat 上下文)
- `events` / `off` / `saveTimer`(onSubmitChat try 块内的局部状态)
- `pendingCharacterArchiveRef`(mutable ref)
- 4 个流式辅助(`updateAgent` / `appendDelta` / `appendToolCall` / `updateToolCall`)

要把这些全部参数化,props 数会从 22 个膨胀到 30+,且每个 useCallback 的 deps 数组都要重写。**风险高于本次会话能承担的范围**。

如未来要拆 `runLlmTurn`,建议用 `ChatSubmitContext`(Props 收敛到一个 Context)或把 LLM 流式循环抽到独立的纯函数模块(不依赖 React state)。

---

## 3. 未实施(跳过 + 原因)

### Plan 第 1 步 — LocalEditPanel 抽取合并

**跳过原因**: 修订版 + Plan 阶段判断错。AssetDetailDialog 中没有独立 `EditBar` 组件,局部编辑只是 ~3.1 KB 的内嵌 state。

如未来要做 AssetDetailDialog 拆分,真正的方向应该是抽 **`LayerPanel`**(图层管理 UI 占 ~30 KB):
- 缩略图条 + LayerThumb 列表
- hiddenLayers toggle
- solo / composite 视图切换
- jump-to-layer 按钮
- 详情折叠(description / bbox 坐标)

这块代码跟 AssetDetailDialog 主壳耦合很紧(共享 `hiddenLayers` / `viewMode` state),可以抽成 `<LayerPanel images={...} viewMode={...} onViewModeChange={...} hiddenLayers={...} />`,但工作量和收益评估未做,留作后续。

### Plan 第 5 步 — ProjectDetail 微调

**跳过原因**: 36 KB 中绝大部分已下沉到 `useProjectBootstrap` / `useVideoTaskBoard` / `useChatSubmit`,剩余是顶层 tab 编排(4 个 tab 切换 + 几个 useState),无明显可抽之处。commit 2 完成后 ProjectDetail 不直接受影响,跳过即可。

---

## 4. Rust 端扫读结果(后续工单)

读 `src-tauri/src/commands.rs` 发现的 3 处味道。**不在本次范围**,记为后续:

### 4.1 `resolve_local_image_urls` 边界错配(~60 行)

```rust
fn resolve_local_image_urls(images: Vec<String>, app: &AppHandle) -> Vec<String> {
    // 解析 http://asset.localhost/<encoded-path> 等 4 种 URL 形式
    // 解码 → canonicalize → 校验在 app_data_dir/assets 下 → 读字节 → base64
}
```

函数注释承认:「解决前端 ToolsTab / 局部编辑 把 localPath 通过 image-resolver 转成 http://asset.localhost/... 后,jimeng 服务端在公网 fetch 不到」。

**问题**: 前端 `src/lib/image-resolver.ts` 已经做了一次协议转换(`localPath` → `http://asset.localhost/...`)→ Rust 端又做了一次反向转换(`http://asset.localhost/...` → `data:image/...;base64,...`)。**两边都知道同一份协议细节**,这是经典的「边界错配」。

**建议**:
- 前端调用 jimeng 之前,**一次性**把 `localPath` 转成 `data:image/...;base64,...`(`image-resolver` 直接吐出 base64)
- Rust 端 `resolve_local_image_urls` 退化为「白名单读字节 + base64」,不识别任何 URL 协议
- 或者:前端把 `localPath` 直接传给 Rust,Rust 做**唯一的**读字节 + base64 工作

### 4.2 `map_err` 丢上下文

```rust
fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}
```

整个 commands.rs 用这个把所有错误转成 `String`,经过几层调用后,前端拿到的就是一行短文本,丢了 chain / source / location。

**建议**: 引入 `thiserror` 在 domain 层定义结构化错误(`BackendError::Db / Jimeng / Io / AssetNotFound`),IPC 边界再用 `serde` 序列化。前端能用 `code` 字段做更友好的解释(`explainError` 现在只能猜)。

### 4.3 应用数据目录寻址散落

注释指出的「Tauri 应用数据目录寻址」出现在:
- `commands.rs`(`resolve_local_image_urls` 内的 `app_data_dir().join("assets")`)
- 推测 `storage.rs` 也有类似路径

**建议**: 在 `state.rs` 或新增 `paths.rs` 集中导出 `fn assets_root(app: &AppHandle) -> PathBuf`,所有调用方都通过这一个函数拿到 canonical path,避免重复 canonicalize + 防越权校验。

---

## 5. 验收数据

### 5.1 三件套全绿

| 步骤 | lint | test | build |
|---|---|---|---|
| 1 (ToolsTab) | ✓ | ✓ 314 tests | ✓ |
| 2 (useChatSubmit) | ✓ | ✓ 314 tests | ✓ |

`pnpm run validate:skills` 和 `validate:style-contract` 也均通过(警告为 pre-existing)。

### 5.2 行为不变性

- **prompt 文案 / UI 像素 / Toast 文案 / 错误信息**:零修改
- **props 形状**:对外接口保持(`ToolsTab` 的 `Props` / `useChatSubmit` 的 `UseChatSubmitArgs` / `UseChatSubmitAPI` 都不变)
- **commit 顺序**:严格按计划

### 5.3 文件体积变化

| 文件 | 旧 | 新 | Δ |
|---|---|---|---|
| `ToolsTab.tsx` | 39 KB | 4.7 KB | ↓ 88% |
| `useChatSubmit.ts` | 27 KB | 21 KB | ↓ 22% |
| `src/components/workspace/tools/` | 17 KB(2 文件) | 51 KB(10 文件) | ↑ 200% |
| `src/lib/hooks/` | 30 KB(1 文件) | 36 KB(3 文件) | ↑ 20% |
| **合计** | **113 KB** | **113 KB** | ≈ 0 |

**收益**: 单一最大文件 47 KB → 21 KB。**风险**: 文件总数增加(子目录深度 +1),需要在 review 时保持「按目录查找」习惯。

---

## 6. 后续(优先级排序)

1. **Rust 端 `resolve_local_image_urls` 重构**(4.1)— 影响本地路径 ↔ Jimeng API 的可靠性,有现网 bug 风险
2. **AssetDetailDialog 抽 `LayerPanel`**(Plan 第 1 步修订)— 47 KB 中真正大块是图层 UI,值得做
3. **`runLlmTurn` 进一步切分** — 需要 `ChatSubmitContext` 或纯函数化,改动面广,留作 M4
4. **Rust 错误结构化**(4.2)+ 路径集中(4.3) — 改善可观测性,可与 #1 一起做

---

## 7. 冒烟清单(交付后必跑)

按 AGENTS.md「冒烟最小集」:

- [ ] **ToolsTab 6 个工具各跑 1 次**(commit 1):批量 / 联网 / 去背 / 图层 / 局部编辑 / 雪碧切分
- [ ] **Agent 对话模式完整流**(commit 2):输入 prompt → LLM 流式 → 工具调用 → 生成资产
- [ ] **规则路由降级路径**(commit 2):断开 LLM Key → 输 prompt → 看 PlanCard → 点「开始生成」→ 看资产入库
- [ ] **取消路径**(commit 2):PlanCard → 点「取消」→ 消息从 chat 流消失
