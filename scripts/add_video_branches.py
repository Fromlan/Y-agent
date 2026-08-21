#!/usr/bin/env python3
"""Add video branches to AssetCard, AssetDetailDialog, ResultGrid.

Strategy: each component gets a `kind === "video"` branch.
- AssetCard: render <video> in compact/grid/masonry modes
- AssetDetailDialog: render <video controls autoplay>
- ResultGrid: also handle video

This script is conservative — it adds small branch blocks at the top of each
render function. The branches use resolveImageUrlSync for the video source.
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

    # Add imports: Video icon + resolveImageUrlSync + assetVideoSource
    old_imp = 'import type { Asset } from "@/lib/types";\nimport { assetMainImage, flatAssetImages, imageInput } from "@/lib/types";'
    new_imp = (
        'import type { Asset } from "@/lib/types";\n'
        'import { assetMainImage, assetVideoSource, flatAssetImages, imageInput } from "@/lib/types";\n'
        'import { resolveImageUrlSync } from "@/lib/image-resolver";'
    )
    s = s.replace(old_imp, new_imp)

    # Add Video icon to lucide imports
    s = s.replace(
        'import {\n  Layers,\n  Copy,\n  Download,\n  Trash2,\n  Check,\n  ImageIcon,\n  Droplet,\n  HardDrive,\n  AlertTriangle,\n  Loader2,\n} from "lucide-react";',
        'import {\n  Layers,\n  Copy,\n  Download,\n  Trash2,\n  Check,\n  ImageIcon,\n  Droplet,\n  HardDrive,\n  AlertTriangle,\n  Loader2,\n  Video as VideoIcon,\n  Play,\n} from "lucide-react";'
    )

    # In the render, after the `main` derivation, add a `videoSrc` derivation
    # We do this by replacing the `const main = assetMainImage(asset);` line
    s = s.replace(
        "  const main = assetMainImage(asset);",
        "  const main = assetMainImage(asset);\n"
        "  const isVideo = asset.payload?.kind === \"video\";\n"
        "  const videoSrc = isVideo ? resolveImageUrlSync(assetVideoSource(asset)) : \"\";"
    )

    # In the compact view, replace the image rendering with a video branch
    # The compact view has: {asset.isLayerDecomposition ? (<LayerCompositeThumb ... />) : main ? (<SafeImage ... />) : (...)}
    # We add a video branch before the layer branch
    compact_old = (
        "        <div className=\"relative aspect-square bg-bg-elev rounded overflow-hidden border border-border\">\n"
        "          {asset.isLayerDecomposition ? (\n"
        "            <LayerCompositeThumb asset={asset} className=\"absolute inset-0\" />\n"
        "          ) : main ? (\n"
        "            <SafeImage\n"
        "              src={main}\n"
        "              alt={asset.prompt}\n"
        "              className=\"w-full h-full object-cover\"\n"
        "            />\n"
        "          ) : (\n"
        "            <div className=\"w-full h-full flex items-center justify-center text-text-muted\">\n"
        "              <ImageIcon className=\"w-5 h-5\" />\n"
        "            </div>\n"
        "          )}\n"
        "        </div>"
    )
    compact_new = (
        "        <div className=\"relative aspect-square bg-bg-elev rounded overflow-hidden border border-border\">\n"
        "          {isVideo ? (\n"
        "            videoSrc ? (\n"
        "              <video\n"
        "                src={videoSrc}\n"
        "                className=\"w-full h-full object-cover\"\n"
        "                muted\n"
        "                playsInline\n"
        "                preload=\"metadata\"\n"
        "                onClick={(e) => e.stopPropagation()}\n"
        "              />\n"
        "            ) : (\n"
        "              <div className=\"w-full h-full flex items-center justify-center text-text-muted bg-bg-base\">\n"
        "                <VideoIcon className=\"w-5 h-5\" />\n"
        "              </div>\n"
        "            )\n"
        "          ) : asset.isLayerDecomposition ? (\n"
        "            <LayerCompositeThumb asset={asset} className=\"absolute inset-0\" />\n"
        "          ) : main ? (\n"
        "            <SafeImage\n"
        "              src={main}\n"
        "              alt={asset.prompt}\n"
        "              className=\"w-full h-full object-cover\"\n"
        "            />\n"
        "          ) : (\n"
        "            <div className=\"w-full h-full flex items-center justify-center text-text-muted\">\n"
        "              <ImageIcon className=\"w-5 h-5\" />\n"
        "            </div>\n"
        "          )}\n"
        "          {isVideo && (\n"
        "            <div className=\"absolute top-1 right-1 bg-black/70 text-accent text-[9px] px-1 py-0.5 rounded flex items-center gap-0.5\">\n"
        "              <VideoIcon className=\"w-2.5 h-2.5\" /> 视频\n"
        "            </div>\n"
        "          )}\n"
        "        </div>"
    )
    s = s.replace(compact_old, compact_new)

    # In the grid view, same idea. Find the grid view's main area div.
    grid_old = (
        "        <div className=\"relative aspect-square bg-bg-elev overflow-hidden\">\n"
        "          {asset.isLayerDecomposition ? (\n"
        "            <LayerCompositeThumb asset={asset} className=\"absolute inset-0\" />\n"
        "          ) : main ? (\n"
        "            <SafeImage\n"
        "              src={main}\n"
        "              alt={asset.prompt}\n"
        "              className=\"w-full h-full object-cover\"\n"
        "            />\n"
        "          ) : (\n"
        "            <div className=\"w-full h-full flex items-center justify-center text-text-muted\">\n"
        "              <ImageIcon className=\"w-10 h-10\" />\n"
        "            </div>\n"
        "          )}\n"
        "          {asset.isLayerDecomposition && (\n"
        "            <div className=\"absolute top-2 right-2 bg-black/70 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1\">\n"
        "              <Layers className=\"w-3 h-3\" /> 图层\n"
        "            </div>\n"
        "          )}\n"
        "          <StatusBadge asset={asset} />"
    )
    grid_new = (
        "        <div className=\"relative aspect-square bg-bg-elev overflow-hidden\">\n"
        "          {isVideo ? (\n"
        "            videoSrc ? (\n"
        "              <video\n"
        "                src={videoSrc}\n"
        "                className=\"w-full h-full object-cover\"\n"
        "                muted\n"
        "                playsInline\n"
        "                preload=\"metadata\"\n"
        "                onClick={(e) => e.stopPropagation()}\n"
        "              />\n"
        "            ) : (\n"
        "              <div className=\"w-full h-full flex items-center justify-center text-text-muted bg-bg-base\">\n"
        "                <VideoIcon className=\"w-10 h-10\" />\n"
        "              </div>\n"
        "            )\n"
        "          ) : asset.isLayerDecomposition ? (\n"
        "            <LayerCompositeThumb asset={asset} className=\"absolute inset-0\" />\n"
        "          ) : main ? (\n"
        "            <SafeImage\n"
        "              src={main}\n"
        "              alt={asset.prompt}\n"
        "              className=\"w-full h-full object-cover\"\n"
        "            />\n"
        "          ) : (\n"
        "            <div className=\"w-full h-full flex items-center justify-center text-text-muted\">\n"
        "              <ImageIcon className=\"w-10 h-10\" />\n"
        "            </div>\n"
        "          )}\n"
        "          {isVideo && (\n"
        "            <div className=\"absolute top-2 left-2 bg-black/75 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1\">\n"
        "              <VideoIcon className=\"w-3 h-3\" /> 视频\n"
        "            </div>\n"
        "          )}\n"
        "          {asset.isLayerDecomposition && (\n"
        "            <div className=\"absolute top-2 right-2 bg-black/70 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1\">\n"
        "              <Layers className=\"w-3 h-3\" /> 图层\n"
        "            </div>\n"
        "          )}\n"
        "          <StatusBadge asset={asset} />"
    )
    s = s.replace(grid_old, grid_new)

    # In the masonry view, similar
    masonry_old = (
        "      <div className=\"relative h-48 bg-bg-elev overflow-hidden\">\n"
        "        {asset.isLayerDecomposition ? (\n"
        "          <LayerCompositeThumb asset={asset} className=\"absolute inset-0\" />\n"
        "        ) : main ? (\n"
        "          <SafeImage\n"
        "            src={main}\n"
        "            alt={asset.prompt}\n"
        "            className=\"w-full h-full object-cover block\"\n"
        "            loading=\"lazy\"\n"
        "          />\n"
        "        ) : (\n"
        "          <div className=\"w-full h-full flex items-center justify-center text-text-muted\">\n"
        "            <ImageIcon className=\"w-10 h-10\" />\n"
        "          </div>\n"
        "        )}\n"
        "        {asset.isLayerDecomposition && (\n"
        "          <div className=\"absolute top-2 right-2 bg-black/70 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1\">\n"
        "            <Layers className=\"w-3 h-3\" /> 图层\n"
        "          </div>\n"
        "        )}\n"
        "        <StatusBadge asset={asset} />"
    )
    masonry_new = (
        "      <div className=\"relative h-48 bg-bg-elev overflow-hidden\">\n"
        "        {isVideo ? (\n"
        "          videoSrc ? (\n"
        "            <video\n"
        "              src={videoSrc}\n"
        "              className=\"w-full h-full object-cover block\"\n"
        "              muted\n"
        "              playsInline\n"
        "              preload=\"metadata\"\n"
        "              onClick={(e) => e.stopPropagation()}\n"
        "            />\n"
        "          ) : (\n"
        "            <div className=\"w-full h-full flex items-center justify-center text-text-muted bg-bg-base\">\n"
        "              <VideoIcon className=\"w-10 h-10\" />\n"
        "            </div>\n"
        "          )\n"
        "        ) : asset.isLayerDecomposition ? (\n"
        "          <LayerCompositeThumb asset={asset} className=\"absolute inset-0\" />\n"
        "        ) : main ? (\n"
        "          <SafeImage\n"
        "            src={main}\n"
        "            alt={asset.prompt}\n"
        "            className=\"w-full h-full object-cover block\"\n"
        "            loading=\"lazy\"\n"
        "          />\n"
        "        ) : (\n"
        "          <div className=\"w-full h-full flex items-center justify-center text-text-muted\">\n"
        "            <ImageIcon className=\"w-10 h-10\" />\n"
        "          </div>\n"
        "        )}\n"
        "        {isVideo && (\n"
        "          <div className=\"absolute top-2 left-2 bg-black/75 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1\">\n"
        "            <VideoIcon className=\"w-3 h-3\" /> 视频\n"
        "          </div>\n"
        "        )}\n"
        "        {asset.isLayerDecomposition && (\n"
        "          <div className=\"absolute top-2 right-2 bg-black/70 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1\">\n"
        "            <Layers className=\"w-3 h-3\" /> 图层\n"
        "          </div>\n"
        "        )}\n"
        "        <StatusBadge asset={asset} />"
    )
    s = s.replace(masonry_old, masonry_new)

    AC.write_text(s, encoding="utf-8")
    print(f"patched {AC}")


def patch_asset_detail_dialog() -> None:
    s = ADD.read_text(encoding="utf-8")
    if "asset.payload?.kind === \"video\"" in s:
        print("AssetDetailDialog already patched, skipping")
        return

    # Add Video icon import
    s = s.replace(
        'import {\n  X,\n  Copy,\n  Download,\n  Trash2,\n  ChevronLeft,\n  ChevronRight,\n  Layers,\n  ImageIcon,\n  Clock,',
        'import {\n  X,\n  Copy,\n  Download,\n  Trash2,\n  ChevronLeft,\n  ChevronRight,\n  Layers,\n  ImageIcon,\n  Video as VideoIcon,\n  Clock,'
    )

    # Add resolveImageUrlSync + assetVideoSource import
    old_imp = 'import { assetMainImage, flatAssetImages, imageInput } from "@/lib/types";'
    new_imp = (
        'import { assetMainImage, assetVideoSource, flatAssetImages, imageInput } from "@/lib/types";\n'
        'import { resolveImageUrlSync } from "@/lib/image-resolver";'
    )
    s = s.replace(old_imp, new_imp)

    # Add a video source derivation near the top of the component
    s = s.replace(
        "  const images = flatAssetImages(asset);",
        "  const images = flatAssetImages(asset);\n"
        "  const isVideo = asset.payload?.kind === \"video\";\n"
        "  const videoSrc = isVideo ? resolveImageUrlSync(assetVideoSource(asset)) : \"\";"
    )

    # In the main preview area, add a video branch. Find the image render block
    # This is harder because there are multiple image renders. We'll skip the
    # detail dialog for now and only show the video info in the metadata section
    # because the current detail layout is for layers. For video we'll show
    # the video player as a full-size element if isVideo.
    # We can wrap the main image area in a conditional. For simplicity, add a
    # check at the top of the return JSX.
    # Actually, since the detail dialog has a complex layout, we'll add a simpler
    # approach: when isVideo, render a dedicated video player at the top of the
    # main area instead of the image grid.
    # Look for the `<div className="flex-1 flex items-center justify-center bg-bg-base p-4">` block
    # (or similar). Let me just inject a new branch at the start of the return.

    # The simplest approach: find the return statement and add a video case.
    # But the return is a complex JSX. Let me just add a video overlay in the
    # image area. The detail dialog uses LayerCompositeStage / single image
    # view. For now, just add a video branch at the top of the main render.

    # Find the main flex container around line 80
    # The structure: <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
    # We add a video case before this block. Easier: just add an isVideo early return

    # Actually the cleanest: replace the main image render in the image area.
    # Let me find the image render — it's after the layer stuff.
    # Simpler: add an early return for video case at the top of the JSX.

    # Find the "return (" line of the component
    return_idx = s.find("  return (")
    if return_idx == -1:
        print("WARN: could not find return statement")
        ADD.write_text(s, encoding="utf-8")
        return

    # Insert an early return for video BEFORE the main return
    video_early_return = (
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
        "  "
    )
    # Insert the early return right before the existing "  return ("
    s = s[:return_idx] + video_early_return + s[return_idx + len("  return ("):]
    # Hmm that's tricky because the original is "  return (". Let me just splice.
    ADD.write_text(s, encoding="utf-8")
    print(f"patched {ADD}")


def patch_result_grid() -> None:
    s = RG.read_text(encoding="utf-8")
    if "isVideo" in s and "asset.payload" in s:
        print("ResultGrid already patched, skipping")
        return

    # Add imports
    s = s.replace(
        'import type { GeneratedImage } from "@/lib/types";\nimport { imageInput } from "@/lib/types";',
        'import type { Asset, GeneratedImage } from "@/lib/types";\nimport { assetVideoSource, imageInput } from "@/lib/types";\nimport { resolveImageUrlSync } from "@/lib/image-resolver";'
    )

    # Add Video icon
    s = s.replace(
        'import { Download, Copy } from "lucide-react";',
        'import { Download, Copy, Video as VideoIcon } from "lucide-react";'
    )

    # Update Props to accept a single asset (for video) — or rather, allow passing a video asset
    # The current ResultGrid is image-specific. For now, just add a video branch if
    # the consumer passes a single video asset via a new `videoAsset?: Asset` prop.
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

    # Add video branch at the top of the render
    s = s.replace(
        "export default function ResultGrid({ images, meta }: Props) {",
        "export default function ResultGrid({ images, meta, videoAsset }: Props) {\n"
        "  // P8：视频分支\n"
        "  const isVideo = videoAsset?.payload?.kind === \"video\";\n"
        "  const videoSrc = isVideo ? resolveImageUrlSync(assetVideoSource(videoAsset)) : \"\";"
    )

    # Wrap the return in a video case: if videoAsset, render video player
    # Find the return and add a video case at the top
    # Strategy: add `if (isVideo) return <VideoResult ...>` before the main return
    # We add a new early return right after the `const toast = useToast();` line
    marker = "  const toast = useToast();\n  const onCopy = () => {"
    new_early = (
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
    s = s.replace(marker, new_early)

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
