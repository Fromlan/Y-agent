#!/usr/bin/env python3
"""Append Part 7 (MiniMax H3 视频 API) to doc/api-integration.md, and update
README.md to mention the new 生视频 mode in the quick-start.
"""
from pathlib import Path

DOC = Path("E:/Pi/Y-agent/doc/api-integration.md")
README = Path("E:/Pi/Y-agent/README.md")


def append_doc_part7() -> None:
    if "Part 7. MiniMax H3 视频 API" in DOC.read_text(encoding="utf-8"):
        print("Part 7 already in api-integration.md, skipping")
        return

    block = r'''

## Part 7. MiniMax H3 视频 API（P8 新增）

> 数据源：`src/lib/video.ts`（前端） + `src-tauri/src/video.rs`（Rust 端）。
> 后端 `src-tauri/src/commands.rs::poll_video_task` 异步轮询，事件名 `jimeng_video://{progress|succeeded|failed|cancelled}`。

### 7.1 接入基础

- **Endpoint**：
  - POST `https://api.minimaxi.com/v2/video_generation` 异步提交
  - GET `https://api.minimaxi.com/v2/query/video_generation/{task_id}` 轮询
- **认证**：`Authorization: Bearer <VIDEO_API_KEY>`（独立 Key，与生图 Key 分开存）
- **控制台**：[MiniMax 开放平台](https://platform.minimaxi.com/user-center/basic-information/interface-key) 开 Key
- **Demo 模式**：Key 以 `demo-` 开头走占位返回（不消耗 token）。v1 占位视频 base64 留空，前端渲染 placeholder 卡片

### 7.2 三种场景（互斥）

| 场景 | content[] 内容 | ratio 规则 |
|---|---|---|
| **t2va** 文生视频 | 仅 `{type:"text", text:"..."}` | 必填且 ≠ adaptive |
| **i2va** 图生视频 | text + 1-2 个 `image_url`（role=first_frame / last_frame） | 强制 adaptive（图片决定） |
| **r2va** 多模态参考生视频 | text + `reference_image` / `reference_video` / `reference_audio` 组合 | 可选，默认 adaptive |

> 互斥约束：i2va 和 r2va 不能同时出现（API 限制）。Rust 端 `detect_scenario` + 前端 `detectVideoScenario` 都做预检。

### 7.3 必填 / 可选参数

```typescript
{
  model: "MiniMax-H3",        // 固定
  content: ContentItem[],     // 必填，至少 1 个非空 text
  resolution: "768P" | "2K",  // 必填
  duration: number,            // 必填，4..=15
  ratio?: VideoRatio,          // 按场景规则
  aigcWatermark?: boolean,     // 默认 false（不加水印）
  callback_url?: string,       // v1 留空，预留
}
```

### 7.4 媒体限制

- 图片 ≤30MB、JPG/JPEG/PNG/WEBP/HEIC/HEIF，宽高 [256,5760]、宽高比 [0.4, 2.5]
- 视频 ≤50MB、MP4/MOV、≤3 段、总时长 ≤15s、每段 [2,15]s
- 音频 ≤15MB、WAV/MP3、≤3 段、每段 [2,15]s
- **请求体总大小 ≤64MB**

> **v1 限制**：r2va 的参考视频/音频仅支持外链 URL（避免 base64 超 64MB body 限制）。本地文件支持 v2 再做（需要平台 upload → mm_file:// 流程）。

### 7.5 异步任务模式

**提交**：POST → 返回 `task_id`（不阻塞）。**轮询**：GET `/v2/query/{task_id}` 直到状态变为终态。

| 状态 | 含义 |
|---|---|
| `queued` | 排队中 |
| `running` | 生成中 |
| `succeeded` | 成功，`content.url` 是视频产物（24h 有效） |
| `failed` | 失败，`error.code` + `error.message` |
| `cancelled` | 服务端取消（理论上不出现） |

**Rust 端轮询策略**（`commands::poll_video_task`）：
- 每 3s 查一次，最长 10 min
- succeeded 时立刻下载视频到 `app_data_dir/videos/<video-xxx>/0.mp4`（沿用 `jimeng::download_to_cache`）
- 连续 3 次查询失败 → 标记 network 错误
- 超时 → 标记 timeout

**前端事件**（`subscribeVideoEvents`）：
- `progress` → toast 显示「视频生成中… Xs（status）」
- `succeeded` → `createAsset({kind:"video", video:{url, localPath, duration, ratio, resolution, taskId}})` 入库
- `failed` → toast + 清 pending 状态
- `cancelled` → toast「视频生成已取消」

### 7.6 错误码速查

| HTTP | 内部码 | 含义 |
|---|---|---|
| 400 | 2013 | 参数错误（如 content 缺 text、t2va ratio=adaptive） |
| 401 | 1004 | 鉴权失败（Key 无效） |
| 402 | 1008 | 余额不足 |
| 422 | 1026 | 内容敏感（视频描述触发安全审核） |
| 429 | 1002 | 限流 |
| 500 | 1000 | 服务端错误 |

`commands::explain_error` 自动识别 `(<code>)` 后缀给前端友好提示（与生图共用一套解释器）。

### 7.7 资产模型扩展

- `AssetPayload.kind: "image" | "video"`（缺省 = "image"，老数据兼容）
- `AssetPayload.video: {url, localPath?, duration, ratio, resolution, taskId}`（`kind === "video"` 时必有）
- `assetMainImage` / `assetVideoSource` 都做了 `kind === "video"` 分支，返回 `video.localPath ?? video.url`
- UI 分支：`<video controls autoplay>` 替代 `<img>`（AssetCard / AssetDetailDialog / ResultGrid）

### 7.8 演示视频

`src-tauri/src/video.rs::DEMO_VIDEO_B64` v1 留空。要让 Demo 模式真的能播视频，把下面替换成一段真实 mp4 的 base64（≤100KB）：

```rust
// 选项 A：硬编码 base64（适合非常小的视频）
const DEMO_VIDEO_B64: &str = "AAAA...（mp4 base64）";

// 选项 B：include_bytes! + 运行时 base64
const DEMO_VIDEO_MP4: &[u8] = include_bytes!("../assets/demo-video.mp4");
// 然后在 query() 里 format!("data:video/mp4;base64,{}", base64::engine::general_purpose::STANDARD.encode(DEMO_VIDEO_MP4))
```

### 7.9 Key 隔离

视频 API Key 独立存到 `KEY_VIDEO_KV` 槽位，命令：
- `get_video_api_key` / `set_video_api_key` / `clear_video_api_key`

不与生图 Key 共享（`KEY_KV`）。前端 UI：设置面板新增独立「视频（MiniMax H3）API Key」section。
'''

    text = DOC.read_text(encoding="utf-8")
    if not text.endswith("\n"):
        text += "\n"
    DOC.write_text(text + block, encoding="utf-8")
    print(f"appended Part 7 to {DOC}")


def update_readme() -> None:
    s = README.read_text(encoding="utf-8")
    if "生视频" in s and "MiniMax H3" in s:
        print("README already mentions 生视频, skipping")
        return

    # Look for a "快速试用" / 快速开始 section and add a step
    # The README likely has a section like "## 快速试用" with a list of steps
    # We'll just append a new section at the end if not found
    if "## 快速试用" in s or "## 快速开始" in s or "## Quick Start" in s:
        # Try to add a step about video mode
        # We can add it after the existing 生图 step
        # Simpler: add a new bullet to the list
        # The format is likely: "1. xxx\n2. xxx\n..."
        # Just append a new step
        pass

    # Append a short section if no specific section found
    if "生视频" not in s:
        s = s.rstrip() + "\n\n## 生视频模式（v0.3 新增）\n\n- 设置面板填入视频 API Key（MiniMax H3 平台，独立于生图 Key）\n- 切到「生视频」输入模式\n- 输入 prompt + 选时长 / 分辨率 / 比例 → 点生成\n- 视频生成中（异步，30s\~2min），资产区出现 pending 卡片\n- 完成后自动入库，资产库 / 详情页可播放\n\n详见 `doc/api-integration.md` Part 7。\n"
        README.write_text(s, encoding="utf-8")
        print(f"updated {README}")


def main() -> int:
    append_doc_part7()
    update_readme()
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
