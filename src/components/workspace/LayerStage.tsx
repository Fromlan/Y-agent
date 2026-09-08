import { useState, useEffect, useCallback, useRef } from "react";
import {
  ImageIcon,
  EyeOff,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import type { Asset, GeneratedImage } from "@/lib/types";
import { assetMainImage, imageInput } from "@/lib/types";
import SafeImage from "@/components/shared/SafeImage";
import { EditStage } from "./asset-detail-helpers";
import LayerCompositeStage from "@/components/workspace/LayerCompositeStage";

export type ViewMode = "composite" | "single";

/**
 * 所有图层都被隐藏时的占位图
 * - 从 AssetDetailDialog 抽到 LayerStage(commit 10 纯结构性切片)
 */
function AllHiddenPlaceholder() {
  return (
    <div
      className="w-full max-w-[640px] aspect-[16/10] bg-bg-elev rounded-md
        flex items-center justify-center text-text-muted border border-border"
    >
      <div className="text-center">
        <EyeOff className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p className="text-xs">所有图层都已隐藏</p>
      </div>
    </div>
  );
}

/**
 * 统一预览舞台
 * - 容器:max-w-[640px] 16:10
 * - 默认:object-contain 居中(适合 1K~2K 缩略图浏览)
 * - 缩放:滚轮 / 按钮(0.5x ~ 4x),双击重置
 * - 平移:放大后可拖动
 * - 从 AssetDetailDialog 抽到 LayerStage(commit 10 纯结构性切片)
 */
function PreviewStage({
  image,
  fallbackUrl,
}: {
  image: GeneratedImage | undefined;
  fallbackUrl: string | null;
}) {
  // P5:优先用 localPath(已下载到本地,URL 失效后仍可看)
  const url = image ? imageInput(image) : fallbackUrl;
  const [errored, setErrored] = useState(false);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  // 切换图片时重置
  useEffect(() => {
    setErrored(false);
    setScale(1);
    setTx(0);
    setTy(0);
  }, [url]);

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  const zoomBy = useCallback((delta: number) => {
    setScale((s) => Math.max(0.5, Math.min(4, s + delta)));
  }, []);

  // 滚轮缩放(按住 Ctrl 更直观;无 Ctrl 也允许)
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 0.2 : -0.2);
  };

  // 拖拽平移
  const onMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1.05) return; // 未放大不进入拖拽
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setTx(dragRef.current.tx + dx);
    setTy(dragRef.current.ty + dy);
  };
  const stopDrag = () => {
    dragRef.current = null;
  };

  if (!url || errored) {
    return (
      <div className="w-full max-w-[640px] aspect-[16/10] bg-bg-elev rounded-md
        flex items-center justify-center text-text-muted">
        <div className="text-center">
          <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-xs">图片加载失败</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[640px] aspect-[16/10] bg-bg-elev rounded-md
      overflow-hidden border border-border select-none">
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          cursor: scale > 1.05 ? (dragRef.current ? "grabbing" : "grab") : "zoom-in",
        }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onDoubleClick={reset}
        title="滚轮缩放 · 双击重置 · 拖拽平移"
      >
        <SafeImage
          src={url}
          alt={image?.name ?? ""}
          onError={() => setErrored(true)}
          draggable={false}
          className="max-w-full max-h-full object-contain"
          style={{
            imageRendering: scale > 2 ? "pixelated" : "auto",
            transform: `scale(${scale}) translate(${tx / scale}px, ${ty / scale}px)`,
            transition: dragRef.current ? "none" : "transform 0.15s",
          }}
        />
      </div>
      {/* 缩放控制条 */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-1 rounded
        bg-black/60 backdrop-blur-sm text-white text-xs">
        <button
          className="p-1 hover:bg-white/10 rounded"
          onClick={() => zoomBy(-0.25)}
          title="缩小"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
        <button
          className="p-1 hover:bg-white/10 rounded"
          onClick={() => zoomBy(0.25)}
          title="放大"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          className="p-1 hover:bg-white/10 rounded"
          onClick={reset}
          title="重置(双击图片也可)"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * LayerStage — AssetDetailDialog 的"主预览画布"三向 switch
 * (commit 10 抽自 AssetDetailDialog.tsx,纯结构性切片,不改行为)
 *
 * 渲染优先级:
 *  1. editMode + cur 有 url/localPath → EditStage(画框)
 *  2. !cur(全部图层被 hide) → AllHiddenPlaceholder
 *  3. 图层资产 + composite 视图 → LayerCompositeStage(合成 + bbox 描边)
 *  4. 普通图片资产 OR single 视图 → PreviewStage(单图 + 缩放/平移)
 */
export default function LayerStage({
  asset,
  viewMode,
  editMode,
  cur,
  visibleLayers,
  baseLayer,
  selectedLayer,
  onBboxChange,
}: {
  asset: Asset;
  viewMode: ViewMode;
  editMode: boolean;
  cur: GeneratedImage | undefined;
  visibleLayers: GeneratedImage[];
  baseLayer: GeneratedImage | undefined;
  selectedLayer: GeneratedImage | null;
  onBboxChange: (bbox: { x1: number; y1: number; x2: number; y2: number } | null) => void;
}) {
  if (editMode && cur && (cur.localPath || cur.url)) {
    return <EditStage imageUrl={imageInput(cur)} onBboxChange={onBboxChange} />;
  }
  if (!cur) {
    return <AllHiddenPlaceholder />;
  }
  if (asset.isLayerDecomposition && viewMode === "composite") {
    return (
      <LayerCompositeStage
        layers={visibleLayers}
        baseLayer={baseLayer}
        selectedLayer={selectedLayer}
      />
    );
  }
  return <PreviewStage image={cur} fallbackUrl={assetMainImage(asset)} />;
}
