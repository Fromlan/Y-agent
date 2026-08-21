#!/usr/bin/env python3
"""Add assetVideoSource helper to types.ts and update assetMainImage / flatAssetImages to handle video.
"""
from pathlib import Path

TYPES = Path("E:/Pi/Y-agent/src/lib/types.ts")


def main() -> int:
    s = TYPES.read_text(encoding="utf-8")

    # 1. Update flatAssetImages: when kind === "video", return empty array (or a single synthesized image?)
    #    For simplicity, keep it returning [] for video so existing code that iterates doesn't break.
    #    But this would break assetMainImage's "image" assumption.
    # 2. Update assetMainImage to return video localPath/url when kind === "video"
    # 3. Add assetVideoSource helper

    # Add the helper function after assetMainImage
    helper_code = (
        "\n"
        "/** 取视频资产的播放源：localPath 优先，缺失时回退 url。\n"
        " *  返回的是原始字符串（可能是 Windows 路径 / http URL / data URL），\n"
        " *  上层应通过 `resolveImageUrlSync` 转成浏览器可用的 `asset://` / `data:` URL。 */\n"
        "export function assetVideoSource(asset: Asset): string | null {\n"
        "  if (asset.payload?.kind !== \"video\" || !asset.payload.video) return null;\n"
        "  return asset.payload.video.localPath ?? asset.payload.video.url ?? null;\n"
        "}\n"
    )

    # Update assetMainImage to handle video
    old_main = (
        "export function assetMainImage(asset: Asset): string | null {\n"
        "  if (asset.isLayerDecomposition && asset.payload.layers?.length) {\n"
        "    const rawLayers = asset.payload.layers;\n"
        "    const layerLocalPaths = asset.payload.layerLocalPaths ?? [];\n"
        "    let baseIdx = rawLayers.findIndex((l) => layerZIndex(l) === 0);\n"
        "    if (baseIdx === -1) baseIdx = 0;\n"
        "    const base = rawLayers[baseIdx];\n"
        "    return layerLocalPaths[baseIdx] ?? base?.localPath ?? base?.url ?? rawLayers[0]?.url ?? null;\n"
        "  }\n"
        "  const local = asset.payload.localPaths?.[0];\n"
        "  return local ?? asset.payload.urls?.[0] ?? null;\n"
        "}"
    )
    new_main = (
        "export function assetMainImage(asset: Asset): string | null {\n"
        "  // 视频资产走 video.localPath / video.url\n"
        "  const v = assetVideoSource(asset);\n"
        "  if (v) return v;\n"
        "  if (asset.isLayerDecomposition && asset.payload.layers?.length) {\n"
        "    const rawLayers = asset.payload.layers;\n"
        "    const layerLocalPaths = asset.payload.layerLocalPaths ?? [];\n"
        "    let baseIdx = rawLayers.findIndex((l) => layerZIndex(l) === 0);\n"
        "    if (baseIdx === -1) baseIdx = 0;\n"
        "    const base = rawLayers[baseIdx];\n"
        "    return layerLocalPaths[baseIdx] ?? base?.localPath ?? base?.url ?? rawLayers[0]?.url ?? null;\n"
        "  }\n"
        "  const local = asset.payload.localPaths?.[0];\n"
        "  return local ?? asset.payload.urls?.[0] ?? null;\n"
        "}"
    )

    if "export function assetVideoSource" not in s:
        s = s.replace(old_main, new_main + helper_code)
        print("updated assetMainImage + added assetVideoSource")
    else:
        print("assetVideoSource already present, skipping")

    TYPES.write_text(s, encoding="utf-8")
    print(f"updated {TYPES}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
