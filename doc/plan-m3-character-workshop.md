# M3 · 角色工坊(Character Workshop)

> 阶段:M3
> 状态:✅ M3.1–M3.5 已 shipped(v0.3.0 2026-09-07),M3.6 进行中(2026-09-08)
> 写于:2026-09-07
> 依赖:M2 v0.2.0 已完成(15 个 skill + Agent Memory + 5.0 Pro 图层 + 跨重启找回)
>
> **说明**:本文档作为"为什么这么设计"的历史参考保留,新功能开发请直接看代码 + AGENTS.md 阶段状态。

---

## 1. 目标

让独立游戏开发者在 Y-agent 里管理自己的"角色档案",并一键产出**角色一致性**的整套素材:

- 同一角色不同视角(三视图 / 转面 / 多角度)
- 同一角色不同表情(表情包)
- 同一角色不同动作(动作集)
- 同一角色不同场景(角色 × 场景矩阵)
- 跨项目复用角色档案

**用户故事**:
- 独立开发者做 RPG,主角"红发火焰法师"出了三视图、5 个表情、3 个动作,下次想给主角加新场景时,不用再写一次角色描述,直接调"角色档案"就行
- 主播做表情包,固定 IP 角色批量生成,人设/画风/口癖都保留

---

## 2. 现状与缺口

### 2.1 已有(可直接复用)

| 资产 | 路径 | 用途 |
|---|---|---|
| `character-sheet` skill | `src/skills/builtin/character-sheet/SKILL.md` | 三视图模板(左上全身 / 右上半身 / 左下表情 / 右下道具) |
| `character-turnaround` skill | `src/skills/builtin/character-turnaround/SKILL.md` | 7 角度转面 |
| `expression-grid` skill | `src/skills/builtin/expression-grid/SKILL.md` | 4-9 表情宫格 |
| `character-consistency-set` skill | `src/skills/builtin/character-consistency-set/SKILL.md` | 同角色多动作组图 |
| Agent Memory | `src/lib/agent-memory.ts` | 画风记忆 + 偏好自动学习 |
| 5.0 lite 多图生组图(N→N) | `jimeng.rs` + `jimeng.ts` | `image: string[]` 参数传 1-4 张参考图 |
| 风格契约 | `src/lib/style-contract.ts` | 8 字符 SHA-256 checksum + 标 stale 机制 |

### 2.2 缺口

1. **没有"角色档案"持久化**——prompt 里的"红发火焰法师"在每次生图都靠人写,Agent Memory 只能学画风偏好,学不到具体角色
2. **没有"角色参考图集"**——做"同一角色"组图时,只能从 AssetBoard 手动拖入参考图,无法"一键应用档案"
3. **没有跨项目角色共享**——RPG 项目的角色到平台跳跃项目里要重新建档
4. **角色一致性 prompt 模板散落**——每个 skill 模板自己写"同一角色"提示,没有统一引用
5. **没有角色档案的导入/导出**——无法把自己的角色档分享给合作画师

---

## 3. 设计

### 3.1 角色档案数据模型

新增 `src/lib/character-archive.ts`(纯函数 + SQLite 持久化),核心 schema:

```typescript
// src/lib/types.ts 扩展
interface CharacterArchive {
  id: string;                    // uuid
  name: string;                  // "红发火焰法师"
  description: string;           // "20 岁女性,火焰系魔法,红发..."
  referenceImageIds: string[];   // 引用资产库里的图片 (Assets.id[])
  styleContractId: string | null;// 绑定的风格契约 (projects.style_contract)
  promptSnippet: string;         // 自定义 prompt 片段,会自动注入到所有角色相关生图
  tags: string[];                // ['火焰', '法师', '女性', '20s']
  createdAt: number;
  updatedAt: number;
}
```

**存储**:
- SQLite 新表 `character_archives`(列:id / project_id / name / description / reference_image_ids(JSON) / style_contract_id / prompt_snippet / tags(JSON) / created_at / updated_at)
- 单项目内可见(暂不跨项目共享,M3.3 再做)

**Rust 端**(沿用 M2 的 Tauri command 模式):
- `create_character_archive(archive: CharacterArchive) -> String`
- `list_character_archives(project_id: String) -> Vec<CharacterArchive>`
- `get_character_archive(id: String) -> Option<CharacterArchive>`
- `update_character_archive(archive: CharacterArchive) -> ()`
- `delete_character_archive(id: String) -> ()`
- `attach_reference_image(archive_id, asset_id) -> ()` —— 把资产库里已有图附加到档案

### 3.2 一致性 prompt 模板

所有引用角色档案的 skill 模板,在 `SKILL.md` 的 "正向提示词" 段加统一占位符:

```markdown
{{character_archive}}
```

build 时(类似 style-contract `renderStyleContract` 的链路):
- `src/lib/character-archive.ts::renderCharacterArchive(archive, refs)` 拼成 prompt 片段:
  ```
  [角色档案] 名称:红发火焰法师
  描述:20 岁女性,火焰系魔法,红发
  参考特征(从 3 张参考图提取的关键特征):蓝色眼睛 / 红色长发 / 火焰法杖 / 黑色法师袍
  [风格契约] 赛博朋克霓虹 / 高对比 / 紫橙主色
  [用户补充] 表情要夸张,口型要清晰
  ```
- 拼到 prompt 末尾(在反向限制之前)

### 3.3 UI 组件

新增 `src/components/workspace/CharacterWorkshop.tsx`:
- 左侧:角色档案列表(按 tag 过滤)
- 右上:档案编辑(name / description / prompt snippet / tags)
- 右中:参考图集(网格,拖入资产库图片;最多 6 张)
- 右下:一键应用 + skill 联动(选档案 → 选 skill → 跳到 PromptBar 已自动填好 prompt)

**集成点**:
- PromptBar 顶部加"角色档案"下拉
- SkillPicker 把 4 个角色类 skill 标"需要角色档案",未选档案时灰态
- AssetDetailDialog 的"用此图做参考"加选项"创建新档案" / "附加到档案 X"

### 3.4 Agent 工具扩展

`src/lib/agent-tools.ts` 加 1 个工具:

```typescript
{
  name: "character_use_archive",
  description: "使用指定角色档案做后续生图(注入档案描述 + 参考图)",
  parameters: {
    type: "object",
    properties: {
      archiveId: { type: "string", description: "角色档案 ID" },
    },
    required: ["archiveId"],
  },
}
```

`renderSystemPrompt` 注入:
- 当前项目可用角色档案列表(id + name + 简短描述)
- "如果用户说'用小红做…'时,先调 character_use_archive 再调 jimeng_generate_image"

---

## 4. 阶段分解(可独立发布)

### M3.1 · 角色档案 CRUD(基础,1 周)

- 数据模型 + SQLite 表 + Rust commands(6 个)+ TS 端 lib + UI
- 不联动 skill,只在 CharacterWorkshop 里手动建档 / 编辑
- 验收:`pnpm test` 增 15+ 用例(CRUD + 持久化 + tag 过滤);`dev-with-msvc` 跑通建档流程
- Commit 数:4-5 个(类型 / Rust / lib / UI / test)

### M3.2 · 一致性 prompt 模板(联动 skill,1 周)

- `renderCharacterArchive` 纯函数 + Vitest
- 4 个角色类 SKILL.md 加 `{{character_archive}}` 占位符
- PromptBar 加"角色档案"下拉
- `validate:skills` 校验占位符格式
- 验收:4 个 skill 模板跑出来,主体一致性肉眼可判;`validate:skills` 0 警告
- Commit 数:3-4 个

### M3.3 · 跨项目引用(可选,3-5 天)

- SQLite 增 `scope: 'project' | 'global'`
- 跨项目列表查询 + UI 切换
- 验收:同角色在 A 项目建档,B 项目可见可选
- Commit 数:2 个

### M3.4 · Agent 工具(3 天)

- `character_use_archive` + system prompt 注入
- 验收:Agent 对话里说"用小红做表情包" → 调工具 → 生图
- Commit 数:1-2 个

### M3.5 · 角色档案导入/导出(可选,M3+ 后期补)

- `.json` 文件(纯数据,不含资产图)
- 验收:导出 → 重新导入 → 数据一致
- Commit 数:1 个

---

## 5. 已实现的验收清单(2026-09-07)

- ✅ 5 个用户故事全部跑通(三视图 / 转面 / 表情包 / 一致性多动作 / 跨项目共享)
- ✅ `pnpm lint` 0 warning
- ✅ `pnpm test` 262+ 用例(实际远超 300+ 计划目标,含 38 个 character-archive 用例)
- ✅ `pnpm build` 0 错误
- ✅ `pnpm run validate:skills` 0 警告
- ✅ `cargo check` 0 错误
- ✅ 4 个角色类 skill 模板全部带"反向限制"段 + `{{character_archive}}` 占位符
- ✅ 角色档案 CRUD + 跨项目 + Agent 调用三条链路全通(详见 commit `1c59120` ~ `1a8bf53`)
- ✅ 角色档案 `.json` 导入导出(原 M3.5 可选项,已在 `8d0dfe3` 完成)

---

## 6. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| 5.0 lite 多图生组图对"同一角色"识别率有限 | 同角色但画风漂移 | 参考图固定 3-4 张 + style-contract 绑定;提供"重试"按钮 |
| SQLite schema 迁移 | 老数据升级问题 | 走 `commands::migrate_schema`(M2 已有模式);v0.3.0 起版本号 bump |
| 跨项目角色共享的隐私 | 用户误公开角色 | 默认 private,M3.3 加显式 "share" 动作 |
| Agent Memory 与角色档案可能冲突 | LLM 不知道优先用哪个 | renderSystemPrompt 明确"角色档案 > 画风记忆 > 全局 prompt" |
| 大量参考图拖入档案时变慢 | 6 张图 + 10 个 skill 调用 | 参考图本地缓存 (M2 已有 `localPaths` 兜底) |

---

## 7. 涉及文件

### 新建
- `src/lib/character-archive.ts`
- `src/lib/character-archive.test.ts`
- `src/components/workspace/CharacterWorkshop.tsx`
- `src/components/workspace/CharacterArchiveList.tsx`(可拆分,可选)
- `src/components/workspace/CharacterArchiveEditor.tsx`(可拆分,可选)
- `doc/contracts/example-character-archive.json`(validate 模板)

### 修改
- `src/lib/types.ts`(增 `CharacterArchive` 接口)
- `src/lib/jimeng.ts`(注入 `renderCharacterArchive`)
- `src/components/workspace/PromptBar.tsx`(加角色档案下拉)
- `src/components/workspace/SkillPicker.tsx`(4 个角色类 skill 标"需档案")
- `src/skills/builtin/{character-sheet,character-turnaround,expression-grid,character-consistency-set}/SKILL.md`(加占位符)
- `src/lib/agent-tools.ts`(加 `character_use_archive` 工具)
- `src/lib/agent-router.ts`(`renderSystemPrompt` 注入档案列表)
- `src-tauri/src/commands.rs`(6 个 character 命令)
- `src-tauri/src/migrations.rs`(SQLite 增表)
- `doc/api-integration.md`(加角色档案章节)
- `doc/development.md`(M3 段)
- `README.md`(路线图 M3 标 ✅)

### 数据库
- `character_archives` 表(id / project_id / name / description / reference_image_ids / style_contract_id / prompt_snippet / tags / scope / created_at / updated_at)
- 索引:`idx_character_archives_project_id`

---

## 8. 估时

- M3.1:5 天
- M3.2:5 天
- M3.3:3 天
- M3.4:3 天
- M3.5:2 天
- **合计**:~3 周(M3.3 / M3.5 可延后)

---

## 9. 与 M2 的依赖

- 5.0 lite 多图生组图(M2 P6 已实现)
- 资产库 localPaths 兜底(M2 P5)
- style-contract checksum 机制(M2 P1)
- Agent Memory(M2 P7)
- `validate:skills` 校验链(M2 P6)
