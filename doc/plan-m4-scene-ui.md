# M4 · 场景 + UI 模板(Scene & UI Templates)

> 阶段:M4
> 状态:规划中(未实施)
> 写于:2026-09-07
> 依赖:M2 v0.2.0(scene-mood / scene-mood-light-variants / ui-page / ui-component-breakdown / kv-poster / infographic-poster 6 个 skill 已就绪)

---

## 1. 目标

把"场景"和"UI"两类高频需求做成**可视化矩阵编辑器**,用户不再写 prompt,而是用网格 + 提示词块组合出整套素材:

- **场景**:同一场景 × 早/午/晚/夜 × 4 风格 = 16 张矩阵
- **UI 页面**:整页 mockup(首页 / 详情 / 设置) + 多种主题切换
- **UI 组件拆解**:同一组件(button / card / nav)拆出"主态 / 悬停 / 禁用 / 加载"
- **KV 海报**:海报排版骨架(主视觉 + 标题 + 副标题 + CTA)+ 多种文案填词
- **信息图**:数据可视化排版(柱状 / 饼图 / 流程图)+ 多种主题

**用户故事**:
- 关卡设计师做 4 个时段场景预览,直接拖矩阵
- UI 设计师出整套主题切换 mockup
- 运营做活动海报,只换文案不出图

---

## 2. 现状与缺口

### 2.1 已有(可直接复用)

| 资产 | 路径 | 用途 |
|---|---|---|
| `scene-mood` skill | `src/skills/builtin/scene-mood/SKILL.md` | 单图场景氛围 |
| `scene-mood-light-variants` skill | `src/skills/builtin/scene-mood-light-variants/SKILL.md` | 4 时段变体(早/午/晚/夜) |
| `ui-page` skill | `src/skills/builtin/ui-page/SKILL.md` | UI 整页 mockup |
| `ui-component-breakdown` skill | `src/skills/builtin/ui-component-breakdown/SKILL.md` | 组件拆解 |
| `ui-icons` skill | `src/skills/builtin/ui-icons/SKILL.md` | 图标套装 |
| `kv-poster` skill | `src/skills/builtin/kv-poster/SKILL.md` | 海报排版 |
| `infographic-poster` skill | `src/skills/builtin/infographic-poster/SKILL.md` | 信息图 |
| 5.0 lite 组图(1→N) | `jimeng.rs` | `max_images: 4-9` |
| AssetBoard 资产网格 | `src/components/workspace/AssetBoard.tsx` | 矩阵展示载体 |

### 2.2 缺口

1. **没有"场景矩阵"UI**——`scene-mood-light-variants` 现在只生成 4 张独立图,无法"同一布局不同主题"网格预览
2. **没有 UI 主题切换**——`ui-page` 出 1 张图,但主题色固定,无法一键切"暗色 / 浅色 / 霓虹"
3. **UI 组件状态拆解分散**——`ui-component-breakdown` 出 4 张,需要手动对比
4. **海报文案填词工具缺失**——`kv-poster` 出 1 张固定文案图,改文案要重生成
5. **信息图数据驱动缺失**——`infographic-poster` 用 prompt 描述数据,不精确

---

## 3. 设计

### 3.1 场景矩阵编辑器(`SceneMoodBoard.tsx`)

**交互**:
- 顶部:场景描述输入框(1 段)
- 主区:4 × N 网格(列 = 时段早/午/晚/夜,行 = 风格赛博朋克/写实/卡通/水彩)
- 单元格:点击生图,生成后显示缩略图;hover 看 prompt
- 右侧:风格契约 + 角色档案联动
- 底部:批量提交(整矩阵 16 张组图,IPM 限流下自动分批)

**实现**:
- `src/lib/scene-matrix.ts::buildSceneMatrixJobs(desc, timeSlots, styles)` → 16 个 `JimengGenerateRequest`
- 复用 5.0 lite 组图,`max_images: 4`,分 4 批提交
- 资产入库时在 `payload.matrixTag = "scene-mood-board"` 标记
- AssetBoard 加"按 matrixTag 过滤"按钮

### 3.2 UI 页面主题切换器(`UIThemeSwitcher.tsx`)

**交互**:
- 顶部:`ui-page` 描述 + 主图
- 右侧:主题面板(浅色 / 暗色 / 霓虹 / 复古 / 极简 / 国风)
- 主区:6 个主题的整页 mockup 网格
- 实现:同一 prompt + `optimize_prompt_options.mode = fast` + 主题色追加到 prompt 末尾

### 3.3 UI 组件状态拆解(`UIComponentBreakdownStage.tsx`)

**交互**:
- 组件描述(Button / Card / Nav)
- 状态勾选:default / hover / active / disabled / loading
- 网格:每行一个状态,每列一个变体(主色 × 边框 × 阴影)
- 资产入库时 `payload.componentState = "hover" / "disabled" / ...`

### 3.4 KV 海报填词(`KVPosterComposer.tsx`)

**交互**:
- 选 KV 海报模板(`kv-poster` skill)
- 左侧:文案输入(主标题 / 副标题 / CTA 文字 / 副文案)
- 右侧:排版骨架(主视觉位置 / 文字位置 / 配色)
- 底部:批量出 6 张同骨架不同文案的图(用于 A/B 测试)

**实现**:
- prompt 模板:`{visual_layout} 文字内容: {main_title} | {sub_title} | {cta}`
- 6 张不同文案共享视觉布局,只换文字

### 3.5 信息图数据驱动(`InfographicComposer.tsx`)

**交互**:
- 选数据源(JSON / 表格粘贴)
- 选图表类型(柱状 / 饼图 / 流程图)
- 输入关键数据点
- 自动生成 prompt 模板 + 1 张图

**限制**:`infographic-poster` skill 本身就是 1 张 prompt 描述,M4 只在前端加 JSON→prompt 转换,不做真正的数据可视化引擎(超出范围)

---

## 4. 阶段分解(可独立发布)

### M4.1 · 场景矩阵(基础,1 周)

- `SceneMoodBoard.tsx` + `scene-matrix.ts`
- 4 时段 × 4 风格 = 16 张,支持批量生图
- 验收:矩阵自动生图,资产入库,网格预览对齐
- Commit 数:3 个

### M4.2 · UI 主题切换(4 天)

- `UIThemeSwitcher.tsx`
- 6 主题预设,主题色 palette 注入
- 验收:同描述 + 6 主题 = 6 张不同主题色整页
- Commit 数:2 个

### M4.3 · UI 组件状态拆解(3 天)

- `UIComponentBreakdownStage.tsx`
- 5 状态 × 3 变体 = 15 网格
- 验收:Button 拆解 5 状态,AssetCard 显示状态 tag
- Commit 数:2 个

### M4.4 · KV 海报填词(3 天)

- `KVPosterComposer.tsx`
- 6 文案变体,排版骨架固定
- 验收:同骨架不同文案 6 张,排版一致
- Commit 数:2 个

### M4.5 · 信息图数据驱动(3 天)

- `InfographicComposer.tsx`
- JSON→prompt 转换器
- 验收:粘贴 5 行数据 → 出 1 张信息图
- Commit 数:2 个

---

## 5. 验收标准

- 5 个用户故事跑通
- 6 个相关 skill 全部带"反向限制"段
- `pnpm test` 新增 25+ 用例(矩阵计算 / 文案填词 / 主题 palette 注入)
- `pnpm run validate:skills` 0 警告
- `pnpm build` 0 错误
- `cargo check` 0 错误
- 资产库 `matrixTag` 过滤可用,场景 / UI / 海报分类清楚

---

## 6. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| 16 张矩阵触发 IPM 限流 | 部分图生图失败 | 分批提交 + 重试 + 进度提示 |
| 主题色 palette 注入 prompt 反而失真 | 主题色被画风覆盖 | palette 写在 prompt 最末 + 反向限制加"色调严格遵循" |
| 海报骨架 LLM 理解不一致 | 6 张排版不统一 | 模板走 `kv-poster` skill 已有骨架,只换文案不重排 |
| 信息图数据驱动精度有限 | LLM 数字理解差 | M4 阶段不追求精度,只做"草图级" |
| UI 主题切换试错成本 | 用户重复出图 | 加"重新生图"按钮 + 缩略图历史 |

---

## 7. 涉及文件

### 新建
- `src/lib/scene-matrix.ts` + `.test.ts`
- `src/lib/ui-theme-palette.ts` + `.test.ts`
- `src/lib/kv-poster-variants.ts` + `.test.ts`
- `src/components/workspace/SceneMoodBoard.tsx`
- `src/components/workspace/UIThemeSwitcher.tsx`
- `src/components/workspace/UIComponentBreakdownStage.tsx`
- `src/components/workspace/KVPosterComposer.tsx`
- `src/components/workspace/InfographicComposer.tsx`

### 修改
- `src/components/workspace/AssetBoard.tsx`(加 matrixTag 过滤)
- `src/components/workspace/SkillPicker.tsx`(分组:场景 / UI / 海报 / 信息图)
- `src/lib/types.ts`(增 `AssetPayload.matrixTag` 字段)
- `src/lib/jimeng.ts`(场景/UI 类的 prompt 拼接辅助)
- `doc/api-integration.md`(矩阵生图 IPM 限流策略)
- `README.md`(路线图 M4 标 ✅)

---

## 8. 估时

- M4.1:5 天
- M4.2:4 天
- M4.3:3 天
- M4.4:3 天
- M4.5:3 天
- **合计**:~2.5-3 周

---

## 9. 与 M3 的依赖

- 角色档案(M3 完成后可用,但 M4 不强求)
- style-contract(M2 已就绪,场景/UI 风格契约必用)
- Agent Memory(M2 已就绪,UI 主题可学习)

---

## 10. 暂不做的

- 真正的数据可视化引擎(用 prompt 描述足够)
- 排版引擎(海报骨架靠 skill 模板)
- 主题色实时调整(M4 阶段只做 6 预设)
- 海报导出 PSD(M4 阶段只导出 PNG)
