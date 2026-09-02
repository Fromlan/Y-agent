#!/usr/bin/env python3
"""Update src/lib/types.ts to add AssetKind, VideoPayload, and AssetPayload.kind/video fields.
Uses Python to avoid PowerShell encoding issues with CJK characters.
"""
import re
from pathlib import Path

TYPES = Path("E:/Pi/Y-agent/src/lib/types.ts")


def main() -> int:
    s = TYPES.read_text(encoding="utf-8")

    # 1. Add AssetKind type + VideoPayload interface after the existing "AssetPayload" interface opener
    # Insert before `export interface AssetPayload {`
    kind_decl = (
        "/** 资产类型。`image`（默认）= 图片；`video` = 视频。\n"
        " * 老资产 payload 缺 `kind` 字段时一律按 image 处理。P8 新增。 */\n"
        "export type AssetKind = \"image\" | \"video\";\n\n"
        "/** 视频资产的元信息。`kind === \"video\"` 时必有。P8 新增。 */\n"
        "export interface VideoPayload {\n"
        "  /** 视频外链 URL（H3 产物，24h 失效）。localPath 有值时优先用 localPath。 */\n"
        "  url: string;\n"
        "  /** 本地缓存绝对路径（Rust 端 succeeded 时下载）。 */\n"
        "  localPath?: string;\n"
        "  /** 视频时长（秒）。 */\n"
        "  duration: number;\n"
        "  /** 视频宽高比：16:9 / 9:16 / adaptive 等。 */\n"
        "  ratio: string;\n"
        "  /** 分辨率：768P | 2K。 */\n"
        "  resolution: \"768P\" | \"2K\";\n"
        "  /** MiniMax H3 返回的 task_id。UI 重连或排查时用。 */\n"
        "  taskId: string;\n"
        "}\n\n"
    )
    if "export type AssetKind" not in s:
        s = s.replace("export interface AssetPayload {", kind_decl + "export interface AssetPayload {")

    # 2. Add kind + video fields to AssetPayload (insert at the end of the interface, before closing `}`)
    if '"kind"?: AssetKind' not in s:
        # Find the last field in AssetPayload and add ours after
        # We'll insert before the last `}` of the AssetPayload interface
        # Simpler: search for "  status?: " line and add after the last field
        # The interface ends with `  componentContractId?: string;\n}` — find that and insert before
        new_fields = (
            "  /** P8：资产类型。缺省视为 `\"image\"`。 */\n"
            "  kind?: AssetKind;\n"
            "  /** P8：视频元信息。`kind === \"video\"` 时必有。 */\n"
            "  video?: VideoPayload;\n"
        )
        # Insert before the closing `}` of AssetPayload interface
        # Use a regex to find the AssetPayload block
        pattern = re.compile(
            r"(export interface AssetPayload \{[\s\S]*?componentContractId\?:\s*string;\n)(\})",
            re.MULTILINE,
        )
        s = pattern.sub(lambda m: m.group(1) + new_fields + m.group(2), s)

    TYPES.write_text(s, encoding="utf-8")
    print(f"updated {TYPES}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
