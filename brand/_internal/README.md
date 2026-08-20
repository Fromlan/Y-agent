# brand/_internal/

存放重新生成 `../` 根目录下品牌资产所需的提示词和脚本。

> 普通人不需要碰这里。这些是给设计方向调整时复用的工程文件。

## 目录结构

```
_internal/
├── prompts/         # 喂给 mmx image generate 的 prompt 文本
│   ├── prompt-brandkit.txt   # 3×3 品牌全景板
│   ├── prompt-logo.txt       # 主 Y mark（暗底）
│   ├── prompt-appicon.txt    # 应用图标
│   ├── prompt-wordmark.txt   # 横版 wordmark
│   └── prompt-light.txt      # 浅色版
└── scripts/         # 调 mmx 的 PowerShell 包装
    ├── run-brandkit.ps1      # 生成全景板
    ├── run-logo.ps1          # 生成主 logo
    └── run-variants.ps1      # 批量生成 appicon/wordmark/light
```

## 怎么重跑

```bash
# 1. 确保 mmx CLI 已认证
mmx auth status

# 2. 在项目根目录跑某个脚本
powershell -ExecutionPolicy Bypass -File brand/_internal/scripts/run-brandkit.ps1
```

输出会回到 `brand/` 根目录，文件名带 `_001.jpg` 后缀（mmx 默认）。

## 设计方向想调整时

1. 改 `prompts/prompt-*.txt` 里的描述（色值、构图、文案）
2. 重跑对应 `scripts/run-*.ps1`
3. 用新生成的图替换 `brand/y-agent-*.jpg|png`
4. 重跑 `pnpm tauri icon brand/y-agent-appicon.png` 重新生成应用图标
5. 提交新资产 + 更新 `BRAND.md` 规范

## 不在 git 里的相关文件

- 跑脚本时会在 `brand/` 根目录生成 `gen-*.log`（被 .gitignore 忽略）
- 新生成的 `*_001.jpg` 同理，commit 前手动选一张正式的命名保留
