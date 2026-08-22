import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ZoomIn, ZoomOut, Maximize2, ImageIcon, Layers, AlertTriangle } from "lucide-react";
import type { GeneratedImage } from "@/lib/types";
import { imageInput } from "@/lib/types";
import SafeImage from "@/components/shared/SafeImage";
import { parseBaseSize, layerRectNormalized, getBboxHealth } from "@/lib/layer-view";
import { resolveImageUrl } from "@/lib/image-resolver";

interface Props {
  /** 已 zIndex 升序、过滤掉隐藏 / 应用 solo 后的图层 */
  layers: GeneratedImage[];
  /** 底图层（zIndex=0），用于解析画布像素 */
  baseLayer: GeneratedImage | undefined;
  /** 右侧点击选中的图层；null 表示不画 bbox 描边 */
  selectedLayer: GeneratedImage | null;
}

/**
 * PS 风格的合成画布：把多个图层按 zIndex 叠放。
 * - 定位坐标系：**`boundingBox.normalized` (0-1000, aspect-independent)**
 *   —— 5.0 Pro 官方"任意尺寸重建"方案。优先用 normalized；缺失时
 *   `layerRectNormalized` 兜底铺满（老数据兼容）。
 * - 容器宽高比 = 底图自然像素比例（onLoad 校正；缺失时回退 1:1）
 * - 缩放 / 平移 / 滚轮 / 双击重置：复用 PreviewStage 的状态机
 * - 透明感：底图之上叠一个细密棋盘背景 div
 * - 单图层加载失败时该层渲染占位块（其它层不受影响）
 */
export default function LayerCompositeStage({
  layers,
  baseLayer,
  selectedLayer,
}: Props) {
  // 容器 aspect 优先用 API 返回的 size；图片加载完后用真实 natural size 校正（API 有时 size 字段不准）
  const [base, setBase] = useState(() => parseBaseSize(baseLayer));
  // 用 ref 跟踪当前 base，供 onLoad / preload 等异步回调读最新值
  const baseRef = useRef(base);
  useEffect(() => { baseRef.current = base; }, [base]);
  const aspectW = base.w;
  const aspectH = base.h;
  // 详情弹窗里同时限制宽度和高度：高度按 70vh 反推最大宽度，避免竖图把预览撑得过高。
  const maxPreviewWidth = `min(640px, calc(70vh * ${(aspectW / aspectH).toFixed(4)}))`;

  // 切换资产 / 图层集合时重置
  useEffect(() => {
    setBase(parseBaseSize(baseLayer));
  }, [baseLayer]);

  // 关键：preload 独立 Image 检测 base 自然尺寸
  // 原因：onLoad 闭包 + SafeImage 异步解析（localPath → data URL）时序不稳
  // 这里用 `new Image()` 直接加载并读 naturalWidth/Height，跟渲染完全解耦
  useEffect(() => {
    if (!baseLayer) return;
    const src = imageInput(baseLayer);
    if (!src) return;
    let cancelled = false;

    const detect = async () => {
      let url = src;
      // localPath 需要先 resolve 成 data URL
      if (!url.startsWith("http") && !url.startsWith("data:") && !url.startsWith("blob:")) {
        try {
          const resolved = await resolveImageUrl(url);
          if (cancelled || !resolved) return;
          url = resolved;
        } catch {
          return; // 解析失败就用 parseBaseSize 兜底
        }
      }
      if (cancelled) return;

      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const cur = baseRef.current;
        if (w > 0 && h > 0 && (w !== cur.w || h !== cur.h)) {
          setBase({ w, h });
        }
      };
      img.onerror = () => { /* ignore */ };
      img.src = url;
    };

    detect();
    return () => { cancelled = true; };
  }, [baseLayer]);

  // 缩放 / 平移状态机（和 PreviewStage 保持一致）
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [erroredLayers, setErroredLayers] = useState<Set<number>>(new Set());

  // 切换资产 / 图层集合时重置（base 在 onLoad 时还会被更新，所以也监听 layers.length）
  useEffect(() => {
    setScale(1);
    setTx(0);
    setTy(0);
    setErroredLayers(new Set());
  }, [layers.length]);

  // P0+：bbox 健康度。缺 bbox 的图层不再"铺满画布"（会跟其它图层重叠），
  // 改为渲染一个虚线占位块 + 顶部 banner 提示。
  // 父组件 AssetDetailDialog 也会读这个值做整体降级判断（所有图层都缺 → 自动切单图层）。
  const bboxHealth = useMemo(() => getBboxHealth(layers), [layers]);
  const missingSet = useMemo(
    () => new Set(bboxHealth.missing),
    [bboxHealth.missing]
  );

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  const zoomBy = useCallback((delta: number) => {
    setScale((s) => Math.max(0.5, Math.min(4, s + delta)));
  }, []);

  // 滚轮缩放
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 0.2 : -0.2);
  };

  // 拖拽平移
  const onMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1.05) return;
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

  const onImgError = (i: number) => {
    setErroredLayers((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  };

  if (layers.length === 0) {
    return (
      <div
        className="w-full max-w-[640px] aspect-square bg-bg-elev rounded-md
          flex items-center justify-center text-text-muted border border-border"
      >
        <div className="text-center">
          <Layers className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-xs">所有图层都已隐藏</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full max-w-[640px] bg-bg-elev rounded-md
        overflow-hidden border border-border select-none"
      style={{ aspectRatio: `${aspectW} / ${aspectH}`, maxWidth: maxPreviewWidth }}
    >
      {/* 透明棋盘背景：8px 网格，深浅交替，让 alpha 通道一眼可见 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%), linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 8px 8px",
        }}
      />

      {/* P0+：bbox 缺失警告 banner。有图层缺位置信息时显示，让用户立刻看到问题。 */}
      {bboxHealth.missing.length > 0 && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1
            rounded bg-amber-500/95 text-white text-[10px] flex items-center gap-1
            shadow-md pointer-events-none"
          title="这些图层的 boundingBox 数据缺失（API 没返或解析失败），按 PS 定位不可用"
        >
          <AlertTriangle className="w-3 h-3" />
          {bboxHealth.missing.length} 个图层位置信息缺失
        </div>
      )}

      {/* 缩放 + 平移容器 */}
      <div
        className="absolute inset-0"
        style={{
          transform: `scale(${scale}) translate(${tx / scale}px, ${ty / scale}px)`,
          transition: dragRef.current ? "none" : "transform 0.15s",
          transformOrigin: "center center",
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
        {/* 图层堆叠（按数组顺序，zIndex 升序 → 后渲染的在上层） */}
        {layers.map((img, i) => {
          // 用 normalized 0-1 浮点定位（aspect-independent；5.0 Pro 官方推荐）
          const n = layerRectNormalized(img);
          const errored = erroredLayers.has(i);
          const isBase = (img.zIndex ?? 0) === 0;
          // P0+：bbox 缺失时不渲染图。layerRectNormalized 在缺 bbox 时会回退铺满
          // [0, 0, 1, 1]，那样会和底图/其它图层 100% 重叠，视觉上"全部叠在一起"。
          // 改成虚线占位 + 标注"缺位置"，让用户知道问题出在数据上。
          // 底图层（zIndex=0）即使缺 bbox 也保留底图本身（位置就是全画布）。
          const bboxMissing = missingSet.has(i) && !isBase;
          return (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${n.left * 100}%`,
                top: `${n.top * 100}%`,
                width: `${n.width * 100}%`,
                height: `${n.height * 100}%`,
              }}
              title={bboxMissing ? `${img.name ?? `图层 ${i + 1}`}（缺位置信息）` : img.name}
            >
              {errored ? (
                <div className="w-full h-full flex items-center justify-center bg-bg-base/60 text-text-muted">
                  <ImageIcon className="w-6 h-6 opacity-50" />
                </div>
              ) : bboxMissing ? (
                <div className="w-full h-full border-2 border-dashed border-warning/70
                  bg-warning/10 flex flex-col items-center justify-center
                  text-[9px] text-warning gap-0.5 select-none">
                  <AlertTriangle className="w-3 h-3" />
                  <span>缺位置</span>
                </div>
              ) : (
                <SafeImage
                  src={imageInput(img)}
                  alt={img.name ?? ""}
                  onError={() => onImgError(i)}
                  onLoad={(e) => {
                    // 底图层加载完后用真实 natural size 校正容器 aspect
                    // （API 的 size 字段偶尔不准，比如 portrait 图却返回 "2048x2048"）
                    if (isBase) {
                      const t = e.currentTarget;
                      const w = t.naturalWidth;
                      const h = t.naturalHeight;
                      const cur = baseRef.current;
                      if (w > 0 && h > 0 && (w !== cur.w || h !== cur.h)) {
                        setBase({ w, h });
                      }
                    }
                  }}
                  draggable={false}
                  // 关键: 加 block —— <img> 默认 inline-block 会有"天然宽高"行为,
                  // 当图层 PNG 天然尺寸(如 bag 714x736)远大于 bbox(如 13%×8.9% ≈ 80×55)
                  // 时, 部分浏览器会让图片按天然尺寸渲染,溢出 bbox 被外层 overflow-hidden
                  // 裁掉,视觉上"图层被放大到撑满"。加 block 让 w-full/h-full 真正生效,
                  // objectFit: contain 才会按 bbox 缩放。
                  className="block w-full h-full"
                  style={{
                    imageRendering: scale > 2 ? "pixelated" : "auto",
                    // 关键：图层 image 的原始尺寸 = 底图尺寸（如 1024x1536），
                    // 但 bbox 区域可能与底图 aspect 不同（如 0.56x0.63）。
                    // 用 contain 让图层按自身比例缩放 + 居中，剩余区域（PNG 自带 alpha）
                    // 透出下一层 / 棋盘；用 fill 会被强行拉伸，导致"压扁"。
                    objectFit: "contain",
                  }}
                />
              )}
            </div>
          );
        })}

        {/* 选中图层 bbox 描边（绝对定位的 div 叠在最上层） */}
        {selectedLayer && (() => {
          const n = layerRectNormalized(selectedLayer);
          return (
            <div
              className="absolute border-2 border-accent pointer-events-none"
              style={{
                left: `${n.left * 100}%`,
                top: `${n.top * 100}%`,
                width: `${n.width * 100}%`,
                height: `${n.height * 100}%`,
                boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
              }}
            >
              {selectedLayer.name && (
                <span className="absolute -top-6 left-0 bg-accent text-text-inverse text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
                  {selectedLayer.name}
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* 缩放控制条 */}
      <div
        className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-1 rounded
          bg-black/60 backdrop-blur-sm text-white text-xs z-10"
      >
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
          title="重置（双击图片也可）"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 图层数 / zIndex 信息（左下角小字） */}
      <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm
        text-white text-[10px] flex items-center gap-1 z-10">
        <Layers className="w-3 h-3" />
        <span>合成 · {layers.length} 层</span>
      </div>
    </div>
  );
}
