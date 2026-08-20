# AGENTS.md

Y-agent — 游戏美术 AI 工作台。Tauri 2 桌面应用，封装即梦（豆包 Seedream）图像生成 API，提供 LLM 驱动的 Agent 对话模式。

## Setup commands

- Install deps: `pnpm install`
- Dev (Vite only): `pnpm dev`                          # 纯前端，端口 1420
- Dev (full Tauri app, Windows): `.\dev-with-msvc.cmd`  # 包装 npm run tauri:dev，注入 MSVC 环境
- Build (Vite only): `pnpm build`                       # tsc -b && vite build
- Build (full Tauri installer, Windows): `.\build-with-msvc.cmd`
- Preview build: `pnpm preview`
- Lint: `pnpm lint`                                     # ESLint，--max-warnings 0
- Lint (fix): `pnpm lint:fix`
- Test: `pnpm test`                                     # Vitest 单测（一次性）
- Test (watch): `pnpm test:watch`
- Tauri CLI: `pnpm tauri <subcommand>`                  # 例如 pnpm tauri info

> 桌面端必须用 `dev-with-msvc.cmd` / `build-with-msvc.cmd`，因为 Rust 端需要 MSVC 工具链。
> 不要直接 `pnpm tauri:dev` —— 它在多数 Windows 机器上会因找不到 linker 失败。

## Project layout

- `src/` — React 18 + TypeScript 前端
  - `src/components/` — UI 组件（layout / settings / shared / workspace）
  - `src/lib/` — API 客户端、Agent 引擎、工具函数
  - `src/skills/builtin/` — M2 预置的 6 个 Skill 模板（character-sheet / character-turnaround / expression-grid / kv-poster / scene-mood / ui-icons）
- `src-tauri/` — Rust 后端（Tauri 2 + reqwest + rusqlite + aes-gcm）
  - `src-tauri/capabilities/` — Tauri 权限声明
  - `src-tauri/icons/` — 应用图标（多平台）
- `doc/` — 项目文档（`plan-jimeng-full-integration.md` / `api-integration.md` / `development.md` / `release.md`）
- `public/` — 静态资源
- `dev-with-msvc.cmd` / `build-with-msvc.cmd` — Windows MSVC 环境包装脚本

## Code style

- TypeScript strict mode 已开（`tsconfig.json: strict: true`），还有 `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch`
- 路径别名：`@/*` → `./src/*`（见 `vite.config.ts` 和 `tsconfig.json`）
- 样式：Tailwind 3 + 自定义色板（`tailwind.config.js` 的 bg/border/text/accent token），**优先用 token**，不要硬编码 hex
- 类名顺序：layout → size → spacing → color → state
- ESLint（`.eslintrc.cjs`）开 react-hooks 规则；改完代码后跑 `pnpm lint` + `pnpm test` + `pnpm build` 三件套
- Rust 端改完后跑 `.\build-with-msvc.cmd` 验证编译

## Testing instructions

- **有 Vitest 单测**（`src/**/*.test.ts`）。当前覆盖 agent-memory / agent-router / logger 三组纯函数模块。新增纯函数时配套加测试
- **没有 e2e 测试**。每个里程碑靠手动冒烟：见 `doc/plan-jimeng-full-integration.md`
- 冒烟最小集：启动应用 → 选「Demo 模式」→ 跑一次生图 → 切到「资产」tab 看结果
- 新功能必须：
  1. 0 TS error / 0 warning（`pnpm build` 通过）
  2. `pnpm lint` 0 warning
  3. `pnpm test` 全过
  4. README 中的「快速试用」步骤仍能跑通
  5. 如果动了 API 客户端 / Skill 模板，**新增/修改要更新 `doc/api-integration.md`**

## PR & commit conventions

**分支**：从 `main` 拉 `<type>/<short-desc>`（如 `feature/asset-grid`、`fix/login-crash`），merge 回 `main`。
不用 `develop` / `release/*` / `hotfix/*` 分支。

**Commit**（conventional commits）：
- type：`feat` / `fix` / `refactor` / `docs` / `chore` / `perf` / `test`
- scope（项目约定）：`agent` / `ui` / `skill` / `jimeng` / `tauri` / `build` / `docs`
- subject：中文，祈使句，≤50 字，不加句号。例：`feat(agent): P6.1 LLM 流式输出`
- **一个 commit 一件事**。Skill 模板新增 = 一个 commit；API 客户端重构 = 一个 commit

**PR 流程**：
1. `git push -u origin feature/xxx`
2. 开 PR → `main`，CI 自动跑 `ci.yml`（lint + test + build + cargo check），必须全绿
3. Squash and merge
4. **不要做的事**：直接 push main / `--force` push main / PR 里塞无关变更 / commit API key 或参考素材

完整版 + CI 失败处理 → `doc/development.md`

## Release workflow

**版本号 SemVer** `vX.Y.Z`，三处必须同步：
- `package.json` 的 `version`
- `src-tauri/tauri.conf.json` 的 `version`
- `src-tauri/Cargo.toml` 的 `[package] version`

**发版步骤**：
```bash
# 1. 三处版本号手动 bump（或 code 编辑器三件套一起改）
# 2. 提交
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore(build): bump version to 0.2.0"
git push origin main
# 3. 打 annotated tag + 推
git tag -a v0.2.0 -m "Release 0.2.0
## 新增
- ...
## 修复
- ..."
git push origin v0.2.0
```

推 tag 后 CI 自动：装工具链 → `tauri build --bundles nsis` → 上传 `Y-agent_0.2.0_x64-setup.exe` 到 GitHub Release（约 8-12 分钟）。

**当前产物**：只出 Windows NSIS（`.exe`，~3 MB）。要加 macOS / Linux / MSI → `doc/release.md` § 5/§ 7

**发版前必查**：
- [ ] CI 全绿
- [ ] 本地 `.\dev-with-msvc.cmd` 跑通冒烟最小集
- [ ] `git status` 干净（没未提交密钥 / 参考素材）
- [ ] SettingsPanel「关于」行版本号正确

完整版（含 release notes 写法、删错发版、auto-updater 启用）→ `doc/release.md`
## Security

- **API Key / 凭据**：Tauri Store 加密落盘（AES-GCM），**不要**写进代码或 `.env`
- `.env` / `.env.local` / `*.local` / `*.key` 已在 `.gitignore`
- 参考素材（`doc/MiniMax Design - 新手指南/`，含 >100MB 单文件）已在 `.gitignore` —— **不要**试图加进版本控制
- Rust 端 SQLite 走 bundled，没明文密码字段，敏感数据走 `tauri-plugin-store`
- 出 Windows 安装包前 `git status` 确认没有未提交密钥
