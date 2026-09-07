# 多平台出包(Mac / Linux)启用决策

> 状态:决策文档(未实施)
> 写于:2026-09-07
> 适用阶段:M7 末期 / v0.4.0
> 关联:`doc/release.md` § 7 / `doc/plan-m7-polish-release.md` M7.2-M7.3

---

## 1. 现状

`.github/workflows/release.yml` 当前只跑 Windows:

```yaml
matrix:
  include:
    - platform: windows-latest
      args: ""
    # 未来如需 macOS / Linux,加以下两行 + 在仓库 Settings → Actions → Runners 配 macOS self-hosted runner
    # - platform: macos-latest
    #   args: --target universal-apple-darwin
    # - platform: ubuntu-22.04
    #   args: ""
```

GitHub-hosted 资源成本:
- `windows-latest`:10 min × 4 core = 40 core-min
- `macos-latest`:12 min × 3 core(免费 public 仓库,private 仓库按 10x 计费)
- `ubuntu-22.04`:8 min × 2 core = 16 core-min

每月 2000 free 分钟(public 仓库)/ 500 分钟(private 仓库),开启 macOS 后基本吃掉 60-80%。

---

## 2. 启用条件

### 2.1 macOS(启用需以下全部满足)

- [ ] **用户已注册 Apple Developer ID**(个人 $99/年,组织 $99/年,需 D-U-N-S 编号)
- [ ] 已在 `Settings → Secrets and variables → Actions` 配齐:
  - `APPLE_CERT_P12_BASE64` —— `.p12` 证书 base64
  - `APPLE_CERT_PASSWORD` —— 证书密码
  - `APPLE_SIGNING_IDENTITY` —— `"Apple Development: Your Name (TEAM_ID)"`
  - `APPLE_ID` —— Apple ID 邮箱
  - `APPLE_PASSWORD` —— App 专用密码(https://appleid.apple.com → App-Specific Passwords)
  - `APPLE_TEAM_ID` —— 10 位字母数字
- [ ] `tauri.conf.json` 加:
  ```json
  "bundle": {
    "macOS": {
      "signingIdentity": "<APPLE_SIGNING_IDENTITY>",
      "entitlements": "entitlements.plist",
      "exceptionDomain": "github.com"
    }
  }
  ```
- [ ] 准备 `entitlements.plist`(沙盒 / 网络 / 文件访问)
- [ ] 测试:`xcrun notarytool submit dist/Y-agent_*.dmg --keychain-profile "AC_PASSWORD" --wait`
- [ ] 第一次跑 CI 失败概率高(签名 / 公证 / 权限),预留 2-3 次调试

### 2.2 Linux(无门槛)

- [ ] 解开 `release.yml` matrix 注释
- [ ] `tauri.conf.json` `bundle.targets` 加 `"deb"`,`"appimage"`
- [ ] 第一次跑就过(GitHub ubuntu-22.04 预装 `dpkg` / `appimagetool` 走 cargo-bundle)
- [ ] `.deb` 在 Ubuntu 20.04+ / Debian 11+ 可装
- [ ] `.AppImage` 在所有 Linux 桌面可跑(可能需要用户 chmod +x)

---

## 3. 决策矩阵

| 维度 | 启用 macOS | 不启用 | 启用 Linux | 不启用 |
|---|---|---|---|---|
| 用户基数扩展 | +5-10%(Mac 开发者) | 0 | +2-3%(Linux 桌面少) | 0 |
| CI 成本 | +$30-50/月(私有) | 0 | +$0(免费) | 0 |
| 维护成本 | 高(签名 / 公证 / Apple ID 续费) | 0 | 低(无签名,但 appimagetool 偶尔出 bug) | 0 |
| 风险 | Apple 政策变化 / 证书过期 | 0 | 0 | 用户用 Wine / VirtualBox 跑 Windows 版 |
| 收益时间 | 上架 Mac App Store 后显著 | 0 | GitHub release 即可被 apt 源引用 | 0 |

---

## 4. 推荐时机

### Linux(建议 v0.3.0 顺手开)
- 零成本(无签名)
- GitHub 用户里 Linux 占比虽然低但活跃
- 步骤:解注释 + 配 tauri.conf.json + 1 个 commit + 1 次 CI 验证
- **估计工时**:1-2 天(含 CI 调试)

### macOS(建议 v0.4.0 / M7.2 末,等 M3-M6 至少 M3+M5 完成)
- 上架 Mac App Store 至少需要:
  - M3.6 Onboarding(新用户体验)
  - M5.1-M5.3 图层编辑基本功能稳定
  - 否则上架后差评率高
- Apple Developer ID 申请周期 1-2 周
- **估计工时**:1 周(含注册 + 签名 + 公证 + 上架)

---

## 5. 暂不启用(明确决策)

### iOS / Android 出包
- Tauri 2 已支持,但 Y-agent 核心场景(生图 / 视频)需要桌面算力 + 长会话
- 移动端 UI 完全不同,需要重新设计
- 建议 M8+ 评估,不在 M7 范围

### Windows ARM(高通 / 苹果 M 系列 Mac 原生运行 Windows)
- Tauri 2 已支持,但 GitHub-hosted 没有 windows-arm runner
- 需要自建 runner 或 macOS 旁加载
- 优先级低,等用户量到 1k+ 再考虑

### Snap / Flatpak(Linux)
- 跟 `.deb` / `.AppImage` 重复,且社区需要单独审核
- 评估时机:Linux 出包后 6 个月,看用户反馈

---

## 6. 启用步骤(决策后执行)

### 6.1 Linux(快速)

```powershell
# 1. 改 .github/workflows/release.yml
# 解开 ubuntu-22.04 那两行注释

# 2. 改 src-tauri/tauri.conf.json
# "bundle.targets": ["nsis", "msi", "deb", "appimage"]

# 3. commit
git add .github/workflows/release.yml src-tauri/tauri.conf.json
git commit -m "feat(release): CI 启用 Linux 出包(.deb + .AppImage)"

# 4. 推 tag 触发(参考 doc/release.md § 3)
git tag -a v0.3.0 -F release-notes.md
git push origin v0.3.0

# 5. 验证
gh release view v0.3.0 --json assets | jq '.assets[] | select(.name | endswith(".deb") or endswith(".AppImage"))'
```

### 6.2 macOS(慢,需用户先注册 Apple Developer ID)

参考 Tauri 官方文档:https://v2.tauri.app/distribute/sign/macos/

简化版流程:
1. 用户注册 Apple Developer ID(https://developer.apple.com/programs/enroll/)—— 1-2 周
2. 生成 Developer ID Application 证书(从 Xcode → Accounts → Manage Certificates)
3. 导出 .p12,base64 编码 → CI secret
4. 加 `entitlements.plist` + `tauri.conf.json` macOS 段
5. 启用 CI macOS matrix
6. 跑 release,手动 `xcrun notarytool` 公证(第一次需手工)
7. 自动化公证在 `release.yml` 加 `tauri-action` 的 `appleId` / `applePassword` 参数

---

## 7. 决策点(给用户)

> "M7 阶段先开 Linux,延后 macOS 到 v0.4.0" 是推荐方案。如果想提前,Apple Developer ID 申请需用户现在就启动。

| 选项 | 描述 | 适合场景 |
|---|---|---|
| **A. v0.3.0 开 Linux,v0.4.0 开 macOS**(推荐) | Linux 零成本先行,macOS 等产品更稳定 | 想保持小步快跑 |
| **B. v0.3.0 同时开 Linux + macOS** | 一次到位,需用户立即申请 Apple ID | 想一次性铺开多平台 |
| **C. M7 不开多平台,只做 auto-updater** | 专注打磨,延后出包决策 | 想先验证产品再投入 |
| **D. 永远只 Windows** | 单平台,最低维护 | 独立游戏开发者小众需求 |

---

## 8. 关联文档

- `doc/release.md` § 7(已有 macOS / Linux 扩展段,本文档是其详细化)
- `doc/plan-m7-polish-release.md` M7.2 / M7.3
- Tauri 官方文档:https://v2.tauri.app/distribute/
- Apple Developer ID:https://developer.apple.com/programs/enroll/
- Tauri 签名:https://v2.tauri.app/distribute/sign/
