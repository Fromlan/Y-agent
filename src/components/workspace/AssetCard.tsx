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
} from "lucide-react";
import type { Asset } from "@/lib/types";
import { assetMainImage, imageInput } from "@/lib/types";
import { useToast } from "@/components/shared/Toast";
import SafeImage from "@/components/shared/SafeImage";
import { layerRectNormalized } from "@/lib/layer-view";

export type ViewMode = "masonry" | "grid" | "compact";

/**
 * 图层拆分资产的 mini 合成缩略图。
 * - 56x56 像素
 * - 底图作背景 + 每个图层按 bbox 比例定位
 * - 仅当图层资产 + 至少有 1 个图层有 bbox 时才显示
 * - lazy 加载：仅资产卡可见时渲染图层图
 */
function LayerThumbnailMini({ asset }: { asset: Asset }) {
  const layers = asset.payload.layers ?? [];
  if (layers.length === 0) return null;
  const baseLayer =
    layers.find((l) => (l.zIndex ?? 0) === 0) ?? layers[0];
  const baseUrl = baseLayer.localPath ?? baseLayer.url;
  // 取前 3 个有 bbox 的图层（太多在小图里挤成一片反而看不清）
  const displayLayers = layers
    .filter((l) => (l.zIndex ?? 0) !== 0)
    .filter((l) => l.boundingBox?.normalized?.length === 4)
    .slice(0, 3);

  return (
    <div
      className="relative w-14 h-14 rounded overflow-hidden border border-accent/40
        bg-bg-base shadow-sm pointer-events-none"
      title={`图层资产 · ${layers.length} 层${
        displayLayers.length < layers.length - 1 ? "（缩略仅显示前 3 层）" : ""
      }`}
    >
      {/* 底图缩略图 */}
      {baseUrl ? (
        <SafeImage
          src={imageInput(baseLayer)}
          alt=""
          className="block absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-bg-elev" />
      )}
      {/* 其它图层 bbox 色块（半透明 + 边框，bbox 一眼可见） */}
      {displayLayers.map((layer, i) => {
        const n = layerRectNormalized(layer);
        const colors = [
          "border-rose-400/80 bg-rose-400/25",
          "border-amber-400/80 bg-amber-400/25",
          "border-emerald-400/80 bg-emerald-400/25",
        ];
        return (
          <div
            key={i}
            className={`absolute border ${colors[i % colors.length]}`}
            style={{
              left: `${n.left * 100}%`,
              top: `${n.top * 100}%`,
              width: `${n.width * 100}%`,
              height: `${n.height * 100}%`,
            }}
          />
        );
      })}
      {/* 角标：图层数 + bbox 状态（缺 bbox 时显示警告） */}
      <div
        className="absolute bottom-0 right-0 px-1 py-0.5
          bg-black/75 text-accent text-[9px] flex items-center gap-0.5"
      >
        <Layers className="w-2.5 h-2.5" />
        <span>{layers.length}</span>
        {displayLayers.length === 0 && (
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
  // 图层资产：检查底图层（zIndex=0）的本地化状态
  // 普通资产：检查 urls[0] / localPaths[0]
  const isLayer = asset.isLayerDecomposition && asset.payload.layers?.length;
  const baseLayer = isLayer
    ? [...(asset.payload.layers ?? [])].find((l) => (l.zIndex ?? 0) === 0) ??
      asset.payload.layers?.[0]
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
        <div className="aspect-square bg-bg-elev rounded overflow-hidden border border-border">
          {main ? (
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
          {main ? (
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
          <span>{formatTime(asset.createdAt)}</span>
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
        {main ? (
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
            <div className="flex items-center justify-between text-[10px] text-white/70">
              <span className="truncate">{asset.modelName}</span>
              <span className="ml-2 whitespace-nowrap">
                {asset.size} · {asset.costMs}ms
              </span>
            </div>
          </div>
        )}
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
