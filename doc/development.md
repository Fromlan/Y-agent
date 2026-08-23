# 开发流程

> 给 Y-agent 贡献者（目前就你一个人）的工作流参考。
> 流程设计前提：单兵 / 小团队 / Windows-only / 不强求团队协作。

---

## 1. 分支模型

- **`main`** — 唯一长期分支，永远处于"可发版"状态。CI 必须绿。
- **`<type>/<short-desc>`** — 功能/修复分支，从 `main` 拉，merge 回 `main`。
  - 例：`feature/jimeng-full-integration`、`fix/asset-grid-crash`、`refactor/skill-loader`
- 没有 `develop` / `release/*` / `hotfix/*` —— 一个人不需要这些层。

```
main ──●────────────────────●───── (tag v0.1.0)
       ╲                   ╱
        ╲─ feature/xxx ───╱
```

---

## 2. Commit 规范

Conventional Commits。`AGENTS.md` 已经定过，这里只补细节。

**格式**：
```
<type>(<scope>): <subject>

<body（可选）>

<footer（可选，BREAKING CHANGE / closes #xx）>
```

**type 取值**：
| type | 触发场景 |
|---|---|
| `feat` | 新功能（含 Skill 模板新增） |
| `fix` | bug 修复 |
| `refactor` | 不改行为的代码重构 |
| `docs` | 文档/注释 |
| `chore` | 构建/CI/依赖/版本号 bump |
| `perf` | 性能优化 |
| `test` | 仅测试 |

**scope 取值（项目约定）**：
| scope | 范围 |
|---|---|
| `agent` | `src/lib/agent*` Agent 引擎 |
| `ui` | `src/components/**` UI |
| `skill` | `src/skills/**` Skill 模板 |
| `jimeng` | `src/lib/jimeng*` 即梦 API 客户端 |
| `tauri` | `src-tauri/**` Rust 后端 |
| `build` | 打包 / CI / 依赖 |
| `docs` | 文档 |

**subject 规范**：
- 中文，祈使句，省略主语
- ≤ 50 字符
- 末位不加句号
- 例：`feat(agent): P6.1 LLM 流式输出` ✅ / `feat(agent): Add streaming.` ❌

**一个 commit 一件事**：
- 改 Skill 模板 = 一个 commit
- 改 API 客户端 = 一个 commit
- 改 UI 凑到同一类变更 = 一个 commit
- 不要把 "fix bug" + "顺手 refactor" 塞一起

---

## 3. 日常开发循环

```powershell
# 1. 拉最新 main，建分支
git switch main
git pull --rebase
git switch -c feature/my-thing

# 2. 改代码（frontend in src/，backend in src-tauri/）

# 3. 本地验证（三件套，AGENTS.md 也要求）
pnpm lint
pnpm test
pnpm build

# 4. 如果改了 src/skills/builtin/*/SKILL.md，额外跑一次 skill 校验
pnpm run validate:skills         # 本地手跑，看到 warnings 也行
# 或：
pnpm run ci:test                 # vitest + skill 校验一把梭（CI 也用这个）

# 5. Rust 端如果改了，额外跑一次
cd src-tauri
cargo check          # 至少；想稳一点 cargo clippy
cd ..

# 6. 桌面端冒烟（重要！自动化覆盖不到）
.\dev-with-msvc.cmd   # 启动 Tauri dev 窗口
# 最小集：启动 → Demo 模式 → 跑一次生图 → 切资产 tab 看结果
```

### 3.1 改 Skill 模板的强制约束（P0 起）

每个 `src/skills/builtin/*/SKILL.md` 的 Markdown 正文末尾必须包含 **"反向限制"** 段，用于：
- 防止乱码、错字、莫名符号
- 防止商标 / 知名 IP 角色 / 受版权保护的形象
- 防止画风 / 色调 / 构图漂移
- 写明本 skill 专属的"不能要"清单

校验脚本（CI 阻塞）：
- Python 版：`scripts/validate_skills.py`（`pnpm run validate:skills`）
- TS 版：`src/lib/skill.guardrails.test.ts`（自动跑进 `pnpm test`）

反向限制的标准段示例（来自 `character-sheet`）：

```markdown
## 反向限制

- 中文 / 英文乱码，错误文字，莫名符号
- 商标 / 知名 IP 角色 / 受版权保护的形象
- 违反本项目 style-contract 的色调、画风、构图
- 角色 4 区块不可缺一（左上全身 / 右上半身 / 左下表情 / 右下道具）
- 背景不可干扰主体（避免复杂纹理、人物剪影、强对比装饰）
- 不可出现多个角色混在一格；表情 4 宫格必须是同一角色
```

如果新增 / 修改 skill 后忘记加"反向限制"段，`pnpm run validate:skills` 会报 error，CI 红。

### 3.2 风格契约（Style Contract，P1）

项目级视觉契约存 SQLite 的 `projects.style_contract` JSON 列（含 8 字符 SHA-256 前缀 `checksum`）。改契约时 Rust 端会**自动**把旧 checksum 的所有资产标 `status: "stale"`，资产卡显示「风格漂移」橙色徽章。

TS 端 API：
- `loadStyleContract(projectId)` —— 读
- `saveStyleContract(projectId, contract)` —— 写（Rust 端做 checksum diff + 标 stale）
- `buildStyleContract({ art_style, palette, ... })` —— 构造 + 自动算 checksum
- `computeChecksum(contract)` —— 8 字符 hex
- `renderStyleContract(contract)` —— 把契约拼成正向 prompt 末尾段

契约样本校验脚本：`pnpm run validate:style-contract` 扫 `doc/contracts/*.json`（业务字段一致性 + checksum 重算）。`doc/contracts/example-rpg-project.json` 是模板。

### 3.3 雪碧图切分（P2）

`Tools → 雪碧图切分` 用本地 Rust 命令 `split_sprite_sheet`，不消耗 API 配额。算法：均匀网格切图（不做像素级 bounding box 检测，简单可靠）。Rust 端用 `image` crate + `zip` crate。

---

## 4. 提交流程

> 单人项目，按 user_profile 偏好：**直接 `main` 工作**，不建 feature 分支、不开 PR。
> 完整规范看 `AGENTS.md` 的"提交流程"段；这里是 dev 日常的 cheat sheet。

1. **改代码 + 本地三件套 + skill 校验**（CI 必跑项）
   ```powershell
   pnpm lint
   pnpm test
   pnpm build
   pnpm run validate:skills          # 改了 Skill 模板时
   pnpm run validate:style-contract  # 改了 style-contract 字段时
   ```
2. **一次性 commit**（一个 commit 一件事）
   ```powershell
   git add <files>
   git commit -m "feat(ui): 加资产批量导出按钮"
   ```
3. **直接推 main**
   ```powershell
   git push origin main
   ```
4. **CI 自动跑**（`ci.yml`）——只是信号源，不是门禁
   - `Frontend (lint + test + build + validate_skills + validate_style_contract)` — 见 `.github/workflows/ci.yml`
   - `Backend (cargo check)` — cargo check --locked
   - 接受 CI 偶发挂（网络 / cache / 临时依赖问题），本地通过即可

---

## 5. CI 失败怎么办

- **lint 报错**：本地 `pnpm lint:fix` 自动修一部分，剩下的手改。
- **test 报错**：本地 `pnpm test` 复现，**不要**通过在 CI 里 skip 解决。
- **build 报错**：
  - 90% 是 TS 严格模式问题——`pnpm build` 同步报错信息。
  - 如果只在 CI 失败本地通过：清缓存再试（`pnpm install --frozen-lockfile` + `cargo clean`）。
- **cargo check 报错**：本地 `cd src-tauri && cargo check` 复现。
- **依赖装不上**：检查 `package.json` 是不是用了不存在的包——`pnpm install` 会先报。

---

## 6. 提交纪律

- ❌ `--force` push 到 `main`
- ❌ 在 commit 里塞 "顺便改一下" 的无关变更（独立 commit）
- ❌ 把 API Key / 凭据 commit 进代码（参见 `AGENTS.md` Security 段）
- ❌ commit 体积 > 10MB 的单文件（参考素材在 `.gitignore` 里）
