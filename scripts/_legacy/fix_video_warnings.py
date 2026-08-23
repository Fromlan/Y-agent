#!/usr/bin/env python3
"""Apply small fixes to video.rs and commands.rs to silence dead_code warnings."""
from pathlib import Path

VIDEO_RS = Path("E:/Pi/Y-agent/src-tauri/src/video.rs")
COMMANDS_RS = Path("E:/Pi/Y-agent/src-tauri/src/commands.rs")


def main() -> int:
    s = VIDEO_RS.read_text(encoding="utf-8")

    # Add #[allow(dead_code)] to VideoTaskHandle
    s = s.replace(
        "/// 单个正在进行的视频生成任务的句柄。\n"
        "/// 提交成功后塞进 AppState.video_tasks；取消时取出 cancel_tx 触发停止轮询。\n"
        "pub struct VideoTaskHandle {",
        "/// 单个正在进行的视频生成任务的句柄。\n"
        "/// 提交成功后塞进 AppState.video_tasks；取消时取出 cancel_tx 触发停止轮询。\n"
        "#[allow(dead_code)]\n"
        "pub struct VideoTaskHandle {",
    )

    # Drop base_resp (never read; submit only uses task_id)
    s = s.replace(
        "#[derive(Debug, Deserialize)]\n"
        "pub struct VideoSubmitResp {\n"
        "    pub task_id: String,\n"
        "    #[serde(default)]\n"
        "    pub base_resp: Option<Value>,\n"
        "}",
        "#[derive(Debug, Deserialize)]\n"
        "pub struct VideoSubmitResp {\n"
        "    pub task_id: String,\n"
        "}",
    )

    # Drop unused OAI error types (kept only in spec; we use anyhow + text)
    oai_block = (
        "// ============================================================================\n"
        "// OAI 错误响应（与 jimeng.rs 风格一致）\n"
        "// ============================================================================\n\n"
        "#[derive(Debug, Deserialize, Serialize, Clone)]\n"
        "pub struct OaiErrorEnvelope {\n"
        "    #[serde(rename = \"type\", default)]\n"
        "    pub kind: Option<String>,\n"
        "    #[serde(default)]\n"
        "    pub error: Option<OaiErrorDetail>,\n"
        "    #[serde(default)]\n"
        "    pub request_id: Option<String>,\n"
        "}\n\n"
        "#[derive(Debug, Deserialize, Serialize, Clone)]\n"
        "pub struct OaiErrorDetail {\n"
        "    #[serde(rename = \"type\", default)]\n"
        "    pub kind: Option<String>,\n"
        "    #[serde(default)]\n"
        "    pub message: Option<String>,\n"
        "    #[serde(default, rename = \"http_code\")]\n"
        "    pub http_code: Option<String>,\n"
        "}\n\n"
    )
    s = s.replace(oai_block, "")

    # Drop unused serde_json::Value import
    s = s.replace("use serde_json::Value;\n", "")

    VIDEO_RS.write_text(s, encoding="utf-8")
    print(f"fixed {VIDEO_RS}")

    # Drop `mut` on state_guard
    s = COMMANDS_RS.read_text(encoding="utf-8")
    s = s.replace(
        "let mut state_guard = state.lock().map_err(map_err)?;",
        "let state_guard = state.lock().map_err(map_err)?;",
    )
    COMMANDS_RS.write_text(s, encoding="utf-8")
    print(f"fixed {COMMANDS_RS}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
