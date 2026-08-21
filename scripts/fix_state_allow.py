#!/usr/bin/env python3
"""Add #[allow(dead_code)] to VideoTaskHandle struct in state.rs."""
from pathlib import Path

STATE_RS = Path("E:/Pi/Y-agent/src-tauri/src/state.rs")


def main() -> int:
    s = STATE_RS.read_text(encoding="utf-8")
    old = "/// 单个正在进行的视频生成任务的句柄。\n/// 提交成功后塞进 AppState.video_tasks；取消时取出 cancel_tx 触发停止轮询。\npub struct VideoTaskHandle {"
    new = "/// 单个正在进行的视频生成任务的句柄。\n/// 提交成功后塞进 AppState.video_tasks；取消时取出 cancel_tx 触发停止轮询。\n///\n/// `project_id` / `submitted_at` v1 仅在调试日志里用，v2 持久化时也要用，先不警告。\n#[allow(dead_code)]\npub struct VideoTaskHandle {"
    if old not in s:
        print("old not found")
        return 1
    s = s.replace(old, new)
    STATE_RS.write_text(s, encoding="utf-8")
    print("ok")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
