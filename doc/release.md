# 发版流程

> 把一个 milestone 切到 "可发版" → 打 tag → 推 tag → CI 自动出安装包。
> 当前只出 Windows 安装包；扩展到 macOS / Linux 见文末。

---

## 1. 版本号规则

**SemVer 三段式** `vMAJOR.MINOR.PATCH`，三处必须同步：

| 文件 | 字段 |
|---|---|
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `[package] version` |

**判断 bump 哪种**：
- `MAJOR`：不兼容 API 变更（极少，Y-agent 还早）
- `MINOR`：新功能、新 Skill 模板、可见的 UX 升级
- `PATCH`：bug 修复、文档、依赖升级、内部重构

**pre-release**：`v0.1.0-rc.1`、`v0.1.0-beta.2` 形式，按需用。

---

## 2. 发版清单

发版前在 `main` 上确认：

- [ ] 三处版本号已同步为 `X.Y.Z`
- [ ] CI 全绿（`ci.yml` 最近一次跑通）
- [ ] 本地冒烟通过（`dev-with-msvc.cmd` 走一遍最小集）
- [ ] `doc/plan.md` / 文档里 milestone 状态已更新
- [ ] SettingsPanel「关于」行显示的版本号正确（自动从 `tauri.conf.json` 读）
- [ ] `git status` 干净（没未提交密钥，参考素材没被误加）

---

## 3. 发版步骤

```powershell
# 0. 切到 main，确认干净
git switch main
git pull --rebase
git status                    # 必须 clean

# 1. 三处版本号 bump
#    手动改：package.json / tauri.conf.json / Cargo.toml
#    或者一次性：
code package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml

# 2. 提交
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore(build): bump version to 0.2.0"
git push origin main

# 3. 打 tag（annotated tag，附 release notes 占位）
git tag -a v0.2.0 -m "Release 0.2.0"
git push origin v0.2.0
```

**推 tag 后 CI 自动跑**（`release.yml`）：
1. 装 pnpm / Node / Rust 工具链
2. 跑 `pnpm install` + `cargo` 缓存
3. `tauri-action@v0` 跑 `tauri build --bundles nsis`
4. 产物自动上传到 GitHub Release
5. Release 标题 / 描述从 tag 自动推断（`v0.2.0` → `0.2.0`）

---

## 4. Release Notes

**两种写法**：

### A. 推 tag 时附 message（简单）

```powershell
git tag -a v0.2.0 -m "Release 0.2.0

## 新增
- Skill 模板：scene-mood v2、ui-icons 5 件套
- Agent Memory 自动学习风格偏好

## 修复
- 资产网格大图渲染失败 (#12)
- 即梦 24h URL 失效兜底

## 变更
- 升级 lucide-react 到 0.460
"
git push origin v0.2.0
```

CI 会把 tag message 当作 release body。

### B. 在 GitHub 网页上发完再编辑

推 tag 后 release 自动创建但 body 是空的；
去 `https://github.com/Fromlan/Y-agent/releases/tag/v0.2.0` 点 "Generate release notes"
（GitHub 自动按 PR/label 聚合），再手动补一段 human 写的 summary。

**推荐方案 A** —— 写在本地 commit log 里有历史，方便回溯。

---

## 5. 产物

CI 跑完（windows-latest，约 8-12 分钟），release 页面会挂这些文件：

| 文件 | 说明 |
|---|---|
| `Y-agent_0.2.0_x64-setup.exe` | NSIS 安装器（双击装，~3 MB） |
| `latest.json` | Tauri 自动更新用的元数据（auto-updater 用） |

> **MSI 当前不主动出**（`release.yml` 显式 `--bundles nsis`）。要同时出 MSI：
> 1. 改 `release.yml` 的 `args` 为 `--bundles nsis,msi` 或去掉 `args`
> 2. 改 `src-tauri/tauri.conf.json` 的 `bundle.targets` 为 `["nsis", "msi"]`
> 3. 重推 tag

---

## 6. 自动更新（auto-updater）

`tauri.conf.json` 当前没配 `updater` 段，没启用自动更新。

要启用（按需）：
1. 给应用加公钥（`tauri.conf.json` 里的 `updater.pubkey`，配对的私钥放 CI secret）
2. CI 在 `tauri-action` 步骤加 `tagName: ${{ github.ref_name }}` 之类
3. 客户端代码用 `@tauri-apps/plugin-updater` 检查更新

具体看 [Tauri 2 updater 文档](https://v2.tauri.app/plugin/updater/)。单人项目先不发，不阻塞。

---

## 7. 扩展到 macOS / Linux

`release.yml` 已经写好 `matrix.platform` 框架，目前注释掉了。启用方式：

### macOS（出 .dmg / .app）

```yaml
- platform: macos-latest
  args: --target universal-apple-darwin
```

注意：
- 需要 Apple Developer ID 给应用签名 + 公证（`tauri.conf.json` 配 `bundle.macOS.signingIdentity`）
- 私钥放 CI secret（`APPLE_CERT_P12_BASE64` / `APPLE_CERT_PASSWORD` / `APPLE_SIGNING_IDENTITY` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`）
- 没签名的话 .app 会被 Gatekeeper 拦

### Linux（出 .deb / .AppImage）

```yaml
- platform: ubuntu-22.04
  args: ""
```

无签名问题，CI 跑就行。

---

## 8. 删一个错发的 release

发版失误（tag 打错、build 挂了）：

```powershell
# 本地 + 远端都删
git tag -d v0.2.0
git push origin :refs/tags/v0.2.0

# GitHub 上 release 也删（网页操作）
```

然后修问题，重新 bump + tag + push。

---

## 9. 不会触发 release 的情况

- ❌ 普通 commit push 到 `main`（只跑 ci.yml）
- ❌ PR 合并（只跑 ci.yml）
- ❌ 推非 `v*` 格式的 tag（如 `0.2.0` 不带 v）
- ✅ 推 `v*` 格式的 tag（`v0.2.0`、`v0.2.0-rc.1`）


## 10. ⚠️ 推 workflow 文件的 GitHub scope 坑

**症状**（v0.1.0 实测）：
```
! [remote rejected] main -> main (refusing to allow an OAuth App to create or update
workflow `.github/workflows/ci.yml` without `workflow` scope)
error: failed to push some refs to ...
```

**原因**：GitHub 2021+ 的安全机制。任何 **push 修改 `.github/workflows/*.yml`** 的操作，要求 token 必须有 `workflow` scope。

**当前 token 状态**（`gh auth status` 输出）：
- Token scopes: `admin:public_key`, `gist`, `read:org`, `repo` —— **缺 `workflow`**
- `gh` / git credential-manager 用的都是同一个 OAuth token
- SSH 推也撞（需要 SSH key 配到 GitHub 账号上）

**解决**（按推荐度）：

1. **去 GitHub 加 scope**（推荐，1 分钟）：
   - 打开 https://github.com/settings/tokens
   - 找到你 git/gh 用的 PAT，点 Edit
   - 勾上 `workflow` scope，保存
   - 重新 `git push origin main` 即可

2. **`gh auth refresh` 重新走 OAuth**（要浏览器交互）：
   ```powershell
   gh auth refresh --scopes workflow --hostname github.com
   ```
   弹浏览器重新授权，同意后 token 自动更新。

3. **用 web UI 改 workflow**（绕得开但不优雅）：
   - GitHub 网页直接编辑 workflow 文件，提交时勾 "commit directly to main"
   - 适合小改，push 还是会被你撞到

**踩坑经验**：
- IDE（VSCode / Cursor / GitHub Desktop）推仍可能撞同一坑 —— IDE 用 GitHub 认证走的是同一 OAuth
- 拆 commit 不解决：单独 commit 改 workflow 也撞
- tag push 本身**不**会撞（不修改文件）—— release.yml 跑时 checkout 包含 workflow 的 commit 也无问题
- 所以发版两步是独立的：
  - 1) 推 main（要先解决 scope）
  - 2) 推 tag（不撞 scope，可后做）

**不要做的事**：
- ❌ 每次撞错就生成新 PAT（PAT 一多管理乱）
- ❌ 把 workflow 移到别的目录绕过（GitHub 认 `.github/` 子目录的所有 yml）
