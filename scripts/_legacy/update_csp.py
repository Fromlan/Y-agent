#!/usr/bin/env python3
"""Add `media-src` to the Tauri CSP so <video> elements can load from
asset:// / http://asset.localhost / https / data: URIs.
"""
from pathlib import Path

CONF = Path("E:/Pi/Y-agent/src-tauri/tauri.conf.json")


def main() -> int:
    s = CONF.read_text(encoding="utf-8")
    if "media-src" in s:
        print("media-src already in CSP, skipping")
        return 0
    old = "img-src 'self' data: https: blob: asset: http://asset.localhost;"
    new = "img-src 'self' data: https: blob: asset: http://asset.localhost; media-src 'self' data: https: blob: asset: http://asset.localhost;"
    if old not in s:
        print("ERROR: img-src not found")
        return 1
    s = s.replace(old, new, 1)
    CONF.write_text(s, encoding="utf-8")
    print("added media-src to CSP")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
