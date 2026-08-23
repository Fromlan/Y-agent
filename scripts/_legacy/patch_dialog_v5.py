#!/usr/bin/env python3
"""v5: insert video block AFTER the onDownloadCur function in AssetDetailDialog.

The marker is the line `onDownload(cur.url, ...);` which is unique to the
main component (not used in LayerCompositeStage or other inner functions).
"""
from pathlib import Path

ADD = Path("E:/Pi/Y-agent/src/components/workspace/AssetDetailDialog.tsx")


def main() -> int:
    s = ADD.read_text(encoding="utf-8")
    if "P8：视频资产走专用渲染" in s:
        print("AssetDetailDialog already patched, skipping")
        return 0

    # Lucide imports
    s = s.replace(
        'import {\n  X,\n  Copy,\n  Download,\n  Trash2,\n  ChevronLeft,\n  ChevronRight,\n  Layers,\n  ImageIcon,\n  Clock,',
        'import {\n  X,\n  Copy,\n  Download,\n  Trash2,\n  ChevronLeft,\n  ChevronRight,\n  Layers,\n  ImageIcon,\n  Video as VideoIcon,\n  Clock,'
    )

    # Other imports
    old_imp = 'import { assetMainImage, flatAssetImages, imageInput } from "@/lib/types";'
    new_imp = (
        'import { assetMainImage, assetVideoSource, flatAssetImages, imageInput } from "@/lib/types";\n'
        'import { resolveImageUrlSync } from "@/lib/image-resolver";'
    )
    s = s.replace(old_imp, new_imp)

    # Derive isVideo / videoSrc after `const images = flatAssetImages(asset);`
    s = s.replace(
        "  const images = flatAssetImages(asset);",
        "  const images = flatAssetImages(asset);\n"
        "  const isVideo = asset.payload?.kind === \"video\";\n"
        "  const videoSrc = isVideo ? resolveImageUrlSync(assetVideoSource(asset)) : \"\";"
    )

    # Insert the video block right after the `onDownloadCur` function definition.
    # The unique marker: `};` followed by `\n  const onCopy = ...`
    # We use a more specific marker.
    marker = (
        "  const onDownloadCur = () => {\n"
        "    if (!cur?.url) return;\n"
        "    const ext = detectImageExt(cur, asset.payload.outputFormat);\n"
        "    const label = cur.name ? `-${cur.name.replace(/\\s+/g, \"_\")}` : `-${effectiveIdx + 1}`;\n"
        "    onDownload(cur.url, `y-agent-${asset.id}${label}.${ext}`);\n"
        "  };\n"
    )
    if marker not in s:
        print("ERROR: marker not found")
        return 1

    video_block = (
        "  const onDownloadCur = () => {\n"
        "    if (!cur?.url) return;\n"
        "    const ext = detectImageExt(cur, asset.payload.outputFormat);\n"
        "    const label = cur.name ? `-${cur.name.replace(/\\s+/g, \"_\")}` : `-${effectiveIdx + 1}`;\n"
        "    onDownload(cur.url, `y-agent-${asset.id}${label}.${ext}`);\n"
        "  };\n"
        "\n"
        "  // P8：视频资产走专用渲染（无多图/图层/局部编辑）\n"
        "  if (isVideo) {\n"
        "    return (\n"
        "      <div\n"
        "        className=\"fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay\"\n"
        "        onClick={onClose}\n"
        "      >\n"
        "        <div\n"
        "          className=\"panel w-[90vw] max-w-4xl p-4 max-h-[90vh] flex flex-col gap-3\"\n"
        "          onClick={(e) => e.stopPropagation()}\n"
        "        >\n"
        "          <div className=\"flex items-center justify-between\">\n"
        "            <div className=\"flex items-center gap-2 text-xs text-text-muted\">\n"
        "              <VideoIcon className=\"w-4 h-4 text-accent\" />\n"
        "              <span>\n"
        "                视频资产 · {asset.payload.video?.resolution} · {asset.payload.video?.duration}s · {asset.payload.video?.ratio}\n"
        "              </span>\n"
        "            </div>\n"
        "            <button onClick={onClose} className=\"btn-icon\">\n"
        "              <X className=\"w-4 h-4\" />\n"
        "            </button>\n"
        "          </div>\n"
        "          <div className=\"flex-1 flex items-center justify-center bg-black rounded overflow-hidden min-h-0\">\n"
        "            {videoSrc ? (\n"
        "              <video\n"
        "                src={videoSrc}\n"
        "                controls\n"
        "                autoPlay\n"
        "                playsInline\n"
        "                className=\"max-w-full max-h-[60vh] object-contain\"\n"
        "              />\n"
        "            ) : (\n"
        "              <div className=\"text-text-muted text-sm p-8\">\n"
        "                视频源不可用（可能 URL 24h 过期或本地缓存丢失）\n"
        "              </div>\n"
        "            )}\n"
        "          </div>\n"
        "          <div className=\"flex items-center justify-between text-[11px] text-text-muted\">\n"
        "            <p className=\"line-clamp-2 flex-1\">{asset.prompt}</p>\n"
        "            <div className=\"flex items-center gap-2\">\n"
        "              {videoSrc && (\n"
        "                <a href={videoSrc} download={`y-agent-${asset.id}.mp4`} target=\"_blank\" rel=\"noreferrer\" className=\"btn-icon p-1\" title=\"下载\">\n"
        "                  <Download className=\"w-3.5 h-3.5\" />\n"
        "                </a>\n"
        "              )}\n"
        "              <button onClick={() => onCopyPrompt(asset.prompt)} className=\"btn-icon p-1\" title=\"复制 prompt\">\n"
        "                <Copy className=\"w-3.5 h-3.5\" />\n"
        "              </button>\n"
        "              <button\n"
        "                onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}\n"
        "                className=\"btn-icon p-1 text-text-muted hover:text-accent-danger\"\n"
        "                title=\"删除\"\n"
        "              >\n"
        "                <Trash2 className=\"w-3.5 h-3.5\" />\n"
        "              </button>\n"
        "            </div>\n"
        "          </div>\n"
        "        </div>\n"
        "      </div>\n"
        "    );\n"
        "  }\n"
    )
    s = s.replace(marker, video_block, 1)
    ADD.write_text(s, encoding="utf-8")
    print(f"patched {ADD}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
