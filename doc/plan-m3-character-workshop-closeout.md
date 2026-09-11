# M3.6 · 角色工坊收尾报告

> 阶段:M3.6
> 状态:✅ 已完成(2026-09-11)
> 写于:2026-09-11
> 前置:M3.1-M3.5 已 shipped(v0.3.0 2026-09-07)

---

## 1. 目标

M3.6 阶段对角色工坊做"控制流 + UX 打磨",不引入新功能,只把已经存在的
Editor / Picker / `character_use_archive` Agent 工具做到稳定可用。

---

## 2. 已完成清单

| 项 | 文件 | 状态 |
|---|---|---|
| Workshop 改为受控组件 | `src/components/workspace/CharacterWorkshop.tsx` | ✅ |
| Editor 加 savingStatus chip(草稿/saved/saving) | `src/components/workspace/CharacterArchiveEditor.tsx` | ✅ |
| 切档案 flushPending 防丢草稿 | 上同 | ✅ |
| Picker projectId 真实化(从 session 拿) | `src/components/workspace/CharacterArchivePicker.tsx` | ✅ |
| Tauri IPC `CharacterArchiveRow` 自定义 Serialize 修 `tags_json` 字段名错配 | `src-tauri/src/commands.rs` (M3.6 patch) | ✅ |
| ErrorBoundary 兜底(渲染异常不白屏) | `src/components/shared/ErrorBoundary.tsx` | ✅ |

---

## 3. 仍可优化(M4+ 路线)

### 3.1 数据模型

- **角色档案 scope**:当前实现以"项目内可见"为主,M3.3 跨项目引用未完整闭环;
  重新评审时建议把 scope=global / project 二级状态机化。
- **tag 体系**:档案的 `tags` 当前是字符串数组,数量少;若用户开始建大量档案,
  需要迁移到 `tag_entity` 表 + 多对多关联,以支持 tag 重命名 / 合并。

### 3.2 编辑器

- **图片裁剪**:参考图附件(M3.5 加)目前只能整图上传;若要做"框选角色局部",
  需集成 bbox 编辑能力(类似 `local-edit-bbox` 的局部编辑)。
- **批量编辑**:选中多个档案统一改 tag / scope,目前只能逐个点开改。
- **撤销栈**:Editor 改了一半发现改错了,只能重新输;加 undo/redo 会大幅提升可用性。

### 3.3 Picker

- **搜索**:当前只按 name 模糊匹配;若档案超过 50 个,需支持 description / tag 全文检索。
- **分组**:按 tag 或 scope 分组展示,当前是平铺列表。
- **最近使用**:UI 顶部加 "最近 5 个" 区域,提升高频档案的可达性。

### 3.4 Agent 集成

- **`character_use_archive` 工具**:M3.4 已实现,但 LLM 调它的时机不稳定;
  需要在 `src/lib/agent-flow.ts` 的 `executePlan` 路径里明确"档案被引用时
  prompt 末段拼接 `{{character_archive}}`"的契约文档 + 测试。
- **多档案组合**:用户可能有"主角 + 配角 + 场景"多档案,目前每次只能引用 1 个;
  若 Agent 能自动按 prompt 语义选多个档案拼装,体验会大幅提升。
- **角色一致性评估**:生成的图里"角色一致性"是用户主观判断;若能加一个
  "与档案参考图的相似度评分"(embeddings + cosine similarity),能帮用户判断。

### 3.5 导入/导出

- **格式版本号**:M3.5 的 `.json` 导出文件没有 version 字段,未来字段变更时
  兼容性不可控;v2 时务必加 `version: 1`。
- **批量导入**:目前只能逐个 .json 导入;若用户从别的工具导出一批,需要"批量导入 + 冲突处理"。
- **图片附件同步**:导入档案时,参考图附件是引用本地路径;跨机器迁移会断链;
  需要"打包图片到 .zip 一并导出 / 导入时按需下载"。

---

## 4. 验收数据

- 三件套全绿:`pnpm lint / test / build`
- 现有 18 个测试文件全过(含 `character-archive.test.ts` 494 行)
- 角色工坊冒烟通过:
  - 创建档案 → 编辑 → 保存 → 切到对话 tab → 提示词用 `/` 触发 skill → 选 `character-sheet` →
    看到 prompt 自动拼 `[角色档案]` 段 → 生成的图一致性符合预期

---

## 5. 与 M4 的衔接

M4 路线图(`doc/plan-m4-scene-ui.md`)的目标是"场景+UI 模板矩阵编辑器"。
角色档案在 M4 中预期作为"角色 × 场景矩阵"的左轴引用,所以 M3.6 的稳定
状态是 M4 的前置依赖。

---

## 6. 相关 commit

参考 `git log --grep="character"` 或 `git log --grep="M3.6"` 查看 M3.6 阶段所有改动。