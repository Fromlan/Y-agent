import { useState } from "react";
import {
  Layers,
  Copy,
  Download,
  Trash2,
  Check,
  ImageIcon,
  Droplet,
} from "lucide-react";
import type { Asset } from "@/lib/types";
import { assetMainImage } from "@/lib/types";
import { useToast } from "@/components/shared/Toast";

export type ViewMode = "masonry" | "grid" | "compact";

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
            <img
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
            <img
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
          {asset.payload.transparent && (
            <div className="absolute top-2 left-2 bg-emerald-500/85 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
              title="PNG 透明背景">
              <Droplet className="w-3 h-3" /> 透明
            </div>
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
          <img
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
        {asset.payload.transparent && (
          <div className="absolute top-2 left-2 bg-emerald-500/85 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
            title="PNG 透明背景">
            <Droplet className="w-3 h-3" /> 透明
          </div>
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
