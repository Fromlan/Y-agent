#!/usr/bin/env python3
"""Remove the v2 '本地视频/音频文件' future-feature mention from
doc/api-integration.md (Part 7).
"""
from pathlib import Path

DOC = Path("E:/Pi/Y-agent/doc/api-integration.md")


def main() -> int:
    s = DOC.read_text(encoding="utf-8")
    old = (
        "> **v1 限制**：r2va 的参考视频/音频仅支持外链 URL（避免 base64 超 64MB body 限制）。本地文件支持 v2 再做（需要平台 upload → mm_file:// 流程）。\n"
    )
    new = (
        "> r2va 的参考视频/音频仅支持外链 URL。\n"
    )
    if old not in s:
        print("marker not found, skipping")
        return 0
    s = s.replace(old, new, 1)
    DOC.write_text(s, encoding="utf-8")
    print(f"updated {DOC}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
