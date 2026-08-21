/**
 * 单图层 bbox 位置缩略图（共享组件）。
 *
 * 视觉：
 * - 容器: 48x48(默认) / 32x32(`size={32}`)
 * - 背景: 底图层（`baseLayer`）`object-cover` 铺满 —— 让用户看到「这一层应该在底图的哪个区域」
 * - 前景: 当前图层（`layer`）按 `boundingBox.normalized` 定位 + accent 边框
 * - 缺 bbox 时: 中央虚线占位 + AlertTriangle 图标
 * - 底图层（zIndex=0）特殊: 只渲染自身，边框填满（因为 bbox 铺满整画布）
 *
 * 用于：
 * - 资产卡（AssetCard）右下角的 `LayerThumbnailMini`：把 base + 3 个 bbox 色块简化为单层 bbox
 * - 资产详情对话框（AssetDetailDialog）图层行：合并 48x48 主图 + 32x32 bbox mini 为单 48x48
 *
 * 关键实现细节：
 * - bbox 描边用 `box-shadow: inset` 而非 `border`，避免 bbox 占满时 border 外沿被 `overflow-hidden` 裁掉
 * - 前景图层用 `object-contain` 而非 `cover`：图层 PNG 天然尺寸可能与 bbox 区域 aspect 不同，
 *   contain 保证图层按自身比例缩放 + 居中，不会被强行拉伸
 */
import { AlertTriangle, EyeOff } from "lucide-react";
import type { GeneratedImage } from "@/lib/types";
import { imageInput } from "@/lib/types";
import { layerRectNormalized, isNormalizedBboxValid } from "@/lib/layer-view";
import SafeImage from "@/components/shared/SafeImage";

interface Props {
  /** 底图层（zIndex=0），用作背景 */
  baseLayer: GeneratedImage;
  /** 当前要展示的图层 */
  layer: GeneratedImage;
  /** 容器尺寸: 48（默认，资产卡 / 详情列表行）或 32（紧凑模式，预留） */
  size?: 48 | 32;
  /** 是否高亮（选中时 accent 加深 + ring） */
  highlight?: boolean;
  /** 是否隐藏（半透明 + EyeOff 角标） */
  hidden?: boolean;
}

export default function LayerThumb({
  baseLayer,
  layer,
  size = 48,
  highlight = false,
  hidden = false,
}: Props) {
  const baseUrl = imageInput(baseLayer);
  const layerUrl = imageInput(layer);
  const n = layerRectNormalized(layer);
  const isBase = (layer.zIndex ?? 0) === 0;
  // bbox 是否缺失：缺 normalized / 越界 / 反向 → layerRectNormalized 会回退铺满
  // 我们需要的是「原数据是否健康」，不能只看 n 的输出值（铺满时 n 看起来「正常」）
  const rawNorm = layer.boundingBox?.normalized;
  const bboxMissing = !isBase && !isNormalizedBboxValid(rawNorm);

  const sizeClass = size === 32 ? "w-8 h-8" : "w-12 h-12";

  return (
    <div
      className={`relative ${sizeClass} rounded overflow-hidden border flex-shrink-0
        ${highlight ? "border-accent ring-1 ring-accent/40" : "border-border"}
        bg-bg-base`}
      title={
        bboxMissing
          ? `${layer.name ?? "图层"}（缺位置信息）`
          : `bbox [${(rawNorm ?? []).join(", ")}] (0-1000)`
      }
    >
      {/* 背景: 底图层铺满 */}
      {baseUrl ? (
        <SafeImage
          src={baseUrl}
          alt=""
          className="block absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-bg-elev" />
      )}
      {/* 前景: 当前图层按 bbox 定位 */}
      {bboxMissing ? (
        // 缺 bbox: 中央虚线占位
        <div className="absolute inset-2 border-2 border-dashed border-warning/70
          bg-warning/10 flex items-center justify-center text-warning">
          <AlertTriangle className="w-3 h-3" />
        </div>
      ) : (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${n.left * 100}%`,
            top: `${n.top * 100}%`,
            width: `${n.width * 100}%`,
            height: `${n.height * 100}%`,
          }}
        >
          {/* bbox 描边: accent 色,inset shadow 不被 overflow-hidden 裁掉 */}
          <div
            className="absolute inset-0"
            style={{
              boxShadow:
                "inset 0 0 0 1.5px rgb(124, 92, 255), inset 0 0 0 2px rgba(0, 0, 0, 0.4)",
            }}
          />
          {/* 图层预览: object-contain 保证不被拉伸 */}
          {layerUrl && layerUrl !== baseUrl ? (
            <SafeImage
              src={layerUrl}
              alt=""
              className="block absolute inset-0 w-full h-full object-contain"
              loading="lazy"
              draggable={false}
            />
          ) : !isBase && !layerUrl ? null : null}
        </div>
      )}
      {/* 隐藏状态角标 */}
      {hidden && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <EyeOff className="w-3.5 h-3.5 text-white drop-shadow" />
        </div>
      )}
    </div>
  );
}
