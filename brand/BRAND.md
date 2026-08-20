# Y-agent 品牌设计规范

> 游戏美术 AI 工作台 · Make. Iterate. Ship.

本文档定义 Y-agent 的视觉品牌系统。所有 UI、文案、对外物料请遵循此规范。

---

## 1. 品牌定位

| 维度 | 内容 |
|---|---|
| **品类** | 游戏美术 AI 创作工具（独立游戏开发者向） |
| **受众** | 独立游戏开发者，单兵或 2-3 人小团队，无专职美术 |
| **人格** | 精炼、敢想、能落地；不是企业级协作工具 |
| **核心隐喻** | **Y 字 = 创作分叉路口**。从一个想法分出多条美术方向；Y 字分叉点的 spark 节点 = AI 触发点 / 创作种子 |
| **差异化** | 不用通用 AI 蓝紫，用暖色「创作之火」Coral #FF5C4D 区别于同行 |
| **承诺** | 开箱即用的预置 Skill、demo 模式不烧钱、单人能跑通 |

---

## 2. Logo 系统

### 2.1 标识结构

```
   \   /        ← 双臂 (两条对角线)
    \ /
     ●          ← AI spark 节点 (实心圆点)
     |
     |          ← 主干 (竖直笔触)
     |
```

- **主干**：一条竖直线段，从底部到分叉点
- **双臂**：两条对角线，从分叉点向左右上方 45° 延伸，等长
- **AI spark 节点**：实心圆点，恰好位于分叉点
- **几何关系**：双臂 = 主干等长；圆点直径 ≈ 笔画粗度的 1.5×

### 2.2 配色规则

| 主题 | 背景 | Y 字 | Spark 节点 | 用途 |
|---|---|---|---|---|
| **Dark（默认）** | `#0E0F13` | `#FF5C4D` Coral | `#FF5C4D` | 桌面应用主色、官网、GitHub README |
| **Light** | `#F2EBDB` Cream | `#0E0F13` Charcoal | `#0E0F13` | 浅色主题、打印、印刷品 |
| **Inverted** | `#FF5C4D` Coral | `#F2EBDB` Cream | `#F2EBDB` | 海报、贴纸、特殊场景 |

### 2.3 最小尺寸

- **图标（仅 Y mark）**：≥ 24×24 px
- **Wordmark（Y + 文字）**：≥ 96 px 宽
- **带 tagline**：≥ 240 px 宽

### 2.4 安全区

Y mark 周围保留 **等同于笔画粗度** 的空白区。Wordmark 两侧留 0.5× 字高的间距。

### 2.5 禁止

- ❌ 不要给 Y 加上渐变、阴影、3D 效果
- ❌ 不要改变 Y 字比例（双臂必须等长，主干必须竖直）
- ❌ 不要单独使用 spark 节点（它是 Y 的一部分）
- ❌ 不要使用非品牌色的描边或填充

---

## 3. 颜色系统

### 3.1 核心色板

```css
/* 基础层 */
--charcoal:     #0E0F13;  /* 主背景 */
--surface:      #16181E;  /* 面板背景 */
--elevated:     #1E2128;  /* 悬浮层 */
--border:       #262A33;  /* 分割线 */

/* 强调色 */
--coral:        #FF5C4D;  /* 主强调 / 主按钮 / 链接 */
--coral-hover:  #FF7568;  /* 悬浮态 */
--coral-dim:    #4A1E1A;  /* 强调色暗背景 */

/* 文字 */
--cream:        #F2EBDB;  /* 主文字 */
--muted:        #8A8F99;  /* 次要文字 */
--inverse:      #0E0F13;  /* 反色文字（用于浅底） */

/* 状态色 */
--teal:         #5BC2A8;  /* 成功 / ready */
--amber:        #F5A85B;  /* 警告 */
--rose:         #E94B6A;  /* 错误 / danger */
```

### 3.2 使用比例

- 70% — 暗色背景层（charcoal / surface）
- 20% — 中性文字（cream / muted）
- 7% — 主强调（coral）
- 3% — 状态色（teal / amber / rose）

**强调色不应超过界面面积的 10%**，保持稀缺感。

### 3.3 与现有 `tailwind.config.js` 的对应

`src/styles/tokens.css` 的 CSS 变量应改为：

```css
:root[data-theme="dark"] {
  --bg-base:        #0E0F13;
  --bg-panel:       #16181E;
  --bg-elev:        #1E2128;
  --bg-hover:       #262A33;
  --bg-overlay:     rgba(14, 15, 19, 0.85);
  --border:         #262A33;
  --border-strong:  #3A3F4A;
  --text-primary:   #F2EBDB;
  --text-secondary: #B5BAC2;
  --text-muted:     #8A8F99;
  --text-inverse:   #0E0F13;
  --accent:         #FF5C4D;
  --accent-hover:   #FF7568;
  --accent-dim:     #4A1E1A;
  --status-success: #5BC2A8;
  --status-warn:    #F5A85B;
  --status-danger:  #E94B6A;
}

:root[data-theme="light"] {
  --bg-base:        #F2EBDB;
  --bg-panel:       #FFFFFF;
  --bg-elev:        #FAF7F0;
  --bg-hover:       #F0EBDC;
  --bg-overlay:     rgba(242, 235, 219, 0.85);
  --border:         #E0DACA;
  --border-strong:  #C5BDA8;
  --text-primary:   #0E0F13;
  --text-secondary: #3A3F4A;
  --text-muted:     #8A8F99;
  --text-inverse:   #F2EBDB;
  --accent:         #FF5C4D;
  --accent-hover:   #E54738;
  --accent-dim:     #FFE2DD;
  --status-success: #2D8A6E;
  --status-warn:    #C77F2F;
  --status-danger:  #C73A55;
}
```

---

## 4. 字体

### 4.1 字体选择

- **UI 正文**：系统无衬线栈（已配置在 `tailwind.config.js`）
  ```
  -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
  "Microsoft YaHei", sans-serif
  ```
- **Wordmark / 品牌字**（如需导出品牌物料）：**Inter**（开源、Google Fonts 可下）
- **等宽**（代码、token、文件名）：**JetBrains Mono** 或系统等宽

### 4.2 字号比例

| 用途 | 大小 | 字重 | 行高 |
|---|---|---|---|
| Display（H1） | 32px / 2rem | 700 | 1.2 |
| Title（H2） | 24px / 1.5rem | 600 | 1.3 |
| Heading（H3） | 18px / 1.125rem | 600 | 1.4 |
| Body | 14px / 0.875rem | 400 | 1.5 |
| Caption | 12px / 0.75rem | 400 | 1.4 |
| Mono | 13px / 0.8125rem | 400 | 1.5 |

> Tailwind 默认 `text-sm` = 14px，可直接用。

---

## 5. 语气与文案

### 5.1 Tagline

**主 tagline**：`Make. Iterate. Ship.`
- 三个动词对应 Y-agent 核心工作流：生图 → 对话迭代 → 资产入库
- 节奏感强、面向单兵开发者
- 中文翻译建议：「生图 · 迭代 · 出活」或「造、磨、交付」

**副 tagline**（场景化用）：`Your art co-pilot.` / `From prompt to asset.`

### 5.2 文案原则

- **用"你"不用"您"**——独立开发者的伙伴语气，不是企业 SaaS
- **直说功能，不要绕**——"生成 4 张" 比 "启动并行生成流水线" 好
- **避免行话**——少用 "赋能 / 闭环 / 抓手" 这种词
- **错误信息要给路**——不要说 "失败"，要说 "网络断了，重试？" + 一个按钮
- **中英混排时英文两边加空格**——"生图 Make. Iterate. Ship."

### 5.3 按钮文案

| ❌ 不要 | ✅ 推荐 |
|---|---|
| 提交 | 生成 |
| 取消 | 放弃 |
| 确认 | 继续 / 开始 |
| 保存设置 | 保存 |
| 删除 | 删掉（避免误触时可写"永久删除"） |

---

## 6. UI 应用规范

### 6.1 按钮

- **主按钮（Primary）**：coral 实心 + cream 文字 + 0 圆角或 6px 圆角
- **次按钮（Secondary）**：透明 + coral 描边 + coral 文字
- **文字按钮**：coral 文字 + 无背景
- **危险按钮（Danger）**：rose 实心 + cream 文字（不要用 coral 表示删除）

### 6.2 状态标识

| 状态 | 颜色 | 图标建议 | 文字 |
|---|---|---|---|
| Ready / 成功 | `#5BC2A8` Teal | 圆点 / Check | "已就绪" / "完成" |
| 警告 | `#F5A85B` Amber | 三角感叹号 | "请注意" |
| 错误 / 失败 | `#E94B6A` Rose | X / 叉号 | "出错了" |
| 处理中 | `#FF5C4D` Coral + 旋转 | Loader | "生成中…" |

### 6.3 卡片 / 面板

- 背景 `--bg-panel`（#16181E）
- 1px 边框 `--border`（#262A33）
- 圆角 8px（资产卡片用 12px 视觉更柔和）
- 悬浮：背景 → `--bg-elev`、边框 → `--border-strong`、过渡 150ms

### 6.4 输入框

- 背景 `--bg-base`
- 聚焦时边框 → `--coral`，外加 2px `--coral-dim` 光晕
- 占位文字 `--text-muted`

### 6.5 Skill 徽章

预置 Skill 用 chip 展示：
- 背景：透明 + 1px coral 描边
- 文字：coral
- 圆角：999px（pill 形）
- 内边距：4px 12px

例子：
```
[ character-sheet ]  [ character-turnaround ]  [ expression-grid ]
[ kv-poster ]        [ scene-mood ]            [ ui-icons ]
```

---

## 7. 资产命名 / 文件组织

```
brand/
├── BRAND.md                  ← 本文件
├── y-agent-brandkit_001.jpg  ← 主品牌 kit 板（3x3 全景）
├── y-agent-logo_001.jpg      ← 暗底 Y mark（仅 Y）
├── y-agent-appicon_001.jpg   ← 应用图标（含圆角 + 阴影）
├── y-agent-wordmark_001.jpg  ← 横版 wordmark（Y + 文字）
├── y-agent-light_001.jpg     ← 浅色版（打印 / 浅色主题）
└── gen-*.log                 ← 生成日志（可删）
```

**后续如果要落地到 Tauri**：
- 应用图标导出 PNG 多尺寸（1024/512/256/128/64/32/16）替换 `src-tauri/icons/`
- 使用 `tauri icon` 命令从源 PNG 一次性生成全套尺寸
- 推荐用 `y-agent-appicon_001.jpg` 作为源，但需要先转 PNG（去 JPG 压缩）

---

## 8. 出活清单（实施建议）

最小可落地集（M0.5 阶段）：

- [ ] 导出 `appicon` 源为 PNG，覆盖 `src-tauri/icons/icon.png`（1024×1024）
- [ ] `pnpm tauri icon ./brand/y-agent-appicon.png` 重新生成全套 Tauri 图标
- [ ] 更新 `src/styles/tokens.css` 的 CSS 变量到本规范定义的色值
- [ ] 应用主按钮改用 coral `#FF5C4D`
- [ ] 状态点 ready 用 teal `#5BC2A8`
- [ ] README 顶部加 wordmark 横版
- [ ] 「关于」面板加 tagline "Make. Iterate. Ship."
- [ ] Skill chip 用 coral 描边样式

---

## 9. 设计原则（写作时参考）

1. **少即是多**——一个界面只突出一个动作
2. **稀缺的强调**——coral 是"现在该你按"信号，不要滥用
3. **安静的工具感**——专业感来自克制的留白和对齐，不是装饰
4. **美术工作者的尊严**——不卖弄 AI 黑话，让创作者感觉是工具在配合他，不是反过来
5. **单兵友好**——任何功能都要想"一个人用起来累不累"
