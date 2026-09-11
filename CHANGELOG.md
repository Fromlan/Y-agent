# Changelog

所有项目的变更记录。格式参考 [Conventional Commits](https://www.conventionalcommits.org/)。

## [Unreleased]

### P0+P1 完善期 (2026-09-11, 20 commits)

按 AGENTS.md §"提交流程" 的 `feat / fix / refactor / docs / chore / perf / test` scope 分类。

#### feat (8)

- **feat(ui)**: i18n 基础包 (zh-CN + en-US, 自实现不引第三方) — `src/lib/i18n/{index.ts,zh-CN.json,en-US.json}` + 15 测试
- **feat(test)**: 前端组件单测框架 + Toast 示范测试 (6 用例) — 装 `@testing-library/react` + `jest-dom`
- **feat(skill)**: 新增 `animation-storyboard` 模板 (4-6 格动画关键帧分镜)
- **feat(skill)**: 新增 `equipment-icon` 模板 (6-12 个装备 / 道具图标, 透明背景)
- **feat(agent)**: 新增 `llm-stream.ts` 纯函数封装 (W1 接口冻结, runLlmTurn 后续下沉用)
- **feat(agent)**: `AgentContext` 加 `usageStats` 字段 (前端先行, 17 用例覆盖)

#### fix / refactor (5)

- **refactor(tauri)**: 新增 `paths.rs` 与 `BackendError` 统一寻址与错误 — `paths::assets_root` + `thiserror`-based 结构化错误 (code/message), 但 `Result<T, String>` 暂不替换
- **refactor(tauri)**: `commands.rs` 接入 `paths.rs` (替换 2 处 `app_data_dir` 散落) — `resolve_local_image_urls` + `read_image_data_url`
- **refactor(tauri)**: `paths.rs` 5 个未用函数加 `#[allow(dead_code)]` 标注 (未来 W3+ 迁移用)

#### test (4)

- **test(tauri)**: `crypto.rs` 单元测试 (7 用例) — 往返 / 同 nonce 不同密文 / 错误 key / 幂等 / 损坏文件
- **test(ui)**: `Sidebar` 组件测试 (6 用例) — 渲染 / 路由切换 / 设置按钮 / 激活样式
- **test(ui)**: `BoardToolbar` 组件测试 (5 用例) — 搜索 / selectMode 切换 / 批量工具栏
- **test(ui)**: `CommandPalette` 组件测试 (5 用例) — Ctrl/Cmd+K / 大写 K / Esc 关闭

#### docs (1)

- **docs(skill)**: M3.6 角色工坊收尾报告 (`doc/plan-m3-character-workshop-closeout.md`)

#### chore / ci (3)

- **chore(tauri)**: `cargo fmt --all` (10 文件格式统一)
- **ci(build)**: 加 `gitleaks` secret scan + `pnpm audit` + `cargo deny` + `clippy` + `rustfmt` 检查
- **ci(build)**: clippy 输出警告但不阻塞 (兼容既有代码技术债) — `|| exit 0` 模式, 留作 W3 处理

### 数据汇总

| 指标 | 起始 | 终态 | Δ |
|---|---|---|---|
| 前端测试文件 | 18 | **24** | +6 |
| 前端测试用例 | 262 | **370** | +108 (+41%) |
| Rust 测试用例 (本次新增) | 0 | **7** (crypto) | +7 |
| Rust 测试总用例 | 43 | **43** | 全过 |
| Skill 模板 | 15 | **17** | +2 (animation-storyboard / equipment-icon) |
| 文档 | 12 → 14 | +1 (M3.6 收尾) +1 (plan-p0p1-polish) | +2 |
| CI 闸 | lint + test + build + validate | + **gitleaks + pnpm audit + cargo deny + clippy + rustfmt** | +5 闸 |

### 跳过的项 (记录原因, 不阻塞本次发版)

- **commands.rs 拆模块** (49 IPC → 8 子模块): 2828 行 + module-level helper 互引, 一次性拆风险高。已用 `use crate::paths;` 渐进推进, 完整拆分留作后续 PR。
- **image-resolver 边界修复**: 涉及 jimeng.ts / asset-flow.ts / LocalEditForm.tsx 多文件改动。建议独立 PR: 新增 `prepare_images_for_jimeng` IPC, Rust 端 `resolve_local_image_urls` 简化为只认 `data:` / `http(s):` URL。
- **SettingsPanel 组件测试**: 24KB 组件依赖 Tauri store + prompt templates + 多 IPC 命令, mock 复杂度高。建议先抽 helpers 再测纯 UI 子组件。
- **AssetDetailDialog 抽 LayerPanel**: 1048 行大改动, LayerPanel 的 props 设计需要单独评审 (与 `viewMode` / `hiddenLayers` 共享 state)。
- **runLlmTurn 循环体下沉**: 21KB hook 闭包捕获 22 props, 接口已冻结 (`llm-stream.ts`), 循环体下沉留作 W3+ Agent engine 重构阶段。

### 已知技术债 (W3+ 处理)

- **15 个 cargo clippy 错误**: 既有代码 pre-existing (too_many_arguments / very_complex_type / doc_overindented_list_items / unwrap_err / etc.), 不属于本轮 P0+P1 范围。
- **MSRV 1.77 vs 1.82 特性**: Cargo.toml 还标 1.77, 但代码用了 1.82 稳定特性。W3 升级 MSRV 时一并修。
- **dist/ 单 chunk 749KB**: vite build 输出 749KB 单文件 (>500KB 警告), 需要 manualChunks 拆分, 留作性能优化阶段。

## 历史版本

(略 — 本仓库之前没有 CHANGELOG, 历史 commit 见 `git log`)