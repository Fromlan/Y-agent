import { useState } from "react";
import {
  Layers,
  Copy,
  Download,
  Trash2,
  Check,
  ImageIcon,
  Droplet,
  HardDrive,
  AlertTriangle,
  Loader2,
  Video as VideoIcon,
} from "lucide-react";
import type { Asset } from "@/lib/types";
import { assetMainImage, assetVideoSource, flatAssetImages, imageInput } from "@/lib/types";
import { resolveImageUrlSync } from "@/lib/image-resolver";
import { useToast } from "@/components/shared/Toast";
import SafeImage from "@/components/shared/SafeImage";
import { layerRectNormalized, isNormalizedBboxValid } from "@/lib/layer-view";

export type ViewMode = "masonry" | "grid" | "compact";

/**
 * 图层拆分资产的合成缩略图。
 * - 底图作为背景铺满
 * - 每个有合法 bbox 的非底图层按 normalized 位置叠放，object-contain 保持比例
 * - 缺 bbox 的图层无法定位，暂时不渲染
 * 通过 className 控制尺寸：主卡用 absolute inset-0 铺满，mini 用 w-12 h-12。
 */
function LayerCompositeThumb({
  asset,
  className = "",
}: {
  asset: Asset;
  className?: string;
}) {
  const layers = flatAssetImages(asset);
  if (layers.length === 0) return null;
  const baseLayer =
    layers.find((l) => (l.zIndex ?? 0) === 0) ?? layers[0];
  if (!baseLayer) return null;
  const nonBaseLayers = layers.filter((l) => (l.zIndex ?? 0) !== 0);

  return (
    <div className={`relative overflow-hidden bg-bg-base ${className}`}>
      {/* 透明棋盘背景：底图若有 alpha 也能看出来 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.06) 75%), linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.06) 75%)",
          backgroundSize: "8px 8px",
          backgroundPosition: "0 0, 4px 4px",
        }}
      />
      {/* 底图 */}
      {imageInput(baseLayer) && (
        <SafeImage
          src={imageInput(baseLayer)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      )}
      {/* 非底图层按 bbox 合成 */}
      {nonBaseLayers.map((layer, i) => {
        if (!isNormalizedBboxValid(layer.boundingBox?.normalized)) return null;
        const n = layerRectNormalized(layer);
        return (
          <div
            key={i}
            className="absolute pointer-events-none"
            style={{
              left: `${n.left * 100}%`,
              top: `${n.top * 100}%`,
              width: `${n.width * 100}%`,
              height: `${n.height * 100}%`,
            }}
          >
            <SafeImage
              src={imageInput(layer)}
              alt=""
              className="block w-full h-full object-contain"
              loading="lazy"
              draggable={false}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * 图层拆分资产的 mini 合成缩略图（48x48）。
 * 在 LayerCompositeThumb 基础上叠加图层数 / 缺位置信息角标。
 */
function LayerThumbnailMini({ asset }: { asset: Asset }) {
  const layers = flatAssetImages(asset);
  if (layers.length === 0) return null;
  const nonBaseLayers = layers.filter((l) => (l.zIndex ?? 0) !== 0);
  const hasMissingBbox = nonBaseLayers.some(
    (l) => !isNormalizedBboxValid(l.boundingBox?.normalized)
  );

  return (
    <div
      className="relative w-12 h-12 rounded overflow-hidden border border-accent/40
        bg-bg-base shadow-sm pointer-events-none"
      title={`图层资产 · ${layers.length} 层${
        hasMissingBbox ? "（部分图层缺位置信息）" : ""
      }`}
    >
      <LayerCompositeThumb asset={asset} className="absolute inset-0" />
      {/* 角标：图层数 + bbox 状态（左下） */}
      <div
        className="absolute bottom-0 left-0 px-1 py-0.5
          bg-black/75 text-accent text-[9px] flex items-center gap-0.5"
      >
        <Layers className="w-2.5 h-2.5" />
        <span>{layers.length}</span>
        {hasMissingBbox && (
          <AlertTriangle className="w-2.5 h-2.5 text-amber-400 ml-0.5" />
        )}
      </div>
    </div>
  );
}

/**
 * 资产本地兜底状态徽标。
 * - 「备份中…」:主图有 http(s) url 但 localPath 还没就位——后端还在拉
 * - 「图已过期」:后端标 payload.broken=true(URL 失效 / 下载失败)
 * - 「本地」:已有 localPath 且文件存在(已经在用 asset:// 协议加载)
 *
 * 三种状态互斥,优先级 broken > 备份中 > 本地
 */
function StatusBadge({ asset }: { asset: Asset }) {
  // 图层资产：检查底图层（zIndex=0）的本地化状态（flatAssetImages 会把
  // layerLocalPaths 合并到 layer.localPath，所以这里统一用它取）
  // 普通资产：检查 urls[0] / localPaths[0]
  const isLayer = asset.isLayerDecomposition && asset.payload.layers?.length;
  const layers = isLayer ? flatAssetImages(asset) : [];
  const baseLayer = isLayer
    ? layers.find((l) => (l.zIndex ?? 0) === 0) ?? layers[0]
    : null;
  const hasLocal = isLayer
    ? !!baseLayer?.localPath
    : !!asset.payload.localPaths?.[0];
  const firstUrl = isLayer ? baseLayer?.url ?? "" : asset.payload.urls?.[0] ?? "";
  const isHttp = firstUrl.startsWith("http://") || firstUrl.startsWith("https://");
  if (asset.payload.broken) {
    return (
      <div
        className="absolute top-2 right-2 bg-red-500/85 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
        title="图链接已失效,建议重新生成"
      >
        <AlertTriangle className="w-3 h-3" /> 图已过期
      </div>
    );
  }
  // P1：风格契约漂移（styleContractId 变了 → 此资产与现契约不一致）
  if (asset.payload.status === "stale") {
    return (
      <div
        className="absolute top-2 right-2 bg-orange-500/85 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
        title="项目风格契约已变更,此资产与现契约不一致,建议重生成"
      >
        <AlertTriangle className="w-3 h-3" /> 风格漂移
      </div>
    );
  }
  if (!hasLocal && isHttp) {
    return (
      <div
        className="absolute top-2 right-2 bg-amber-500/85 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
        title="正在下载到本地"
      >
        <Loader2 className="w-3 h-3 animate-spin" /> 备份中
      </div>
    );
  }
  return null;
}

interface Props {
  asset: Asset;
  view: ViewMode;
  selected: boolean;
  selectMode: boolean;
  onToggleSelect: (id: string) => void;
  onOpenPreview: (asset: Asset) => void;
  onCopyPrompt: (text: string) => void;
  onDownload: (url: string, filename: string) => void;
  onDelete: (id: string) => void;
}

/**
 * 资产看板里的单张卡片
 * - 三种 view：masonry（自然比例，瀑布流用）/ grid（等高正方形）/ compact（小图紧凑）
 * - 单击非选择模式下打开大图预览；选择模式下切换选中
 * - hover 浮层显示 prompt 预览和操作
 */
export default function AssetCard({
  asset,
  view,
  selected,
  selectMode,
  onToggleSelect,
  onOpenPreview,
  onCopyPrompt,
  onDownload,
  onDelete,
}: Props) {
  const toast = useToast();
  const main = assetMainImage(asset);
  const isVideo = asset.payload?.kind === "video";
  const videoSrc = isVideo ? resolveImageUrlSync(assetVideoSource(asset)) : "";
  const [hover, setHover] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const onClick = () => {
    if (selectMode) {
      onToggleSelect(asset.id);
      return;
    }
    if (main) onOpenPreview(asset);
  };

  const onDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDel) {
      setConfirmDel(true);
      setTimeout(() => setConfirmDel(false), 2500);
      toast.warn("再点一次确认删除");
      return;
    }
    onDelete(asset.id);
  };

  const onCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopyPrompt(asset.prompt);
  };

  const onDl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (main) onDownload(main, `y-agent-${asset.id}.png`);
  };

  // compact 模式：极简小卡片，hover 才显示 prompt
  if (view === "compact") {
    return (
      <div
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`relative cursor-pointer break-inside-avoid group ${
          selected ? "ring-2 ring-accent" : ""
        }`}
        title={asset.prompt}
      >
        <div className="relative aspect-square bg-bg-elev rounded overflow-hidden border border-border">
          {isVideo ? (
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
          )}
        </div>
        {hover && (
          <div className="absolute inset-0 bg-black/80 rounded p-1.5 flex flex-col justify-end text-[10px] text-white">
            <p className="line-clamp-3 leading-tight">{asset.prompt}</p>
          </div>
        )}
        {asset.isLayerDecomposition && (
          <Layers className="absolute top-1 right-1 w-3 h-3 text-accent drop-shadow" />
        )}
        <StatusBadge asset={asset} />
        {selectMode && (
          <CheckBox selected={selected} className="top-1 left-1" />
        )}
      </div>
    );
  }

  // grid 模式：等高正方形 + 下方信息条
  if (view === "grid") {
    return (
      <div
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`panel overflow-hidden cursor-pointer transition-all
          ${selected ? "ring-2 ring-accent border-accent" : "hover:border-border-strong"}
        `}
      >
        <div className="relative aspect-square bg-bg-elev overflow-hidden">
          {isVideo ? (
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
          )}
          {isVideo && (
            <div className="absolute top-2 left-2 bg-black/75 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
              <VideoIcon className="w-3 h-3" /> 视频
            </div>
          )}
          {asset.isLayerDecomposition && (
            <div className="absolute top-2 right-2 bg-black/70 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
              <Layers className="w-3 h-3" /> 图层
            </div>
          )}
          <StatusBadge asset={asset} />
          {asset.payload.transparent && (
            <div className="absolute top-2 left-2 bg-emerald-500/85 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
              title="PNG 透明背景">
              <Droplet className="w-3 h-3" /> 透明
            </div>
          )}
          {asset.isLayerDecomposition ? (
            <div className="absolute bottom-2 right-2">
              <LayerThumbnailMini asset={asset} />
            </div>
          ) : (
            asset.payload.localPaths?.[0] && !asset.payload.broken && (
              <div className="absolute bottom-2 right-2 bg-blue-500/85 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
                title="已下载到本地,URL 失效后仍可查看">
                <HardDrive className="w-3 h-3" /> 本地
              </div>
            )
          )}
          {asset.refCount > 0 && (
            <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
              参考 ×{asset.refCount}
            </div>
          )}
          {selectMode && <CheckBox selected={selected} />}
          {hover && !selectMode && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex flex-col justify-end p-2 gap-1.5">
              <p className="text-[11px] text-white line-clamp-3 leading-snug">
                {asset.prompt}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={onCopy}
                  className="p-1 bg-black/60 hover:bg-black/80 text-white rounded"
                  title="复制 prompt"
                >
                  <Copy className="w-3 h-3" />
                </button>
                {main && (
                  <button
                    onClick={onDl}
                    className="p-1 bg-black/60 hover:bg-black/80 text-white rounded"
                    title="下载主图"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={onDeleteClick}
                  className={`p-1 rounded text-white ${
                    confirmDel
                      ? "bg-red-500/80"
                      : "bg-black/60 hover:bg-red-500/80"
                  }`}
                  title="删除"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="p-2 flex items-center justify-between text-[10px] text-text-muted">
          <span className="truncate">{asset.modelName}</span>
          <span className="whitespace-nowrap tabular-nums">
            {formatTime(asset.createdAt)} · {(asset.costMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>
    );
  }

  // masonry 模式：固定高度 cover，所有卡片统一高度（图再高也不会拉长整行）
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative panel overflow-hidden cursor-pointer transition-all
        ${selected ? "ring-2 ring-accent border-accent" : "hover:border-border-strong"}
      `}
    >
      <div className="relative h-48 bg-bg-elev overflow-hidden">
        {isVideo ? (
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
        )}
        {isVideo && (
          <div className="absolute top-2 left-2 bg-black/75 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
            <VideoIcon className="w-3 h-3" /> 视频
          </div>
        )}
        {asset.isLayerDecomposition && (
          <div className="absolute top-2 right-2 bg-black/70 text-accent text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
            <Layers className="w-3 h-3" /> 图层
          </div>
        )}
        <StatusBadge asset={asset} />
        {asset.payload.transparent && (
          <div className="absolute top-2 left-2 bg-emerald-500/85 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
            title="PNG 透明背景">
            <Droplet className="w-3 h-3" /> 透明
          </div>
        )}
        {asset.isLayerDecomposition ? (
          <div className="absolute bottom-2 right-2">
            <LayerThumbnailMini asset={asset} />
          </div>
        ) : (
          asset.payload.localPaths?.[0] && !asset.payload.broken && (
            <div className="absolute bottom-2 right-2 bg-blue-500/85 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
              title="已下载到本地,URL 失效后仍可查看">
              <HardDrive className="w-3 h-3" /> 本地
            </div>
          )
        )}
        {asset.refCount > 0 && (
          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
            参考 ×{asset.refCount}
          </div>
        )}
        {selectMode && <CheckBox selected={selected} />}
        {hover && !selectMode && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-2.5 gap-2">
            <p className="text-[12px] text-white line-clamp-4 leading-snug">
              {asset.prompt}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={onCopy}
                className="p-1 bg-black/60 hover:bg-black/80 text-white rounded"
                title="复制 prompt"
              >
                <Copy className="w-3 h-3" />
              </button>
              {main && (
                <button
                  onClick={onDl}
                  className="p-1 bg-black/60 hover:bg-black/80 text-white rounded"
                  title="下载主图"
                >
                  <Download className="w-3 h-3" />
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={onDeleteClick}
                className={`p-1 rounded text-white ${
                  confirmDel ? "bg-red-500/80" : "bg-black/60 hover:bg-red-500/80"
                }`}
                title="删除"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
      {/* 底部信息条：模型 + 耗时（不 hover 也可见） */}
      <div className="p-2 flex items-center justify-between text-[10px] text-text-muted">
        <span className="truncate">{asset.modelName}</span>
        <span className="whitespace-nowrap tabular-nums">
          {formatTime(asset.createdAt)} · {(asset.costMs / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  );
}

function CheckBox({
  selected,
  className = "top-2 left-2",
}: {
  selected: boolean;
  className?: string;
}) {
  return (
    <div
      className={`absolute ${className} w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
        ${selected ? "bg-accent border-accent" : "bg-black/60 border-white/70 hover:border-white"}
      `}
    >
      {selected && <Check className="w-3 h-3 text-white" />}
    </div>
  );
}

function formatTime(t: number): string {
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return new Date(t).toLocaleDateString("zh-CN");
}
