# M7 · 打磨发布(Polish & Release)

> 阶段:M7
> 状态:规划中(未实施)
> 写于:2026-09-07
> 依赖:M2 v0.2.0 + M3-M6 全部完成(或部分完成,M7 主要打磨,不强求前置)

---

## 1. 目标

把 Y-agent 从"功能完整"打磨到"可发布 / 可推广"状态:

- **auto-updater**:用户启动应用时自动检查新版本
- **多平台出包**:macOS .dmg / Linux .deb / .AppImage
- **应用商店素材**:截图 / 视频 / 描述,准备上架 Microsoft Store / Mac App Store
- **落地页**:y-agent.com 或 GitHub Pages 风格的产品页
- **首次启动引导**:Onboarding tour,演示 4 个核心功能
- **错误上报**(可选):埋点 + 远程错误收集(匿名)
- **国际化**(可选):中英双语 UI

**用户故事**:
- 开发者装 v0.3.0 后,启动 v0.3.1 自动下载安装
- Mac 用户直接下 .dmg 双击装
- 新用户启动看到 3 步引导(选模式 / 填 Key / 跑 Demo)

---

## 2. 现状与缺口

### 2.1 已有(可直接复用)

| 资产 | 路径 | 用途 |
|---|---|---|
| `.github/workflows/release.yml` | 已配 windows NSIS+MSI matrix | 出包 CI |
| `tauri.conf.json` | `bundle.targets = ["nsis", "msi"]` | Windows 配置 |
| `app-info.ts` | `src/lib/app-info.ts` | 版本号读取 |
| `SettingsPanel` | `src/components/settings/SettingsPanel.tsx` | 关于行版本号 |
| `brand/` | 完整品牌资产 | 落地页素材源 |
| `brand/BRAND.md` | 颜色 / 字体 / 语气规范 | 落地页遵循 |
| `tauri-plugin-store` | 已用 | 用户偏好持久化 |
| `tauri-plugin-shell` | 已用 | 打开外部链接 |

### 2.2 缺口

1. **没有 auto-updater**——`tauri.conf.json` 没配 `updater` 段
2. **没有 macOS / Linux 出包**——`release.yml` matrix 注释掉了
3. **没有应用商店素材**——只有 `brand/` 散图,没准备 store 要求的 6-8 张截图 + 视频
4. **没有落地页**——`README.md` 不算"产品页",没有 marketing-grade 设计
5. **没有 Onboarding**——新用户启动直接看空 Workspace,不知道干嘛
6. **没有错误上报**——用户报错只能截屏反馈
7. **没有 i18n**——所有 UI 中文(M2 决定单语,M7 评估是否开英)

---

## 3. 设计

### 3.1 auto-updater(M7.1)

启用 `@tauri-apps/plugin-updater`:
- `tauri.conf.json` 加:
  ```json
  "updater": {
    "active": true,
    "dialog": true,
    "endpoints": [
      "https://github.com/Fromlan/Y-agent/releases/latest/download/latest.json"
    ],
    "pubkey": "<generated-public-key>"
  }
  ```
- 私钥(给 release 签名)放 CI secret:`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- 客户端:`App.tsx` 启动后 1 秒调 `check()`,有新版本弹 dialog

### 3.2 多平台出包(M7.2-M7.3)

**macOS**:
- `release.yml` 启用 `macos-latest` matrix
- `tauri.conf.json` 加 `bundle.macOS.signingIdentity` / `entitlements`
- 需要 CI secret:`APPLE_CERT_P12_BASE64` / `APPLE_CERT_PASSWORD` / `APPLE_SIGNING_IDENTITY` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`
- 私钥走 `xcodes` 签名(不签名会被 Gatekeeper 拦)
- 出 `.dmg`(用 `create-dmg` 工具)

**Linux**:
- `release.yml` 启用 `ubuntu-22.04` matrix
- 无签名(`.deb` / `.AppImage` 不需要)
- 出 `.deb` + `.AppImage`

**影响 CI 时间**:
- 当前 windows:~10 min
- 加 macOS:~12 min
- 加 Linux:~8 min
- 总:matrix 3 个并发 ~12 min,不变

### 3.3 应用商店素材(M7.4)

**Microsoft Store**(优先,Windows 用户量大):
- 6-8 张 1920×1080 截图(Workspace 截图 + 各 Skill 演示)
- 1 个 30s 演示视频(录屏)
- store 描述(中文,2000 字内)
- 应用图标(已 `src-tauri/icons/`)
- 隐私政策 URL(y-agent.com/privacy)

**Mac App Store**(可选,需 Apple Developer ID $99/年):
- 同上 + sandbox 适配

### 3.4 落地页(M7.5)

**域名**:`y-agent.com`(待定,可 GitHub Pages 兜底)

**框架**:
- Vite + React(复用 M2 的 React 应用)
- 或 Astro(更适合静态页,SEO 好)
- 推荐 **Astro**:更轻,首屏 < 1s

**页面结构**:
- 顶栏:Logo + 下载按钮(链 GitHub Releases)
- Hero:大字标语 + 1 张演示 GIF + 下载按钮
- Features:6 个核心特性(图标 + 1 段说明 + 1 张 GIF)
- Demo:嵌入 Tauri app 录屏(YouTube 嵌入)
- Skill 模板展示:15 个 skill 网格
- Roadmap:M0-M7 时间线
- 社区:GitHub star 数 / Discord(可选) / Twitter(可选)
- Footer:MIT License + 隐私 + 联系

**部署**:`github-pages` action 自动 build + 推 `gh-pages` 分支

### 3.5 Onboarding tour(M7.6)

**实现**:
- 首次启动检测(`tauri-plugin-store` 读 `onboarded: boolean`)
- 3 步引导:
  1. 选模式(Demo / 填 Key)
  2. 跑一次生图(自动填好示例 prompt)
  3. 看资产入库
- 每步带"跳过"按钮
- 完成后写 `onboarded = true`,不再显示
- 走 `react-joyride` 或自己写(M7 决定)

### 3.6 错误上报(M7.7,可选)

**实现**:
- Rust 端 panic hook → 收集错误堆栈 + Y-agent 版本 + OS
- 前端 window.onerror → 同上
- HTTP POST 到自建 endpoint(无第三方,避免隐私问题)
- 隐私:不上传 prompt / 资产 / Key,只传"哪一行代码崩了"
- 用户可设置关闭("设置 → 隐私 → 关闭错误上报")

### 3.7 国际化(M7.8,可选)

**实现**:
- `src/i18n/{zh-CN,en-US}.ts`(单文件 key-value 即可)
- `useT(key)` hook 取代硬编码字符串
- 语言切换在 SettingsPanel
- 文档同步双语(`README.md` / `doc/`)

---

## 4. 阶段分解(可独立发布)

### M7.1 · auto-updater(3 天)

- `tauri.conf.json` 配 updater
- 公私钥生成
- CI 配 signing
- 客户端 `App.tsx` 加 `check()` 调用
- 验收:装 v0.3.0 + 推 v0.3.1 → 启动后弹"有新版本"对话框
- Commit 数:2-3 个

### M7.2 · macOS 出包(5 天,Apple 签名最麻烦)

- 注册 Apple Developer ID(一次性,用户决策)
- 生成 cert + provisioning profile
- CI 加 macOS matrix
- `tauri.conf.json` 配 entitlements
- 出 `.dmg`
- 验收:`gh release view v0.3.1` 看到 `.dmg`,Mac 用户能装
- Commit 数:3-4 个

### M7.3 · Linux 出包(2 天,无签名)

- CI 加 ubuntu-22.04 matrix
- `tauri.conf.json` 配 deb / AppImage targets
- 出 `.deb` + `.AppImage`
- 验收:同上
- Commit 数:2 个

### M7.4 · 应用商店素材(4 天)

- 6-8 张 1920×1080 截图(用 Tauri dev 模式手动截)
- 1 个 30s 演示视频(录屏 + 剪辑)
- store 描述文案
- 隐私政策页(`y-agent.com/privacy`)
- Microsoft Store 提交(等审核 1-3 天)
- 验收:Store 链接可访问
- Commit 数:2-3 个(素材不进 git,走 CDN)

### M7.5 · 落地页(5 天)

- Astro 项目
- 6 个 features 段
- 演示 GIF
- Roadmap 时间线
- GitHub Pages 自动部署
- 验收:`y-agent.com` 首屏 LCP < 2s,Lighthouse 90+
- Commit 数:3-4 个

### M7.6 · Onboarding tour(3 天)

- `react-joyride` 集成
- 3 步引导
- `onboarded` 持久化
- 验收:删 store 数据 → 重启 → 看到引导 → 走完 → 重启不再显示
- Commit 数:2 个

### M7.7 · 错误上报(3 天,可选)

- 自建 endpoint(简单 Rust + SQLite 后端,或 Cloudflare Workers)
- 客户端 panic / window.onerror hook
- 隐私设置
- 验收:故意触发一个 panic → 后台看到错误记录
- Commit 数:2-3 个

### M7.8 · i18n(5 天,可选)

- 抽 `useT` hook
- 翻译 200+ 字符串
- 语言切换
- 文档双语
- 验收:切到英文,UI 全英文
- Commit 数:3 个

---

## 5. 验收标准

- 8 个用户故事(M7.1-M7.8)跑通
- `pnpm test` / `pnpm build` / `cargo check` 0 错误
- 落地页 Lighthouse Performance ≥ 90
- Onboarding tour 可跳过 + 持久化
- 错误上报不带 prompt / 资产 / Key
- 双语切换不影响布局

---

## 6. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| Apple Developer ID 申请被拒 | macOS 出包延后 | M7.2 推迟,先 Windows + Linux;Apple 申请是用户决策 |
| macOS 公证失败 | .dmg 仍被 Gatekeeper 拦 | 用 `xcrun notarytool` 走 Apple 公证流程,详细见 Tauri 文档 |
| auto-updater 签名私钥泄露 | 安全问题 | 私钥放 CI secret,永不进 git;启用 2FA |
| 落地页 SEO 不达标 | 搜索找不到 | 加 sitemap.xml + robots.txt + Open Graph |
| Onboarding tour 用户嫌烦 | 评分低 | 1 步"跳过"即可,完成后再不显示 |
| 错误上报被当作遥测 | 用户关闭 | 明确"不上传 prompt / 资产 / Key" + 设置可关 |
| i18n 翻译质量 | 中英不一致 | 走 `i18next` + 社区翻译,先中文再英文 |

---

## 7. 涉及文件

### 新建(项目内)
- `src/lib/updater.ts`(M7.1)
- `src/lib/onboarding.ts`(M7.6)
- `src/lib/error-reporter.ts`(M7.7)
- `src/lib/i18n/{zh-CN,en-US}.ts` + `useT.ts`(M7.8)
- `landing/`(M7.5,Astro 项目,可独立仓库)
- `docs/privacy.md`(M7.4)

### 修改
- `tauri.conf.json`(M7.1 / M7.2 / M7.3)
- `package.json`(加 `react-joyride` / `astro` 等 devDep)
- `.github/workflows/release.yml`(启用 macOS / Linux matrix)
- `src/App.tsx`(M7.1 检查更新 + M7.6 引导)
- `src/components/settings/SettingsPanel.tsx`(M7.7 错误上报开关 + M7.8 语言)
- `src/components/workspace/Workspace.tsx`(M7.6 引导)
- `README.md`(链接到落地页)
- `AGENTS.md`(加 M7 段)
- `doc/development.md`(M7 段)
- `doc/release.md`(扩 macOS / Linux 段,当前已有部分)

### CI secrets(需用户操作)
- `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `APPLE_CERT_P12_BASE64` / `APPLE_CERT_PASSWORD` / `APPLE_SIGNING_IDENTITY` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`

### 外部资产(M7.4 走 CDN 不进 git)
- 截图 6-8 张
- 演示视频 1 个
- 应用图标(已 `src-tauri/icons/`)

---

## 8. 估时

- M7.1:3 天
- M7.2:5 天
- M7.3:2 天
- M7.4:4 天
- M7.5:5 天
- M7.6:3 天
- M7.7:3 天(可选)
- M7.8:5 天(可选)
- **合计**:~4 周(M7.7 / M7.8 可延后;M7.2 强依赖 Apple Developer ID)

---

## 9. 与 M2-M6 的依赖

- M2 完成 → M7.1 / M7.3 / M7.6 / M7.8 可独立开始
- M3-M6 完成 → M7.4 应用商店素材更丰富
- M7.2 强依赖用户决策(Apple Developer ID 申请)

---

## 10. 暂不做的

- iOS / Android 出包(Tauri 2 已支持,但 M7 不做,等 M8+)
- 浏览器插件(超出范围)
- 云端 SaaS 化(超出范围,坚持本地)
- 付费订阅(超出范围,坚持 MIT + 用户自填 Key)
- 团队协作(超出范围,坚持单兵)
