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

# 4. Rust 端如果改了，额外跑一次
cd src-tauri
cargo check          # 至少；想稳一点 cargo clippy
cd ..

# 5. 桌面端冒烟（重要！自动化覆盖不到）
.\dev-with-msvc.cmd   # 启动 Tauri dev 窗口
# 最小集：启动 → Demo 模式 → 跑一次生图 → 切资产 tab 看结果
```

---

## 4. Pull Request 流程

1. **Push 分支到 origin**
   ```powershell
   git push -u origin feature/my-thing
   ```
2. **GitHub 上开 PR**（网页或 `gh pr create`），目标 = `main`。
3. **CI 自动跑**（`ci.yml`）：
   - `Frontend (lint + test + build)` — pnpm lint / test / build
   - `Backend (cargo check)` — cargo check --locked
   - 必须全绿才能 merge
4. **Self-review**：一个人开发也要写 PR description，至少说明：
   - 这个 PR 解决了什么 / 加了什么
   - 测试方式（手动冒烟步骤 / 自动化覆盖）
   - 是否动了 API 客户端或 Skill 模板 → 提醒自己更新 `doc/api-integration.md`
5. **Merge**：用 "Squash and merge"（单人开发，PR 里 N 个 commit 合成 1 个进 main，main 历史上每个 commit 是一件事）。

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

## 6. 不要做的事

- ❌ 直接 push 到 `main`（绕过 PR 和 CI）
- ❌ `--force` push 到 `main`
- ❌ 在 PR 里塞 "顺便改一下" 的无关变更（独立 commit，独立 PR）
- ❌ 把 API Key / 凭据 commit 进代码（参见 `AGENTS.md` Security 段）
- ❌ commit 体积 > 10MB 的单文件（参考素材在 `.gitignore` 里）
