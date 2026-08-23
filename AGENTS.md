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
  - `src/lib/` — API 客户端、Agent 引擎、工具函数（30+ 个纯函数模块）
    - `src/lib/image-resolver.ts` — 本地路径 ↔ `asset://` URL 转换（前端零 IPC 直读本地图片）
    - `src/lib/asset-events.ts` — 后端 `assets://local-backfilled` 事件订阅单例
    - `src/lib/llm.ts` / `src/lib/jimeng.ts` / `src/lib/video.ts` — LLM / 即梦 / 视频三套 API 客户端
    - `src/lib/agent-{event,flow,memory,router,tools}.ts` — Agent 对话引擎
    - `src/lib/{asset-payload,asset-events,assets,image-*,layer-*,style-contract,chat-*}.ts` — 资产 / 图片 / 图层 / 风格契约 / 聊天工具
  - `src/skills/builtin/` — M2 预置的 15 个 Skill 模板（character-consistency-set / character-sheet / character-turnaround / expression-grid / icon-pack-transparent / infographic-poster / kv-poster / layer-separation / local-edit-bbox / product-shot-pack / scene-mood / scene-mood-light-variants / ui-component-breakdown / ui-icons / ui-page）
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

- **有 Vitest 单测**（`src/**/*.test.ts`）。当前 18 个测试文件、262 个用例，覆盖 agent-memory / agent-router / logger / asset-payload / image-resolver / image-alpha-patch / asset-events / h3-context-ir / layer-view / layer-composite / jimeng / video / skill.guardrails / skill.parseAll / style-contract / types / runTool × 2 等纯函数模块。新增纯函数时配套加测试
- **没有 e2e 测试**。每个里程碑靠手动冒烟：见 `doc/plan-jimeng-full-integration.md`
- 冒烟最小集：启动应用 → 选「Demo 模式」→ 跑一次生图 → 切到「资产」tab 看结果
- 新功能必须：
  1. 0 TS error / 0 warning（`pnpm build` 通过）
  2. `pnpm lint` 0 warning
  3. `pnpm test` 全过
  4. README 中的「快速试用」步骤仍能跑通
  5. 如果动了 API 客户端 / Skill 模板 / 资产库存读协议，**新增/修改要更新 `doc/api-integration.md`**
  6. 资产库相关改动需验证 CSP 放行 `asset:` 协议（`tauri.conf.json` 的 `app.security.csp.img-src`）

## 提交流程

单人项目，**直接 `main` 工作**，不建 feature 分支、不开 PR。

```bash
# 1. 改完代码，本地三件套 + skill 校验（CI 必跑项）
pnpm lint
pnpm test
pnpm build
pnpm run validate:skills
pnpm run validate:style-contract

# 2. 一次性 commit（一件事一个 commit；commit message 见下）
git add -A
git commit -m "feat(ui): 加资产批量导出按钮"

# 3. 直接推 main
git push origin main
```

**commit 规范**（conventional commits，commit message 必读）：
- type：`feat` / `fix` / `refactor` / `docs` / `chore` / `perf` / `test`
- scope（项目约定）：`agent` / `ui` / `skill` / `jimeng` / `tauri` / `build` / `docs` / `cleanup` / `ci`
- subject：中文，祈使句，≤50 字，不加句号。例：`feat(agent): P6.1 LLM 流式输出`
- **一个 commit 一件事**。Skill 模板新增 = 一个 commit；API 客户端重构 = 一个 commit

**注意事项**：
- ✅ 接受"绕过 CI"风险（CI 仅作信号源，不是门禁）
- ✅ 文档 / 配置文件改动可以单独一个 commit
- ❌ **不要** `--force` push main
- ❌ **不要** commit API key / 参考素材 / 100MB+ 单文件（已在 `.gitignore`）
- ❌ **不要** 把"fix bug"和"顺手 refactor"塞同一个 commit

完整版 + CI 失败处理 → `doc/development.md`

## Release（按需）

**默认不打 tag / 不发版**。需要发版时看 `doc/release.md` 完整流程（版本号同步、tag 写法、auto-updater 启用等）。

发版简版（发版时再细看）：
- 三处版本号同步 bump：`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`
- 推 tag（`vX.Y.Z`）→ CI 自动 `tauri build --bundles nsis` → 上传 `.exe` 到 GitHub Release
- 发版前必查：CI 全绿 / 冒烟最小集通过 / `git status` 干净 / SettingsPanel 关于行版本号正确
## Security

- **API Key / 凭据**：Tauri Store 加密落盘（AES-GCM），**不要**写进代码或 `.env`
- `.env` / `.env.local` / `*.local` / `*.key` 已在 `.gitignore`
- 参考素材（`doc/MiniMax Design - 新手指南/`，含 >100MB 单文件）已在 `.gitignore` —— **不要**试图加进版本控制
- Rust 端 SQLite 走 bundled，没明文密码字段，敏感数据走 `tauri-plugin-store`
- 出 Windows 安装包前 `git status` 确认没有未提交密钥
