# M6 · Skill 中心(Skill Hub)

> 阶段:M6
> 状态:规划中(未实施)
> 写于:2026-09-07
> 依赖:M2 v0.2.0(`SkillCenterPage.tsx` 骨架 + 15 个 skill 模板 + `skill.parseAll.ts` + `skill.guardrails.ts` + `validate:skills` 链路已就绪)

---

## 1. 目标

把 M2 已落地的"内置 Skill 模板"升级为**完整的 Skill 生态系统**:

- **浏览**:分类 / 搜索 / 标签筛选
- **预览**:每个 skill 一段说明 + 1 张示例图 + prompt 模板
- **启用 / 停用**:项目级开关(同一 skill 在 A 项目启用 B 项目停用)
- **自定义**:用户写自己的 skill(在线 Markdown 编辑 + 反向限制模板)
- **分享**:导出 skill 为 `.zip`,导入到另一台机器
- **市场(可选)**:从 GitHub 仓库拉取社区 skill

**用户故事**:
- 独立开发者在 Skill 中心搜"角色",看到所有角色类 skill
- 写自己的"赛博朋克角色三视图" skill,导出发给朋友
- 装朋友的"日式 RPG UI" skill,直接用

---

## 2. 现状与缺口

### 2.1 已有(可直接复用)

| 资产 | 路径 | 用途 |
|---|---|---|
| `SkillCenterPage.tsx` | `src/components/workspace/SkillCenterPage.tsx` | 列表骨架(15 条目平铺) |
| `SkillPicker.tsx` | `src/components/workspace/SkillPicker.tsx` | PromptBar 内选择器 |
| `skill.parseAll.ts` | `src/lib/skill.parseAll.ts` + `.test.ts` | 解析 15 个 SKILL.md |
| `skill.guardrails.ts` | `src/lib/skill.guardrails.ts` + `.test.ts` | 反向限制校验 |
| `validate_skills.py` | `scripts/validate_skills.py` | CI 校验 |
| `15 个 SKILL.md` | `src/skills/builtin/*/SKILL.md` | 模板内容 |
| `PromptBar /` Skill | `src/components/workspace/PromptBar.tsx` | 选 skill 触发 prompt 填充 |
| `import.meta.glob` | `src/lib/skill.ts` | 自动加载 builtin 目录 |

### 2.2 缺口

1. **没有分类 / 搜索**——15 个 skill 全部平铺,用户要滚
2. **没有预览图**——只有名字,不知道效果
3. **没有项目级开关**——所有 skill 全局可见,无法关
4. **没有用户自定义**——只能改 builtin
5. **没有导入 / 导出**——skill 锁在本地
6. **没有版本管理**——改 builtin 后老用户强制升级
7. **没有市场**——无法发现社区 skill
8. **没有 skill 文档 / changelog**——改了 builtin 没有"什么变了"提示

---

## 3. 设计

### 3.1 数据模型

新增 `src/lib/skill-hub.ts`:

```typescript
// 已存在 builtin(M2)
interface BuiltinSkill {
  id: string;                  // 'character-sheet'
  name: string;                // '角色三视图'
  category: 'character' | 'scene' | 'ui' | 'poster' | 'icon' | 'edit' | 'other';
  tags: string[];              // ['三视图', '角色', '一致性']
  markdown: string;            // SKILL.md 全文
  builtin: true;
  builtinVersion: string;      // 跟随 package.json
}

// 新增:用户自定义 + 导入
interface UserSkill {
  id: string;                  // uuid
  name: string;
  description: string;         // 一段话说明
  category: UserSkill['category']; // 同上 enum
  tags: string[];
  markdown: string;
  previewImageAssetId: string | null; // 资产库里的图作为预览
  builtin: false;
  source: 'local' | 'imported';
  sourceUrl?: string;          // 'https://github.com/.../foo.md'
  importedFrom?: string;       // 原始 zip 文件名
  createdAt: number;
  updatedAt: number;
}

// 启用状态
interface ProjectSkillEnable {
  projectId: string;
  skillId: string;             // builtin 或 user
  enabled: boolean;
}
```

**存储**:
- `user_skills` 表(SQLite)
- `project_skill_enables` 表(SQLite)
- builtin 不入库(走 `import.meta.glob` + 内存缓存)

**Rust commands**:
- `create_user_skill(skill) -> String`
- `list_user_skills() -> Vec<UserSkill>`
- `get_user_skill(id) -> Option<UserSkill>`
- `update_user_skill(skill) -> ()`
- `delete_user_skill(id) -> ()`
- `set_project_skill_enable(project_id, skill_id, enabled) -> ()`
- `list_project_skill_enables(project_id) -> Vec<ProjectSkillEnable>`
- `import_user_skill_from_zip(zip_path) -> String`(id)
- `export_user_skill_to_zip(skill_id, dest_path) -> ()`

### 3.2 UI 组件

#### `SkillHub.tsx`(完全重写现有 `SkillCenterPage`)

布局:
- 顶栏:分类 tabs(全部 / 角色 / 场景 / UI / 海报 / 图标 / 编辑 / 我的)
- 左侧:搜索框 + 标签多选过滤
- 主区:卡片网格(每卡片 1 张预览图 + 名字 + 分类 + 标签 + 启用开关)
- 右上:"新建 Skill" 按钮(打开 SkillEditor)

每卡片操作:
- 启用 / 停用(项目级,Pill toggle)
- 编辑(双击或菜单)
- 导出
- 删除(仅 user skill)

#### `SkillEditor.tsx`

布局:
- 左侧:Markdown 编辑器(用 M2 已有的 `react-markdown` 实时预览)
- 右侧:反向限制模板(6 类标准反向限制 checkbox + 自定义)
- 顶栏:标题 / 分类 / 标签 / 描述 / 预览图(从资产库选)
- 底部:校验按钮(走 `validate:skills` 同样的规则)+ 保存

#### `SkillMarketplace.tsx`(可选,M6 后期)

- 列表:从 GitHub 仓库拉 JSON 索引(类似 VSCode extension marketplace)
- 详情:同 SkillHub 卡片
- 安装:一键导入,进 enabled

### 3.3 分享格式

`skill-pack.zip` 结构:
```
my-skill-pack.zip
├── SKILL.md           # 必需,Markdown 正文
├── manifest.json      # 必需,id/name/category/tags/description
├── preview.png        # 可选,预览图(256x256)
└── examples/          # 可选,1-3 张示例图
    ├── 01.png
    └── 02.png
```

`manifest.json` 校验:
- 必须有 id / name / category
- SKILL.md 必须含"反向限制"段
- 校验走 M2 的 `validate:skills` 逻辑

### 3.4 版本管理

`builtin_version_check.ts`:
- App 启动时读 `package.json` 版本号作为 builtin 版本
- 用户项目里 `ProjectSkillEnable` 记 `builtinVersion: string`
- 升级时:显示"15 个内置 skill 升级到 v0.3.0,主要变化…"(从 CHANGELOG 读)

---

## 4. 阶段分解(可独立发布)

### M6.1 · 浏览 / 搜索 / 分类(基础,3 天)

- SkillHub 重写
- 分类 + 标签 + 搜索
- 验收:搜"角色"能过滤出 4 个角色类 skill
- Commit 数:2 个

### M6.2 · 启用 / 停用(项目级,2 天)

- ProjectSkillEnable 表 + Rust commands
- PromptBar 只显示启用 skill
- 验收:A 项目关掉 scene-mood,PromptBar 不再出现
- Commit 数:2 个

### M6.3 · 用户自定义 Skill(4 天)

- SkillEditor 在线 Markdown 编辑
- 反向限制模板
- 预览图从资产库选
- 校验链
- 验收:写 1 个"国风角色三视图" skill,保存,PromptBar 出现,生图成功
- Commit 数:3 个

### M6.4 · 导入 / 导出 ZIP(3 天)

- skill-pack.zip 打包 / 解包
- manifest.json 校验
- 验收:导出 → 重新导入 → 数据一致
- Commit 数:2 个

### M6.5 · 版本管理 + 升级提示(2 天)

- builtinVersion 字段
- CHANGELOG 集成
- 验收:升级到 v0.3.0,启动时显示 15 个 skill 升级提示
- Commit 数:1 个

### M6.6 · Skill 市场(GitHub 索引,3 天,可选)

- SkillMarketplace
- 拉 JSON 索引
- 一键安装
- 验收:从 `https://raw.githubusercontent.com/.../skills.json` 拉,看到 5 个社区 skill
- Commit 数:2 个

---

## 5. 验收标准

- 6 个用户故事(M6.1-M6.6)跑通
- `pnpm test` 新增 30+ 用例(搜索过滤 / manifest 校验 / zip 解包)
- `pnpm run validate:skills` 0 警告(用户自定义也走这个)
- `pnpm build` 0 错误
- `cargo check` 0 错误
- ZIP 导入导出 round-trip 字节一致
- 升级提示不打扰工作流(可关闭)

---

## 6. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| SkillEditor Markdown 编辑器性能 | 大文档卡 | 用 `codemirror` 或 `monaco-editor`(M2 react-markdown 只读,编辑器另选) |
| ZIP 导入恶意 skill | 加载任意 Rust 代码 | 仅解析 markdown + manifest,**不执行** skill 内的任何 JS / Rust |
| GitHub 索引被墙 | 国内用户拉不到 | 国内用 ghproxy.com 镜像,国外直接拉 |
| 内置 skill 升级破坏老数据 | 老用户资产全部失效 | 升级时只标记,不强删,AssetCard 显示"该 skill 已升级" |
| Skill 市场内容审查 | 社区上传违规 skill | 标记 + 举报 + 评分,本仓库不托管,只引用 |

---

## 7. 涉及文件

### 新建
- `src/lib/skill-hub.ts` + `.test.ts`
- `src/lib/skill-pack.ts` + `.test.ts`(zip 打包 / 解包 / 校验)
- `src/lib/builtin-version-check.ts` + `.test.ts`
- `src/components/workspace/SkillHub.tsx`(重写现有 SkillCenterPage)
- `src/components/workspace/SkillEditor.tsx`
- `src/components/workspace/SkillMarketplace.tsx`(M6.6)
- `scripts/validate_user_skill.py`(用户自定义 skill 校验)

### 修改
- `src/components/workspace/SkillCenterPage.tsx` → 删,改 `SkillHub.tsx`
- `src/components/workspace/PromptBar.tsx`(只显示启用 skill)
- `src/components/workspace/SkillPicker.tsx`(联动 ProjectSkillEnable)
- `src/lib/skill.ts`(builtin 缓存 + UserSkill 合并)
- `src-tauri/src/commands.rs`(8 个 skill_hub 命令)
- `src-tauri/src/migrations.rs`(2 个新表)
- `package.json` + `src-tauri/tauri.conf.json` + `src-tauri/Cargo.toml`(加 `zip` / `reqwest` 已用)
- `doc/api-integration.md`(Skill Hub §)
- `doc/development.md`(M6 段)
- `README.md`(路线图 M6 标 ✅)

### 依赖
- `jszip`(M2 P2 应该已加,确认)
- Markdown 编辑器:`codemirror` (~80KB) 或 `monaco-editor` (~5MB,太重)
- 选 `codemirror`

### 数据
- `user_skills` 表
- `project_skill_enables` 表
- 索引:`idx_user_skills_category` / `idx_project_skill_enables_project_id`

---

## 8. 估时

- M6.1:3 天
- M6.2:2 天
- M6.3:4 天
- M6.4:3 天
- M6.5:2 天
- M6.6:3 天(可选)
- **合计**:~2 周(M6.6 可延后)

---

## 9. 与 M2 的依赖

- `skill.parseAll.ts` / `skill.guardrails.ts` / `validate:skills.py`(M2 P6)
- `import.meta.glob` 自动加载(M2 基础)
- `react-markdown` 预览(M2 P6 已有)

---

## 10. 暂不做的

- 社区评分 / 评论
- skill 在线协作(多人编辑一个 skill)
- skill 运行统计(被调用次数 / 成功率)
- skill 内嵌 JS 代码执行(安全考虑,严格只走 Markdown)
- skill 依赖(一个 skill 引用另一个 skill)
