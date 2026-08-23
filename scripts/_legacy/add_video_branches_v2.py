#!/usr/bin/env python3
"""Add video branches to AssetCard, AssetDetailDialog, ResultGrid — v2.

Cleaner approach: for AssetDetailDialog, just add a video branch at the top of
the existing return JSX (not as an early return). This avoids the splice issues.
"""
import re
from pathlib import Path

AC = Path("E:/Pi/Y-agent/src/components/workspace/AssetCard.tsx")
ADD = Path("E:/Pi/Y-agent/src/components/workspace/AssetDetailDialog.tsx")
RG = Path("E:/Pi/Y-agent/src/components/workspace/ResultGrid.tsx")


def patch_asset_card() -> None:
    s = AC.read_text(encoding="utf-8")
    if "asset.payload.kind === \"video\"" in s:
        print("AssetCard already patched, skipping")
        return

    # Imports
    old_imp = 'import type { Asset } from "@/lib/types";\nimport { assetMainImage, flatAssetImages, imageInput } from "@/lib/types";'
    new_imp = (
        'import type { Asset } from "@/lib/types";\n'
        'import { assetMainImage, assetVideoSource, flatAssetImages, imageInput } from "@/lib/types";\n'
        'import { resolveImageUrlSync } from "@/lib/image-resolver";'
    )
    s = s.replace(old_imp, new_imp)

    # Lucide imports: add Video
    s = s.replace(
        'import {\n  Layers,\n  Copy,\n  Download,\n  Trash2,\n  Check,\n  ImageIcon,\n  Droplet,\n  HardDrive,\n  AlertTriangle,\n  Loader2,\n} from "lucide-react";',
        'import {\n  Layers,\n  Copy,\n  Download,\n  Trash2,\n  Check,\n  ImageIcon,\n  Droplet,\n  HardDrive,\n  AlertTriangle,\n  Loader2,\n  Video as VideoIcon,\n} from "lucide-react";'
    )

    # Derive isVideo / videoSrc
    s = s.replace(
        "  const main = assetMainImage(asset);",
        "  const main = assetMainImage(asset);\n"
        "  const isVideo = asset.payload?.kind === \"video\";\n"
        "  const videoSrc = isVideo ? resolveImageUrlSync(assetVideoSource(asset)) : \"\";"
    )

    # Patch the three views (compact / grid / masonry).
    # The pattern is consistent: replace the <div className="relative [bg-elev|aspect]..."> block.
    # We use a regex that captures the inner conditional and inserts a video branch.
    # For compact view:
    s = s.replace(
        """          {asset.isLayerDecomposition ? (
            <LayerCompositeThumb asset={asset} className="absolute inset-0" />
          ) : main ? (
            <SafeImage
              src={main}
              alt={asset.prompt}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-muted">
              <ImageIcon className="w-5 h-5" />
            </div>
          )}""",
        """          {isVideo ? (
            videoSrc ? (
              <video
                src={videoSrc}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted bg-bg-base">
                <VideoIcon className="w-5 h-5" />
              </div>
            )
          ) : asset.isLayerDecomposition ? (
            <LayerCompositeThumb asset={asset} className="absolute inset-0" />
          ) : main ? (
            <SafeImage
              src={main}
              alt={asset.prompt}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-muted">
              <ImageIcon className="w-5 h-5" />
            </div>
          )}"""
    )
    # For grid and masonry views (where ImageIcon is w-10 h-10)
    s = s.replace(
        """          {asset.isLayerDecomposition ? (
            <LayerCompositeThumb asset={asset} className="absolute inset-0" />
          ) : main ? (
            <SafeImage
              src={main}
              alt={asset.prompt}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-muted">
              <ImageIcon className="w-10 h-10" />
            </div>
          )}""",
        """          {isVideo ? (
            videoSrc ? (
              <video
                src={videoSrc}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted bg-bg-base">
                <VideoIcon className="w-10 h-10" />
              </div>
            )
          ) : asset.isLayerDecomposition ? (
            <LayerCompositeThumb asset={asset} className="absolute inset-0" />
          ) : main ? (
            <SafeImage
              src={main}
              alt={asset.prompt}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-muted">
              <ImageIcon className="w-10 h-10" />
            </div>
          )}"""
    )
    # masonry (with loading=lazy on the SafeImage)
    s = s.replace(
        """        {asset.isLayerDecomposition ? (
          <LayerCompositeThumb asset={asset} className="absolute inset-0" />
        ) : main ? (
          <SafeImage
            src={main}
            alt={asset.prompt}
            className="w-full h-full object-cover block"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted">
            <ImageIcon className="w-10 h-10" />
          </div>
        )}""",
        """        {isVideo ? (
          videoSrc ? (
            <video
              src={videoSrc}
              className="w-full h-full object-cover block"
              muted
              playsInline
              preload="metadata"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-muted bg-bg-base">
              <VideoIcon className="w-10 h-10" />
            </div>
          )
        ) : asset.isLayerDecomposition ? (
          <LayerCompositeThumb asset={asset} className="absolute inset-0" />
        ) : main ? (
          <SafeImage
            src={main}
            alt={asset.prompt}
            className="w-full h-full object-cover block"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted">
            <ImageIcon className="w-10 h-10" />
          </div>
        )}"""
    )

    # Add "视频" badge before the existing layer/local badges
    # We insert a video badge for each view; use a small marker just before StatusBadge
    # The pattern: insert after `{asset.isLayerDecomposition && (...)}` and before `<StatusBadge`
    # Simpler: just add the badge inside the outer relative div, before the existing badges
    s = s.replace(
        """          {asset.isLayerDecomposition && (
            <div className="absolute top-2 right-2 bg-black/70 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
              <Layers className="w-3 h-3" /> 图层
            </div>
          )}
          <StatusBadge asset={asset} />""",
        """          {isVideo && (
            <div className="absolute top-2 left-2 bg-black/75 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
              <VideoIcon className="w-3 h-3" /> 视频
            </div>
          )}
          {asset.isLayerDecomposition && (
            <div className="absolute top-2 right-2 bg-black/70 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
              <Layers className="w-3 h-3" /> 图层
            </div>
          )}
          <StatusBadge asset={asset} />""",
    )
    # masonry view (same badge)
    s = s.replace(
        """        {asset.isLayerDecomposition && (
          <div className="absolute top-2 right-2 bg-black/70 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
            <Layers className="w-3 h-3" /> 图层
          </div>
        )}
        <StatusBadge asset={asset} />""",
        """        {isVideo && (
          <div className="absolute top-2 left-2 bg-black/75 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
            <VideoIcon className="w-3 h-3" /> 视频
          </div>
        )}
        {asset.isLayerDecomposition && (
          <div className="absolute top-2 right-2 bg-black/70 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
            <Layers className="w-3 h-3" /> 图层
          </div>
        )}
        <StatusBadge asset={asset} />""",
    )

    AC.write_text(s, encoding="utf-8")
    print(f"patched {AC}")


def patch_asset_detail_dialog() -> None:
    s = ADD.read_text(encoding="utf-8")
    if "isVideo" in s and "asset.payload?.kind" in s:
        print("AssetDetailDialog already patched, skipping")
        return

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

    # Strategy: insert the video return block AFTER the entire function body
    # but BEFORE the final closing brace of the component.
    # The component's return is the very last `return (...)` block.
    # Find the LAST `return (` (which is the component's main return) and insert
    # an `if (isVideo) return <VideoDetail />;` right before it.
    # We do this by finding the `return (` followed eventually by the final `);` and `}`.
    # Simplest: find the last `return (` at depth 0 and insert before it.
    # But the file has many `return (` (useEffect cleanups). We need the one at the
    # top level of the component.

    # Better: find the component's `export default function` line and the matching `}`.
    # We can find the position right before the last `return (` that belongs to the component.

    # Heuristic: find the LAST `  return (` in the file (that's the component return).
    # The component is the only function with `export default function`.
    # All useEffect cleanup returns are `    return () => ...` (different indentation).

    # Search for `  return (` preceded by `useEffect` block ending — actually the simplest
    # is to find the LAST occurrence of `  return (` (4-char indented).
    last_return_idx = s.rfind("  return (")
    if last_return_idx == -1:
        print("ERROR: cannot find last return")
        return

    # Insert the video early return block right before this position
    video_block = (
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
        "              <span>视频资产 · {asset.payload.video?.resolution} · {asset.payload.video?.duration}s · {asset.payload.video?.ratio}</span>\n"
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
        "\n"
    )
    s = s[:last_return_idx] + video_block + s[last_return_idx:]
    ADD.write_text(s, encoding="utf-8")
    print(f"patched {ADD}")


def patch_result_grid() -> None:
    s = RG.read_text(encoding="utf-8")
    if "videoAsset" in s:
        print("ResultGrid already patched, skipping")
        return

    # Imports
    s = s.replace(
        'import type { GeneratedImage } from "@/lib/types";\nimport { imageInput } from "@/lib/types";',
        'import type { Asset, GeneratedImage } from "@/lib/types";\nimport { assetVideoSource, imageInput } from "@/lib/types";\nimport { resolveImageUrlSync } from "@/lib/image-resolver";'
    )
    s = s.replace(
        'import { Download, Copy } from "lucide-react";',
        'import { Download, Copy, Video as VideoIcon } from "lucide-react";'
    )

    # Props: add videoAsset?
    old_props = "interface Props {\n  images: GeneratedImage[];\n  meta?: { prompt: string; costMs: number; modelName?: string; size?: string } | null;\n}"
    new_props = (
        "interface Props {\n"
        "  images: GeneratedImage[];\n"
        "  meta?: { prompt: string; costMs: number; modelName?: string; size?: string } | null;\n"
        "  /** P8：视频资产。传入时优先渲染视频，忽略 images。 */\n"
        "  videoAsset?: Asset;\n"
        "}"
    )
    s = s.replace(old_props, new_props)

    # Component signature + early return
    s = s.replace(
        "export default function ResultGrid({ images, meta }: Props) {",
        "export default function ResultGrid({ images, meta, videoAsset }: Props) {\n"
        "  // P8：视频分支\n"
        "  const isVideo = !!videoAsset && videoAsset.payload?.kind === \"video\";\n"
        "  const videoSrc = isVideo ? resolveImageUrlSync(assetVideoSource(videoAsset!)) : \"\";"
    )

    # Add video early return right after `const toast = useToast();`
    marker = "  const toast = useToast();\n  const onCopy = () => {"
    video_early = (
        "  const toast = useToast();\n"
        "  if (isVideo) {\n"
        "    return (\n"
        "      <div className=\"max-w-5xl mx-auto space-y-6\">\n"
        "        {meta && (\n"
        "          <div className=\"panel p-3 flex items-center justify-between gap-3\">\n"
        "            <p className=\"text-sm text-text-primary flex-1 line-clamp-2\">{meta.prompt}</p>\n"
        "            <div className=\"flex items-center gap-2 text-xs text-text-muted whitespace-nowrap\">\n"
        "              <span>{meta.modelName}</span>\n"
        "              {meta.size && <span>· {meta.size}</span>}\n"
        "              <span>· {meta.costMs}ms</span>\n"
        "            </div>\n"
        "          </div>\n"
        "        )}\n"
        "        <div className=\"panel p-4 flex flex-col items-center gap-3\">\n"
        "          {videoSrc ? (\n"
        "            <video\n"
        "              src={videoSrc}\n"
        "              controls\n"
        "              autoPlay\n"
        "              playsInline\n"
        "              className=\"max-w-full max-h-[70vh] rounded\"\n"
        "            />\n"
        "          ) : (\n"
        "            <div className=\"text-text-muted text-sm py-12 flex flex-col items-center gap-2\">\n"
        "              <VideoIcon className=\"w-8 h-8\" />\n"
        "              视频源不可用（可能 24h URL 过期或本地缓存丢失）\n"
        "            </div>\n"
        "          )}\n"
        "          {videoSrc && (\n"
        "            <a\n"
        "              href={videoSrc}\n"
        "              download={`y-agent-${videoAsset!.id}.mp4`}\n"
        "              target=\"_blank\"\n"
        "              rel=\"noreferrer\"\n"
        "              className=\"btn btn-primary\"\n"
        "            >\n"
        "              <Download className=\"w-3.5 h-3.5\" />\n"
        "              下载视频\n"
        "            </a>\n"
        "          )}\n"
        "        </div>\n"
        "      </div>\n"
        "    );\n"
        "  }\n"
        "  const onCopy = () => {"
    )
    s = s.replace(marker, video_early)

    RG.write_text(s, encoding="utf-8")
    print(f"patched {RG}")


def main() -> int:
    patch_asset_card()
    patch_asset_detail_dialog()
    patch_result_grid()
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
