import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Copy,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Layers,
  ImageIcon,
  Clock,
  Hash,
  Ruler,
  Cpu,
  CalendarClock,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import type { Asset, GeneratedImage } from "@/lib/types";
import { assetMainImage, flatAssetImages } from "@/lib/types";
import { useToast } from "@/components/shared/Toast";

interface Props {
  asset: Asset;
  onClose: () => void;
  onCopyPrompt: (text: string) => void;
  onDownload: (url: string, filename: string) => void;
  onDelete: (id: string) => void;
}

/**
 * 资产详情/信息展示窗口
 * - 左侧：统一尺寸的大图预览（contain 模式，固定 16:10 画布，所有图统一尺寸）
 * - 右侧：完整元数据（prompt、模型、尺寸、耗时、参考图、图层、Asset ID、创建时间）
 * - 底部：操作栏（上一张/下一张、复制 prompt、下载、删除）
 * - 多图/图层拆分：左右切换 + 缩略图条
 */
export default function AssetDetailDialog({
  asset,
  onClose,
  onCopyPrompt,
  onDownload,
  onDelete,
}: Props) {
  const images = flatAssetImages(asset);
  const [idx, setIdx] = useState(0);
  const cur = images[idx];
  const toast = useToast();
  const [confirmDel, setConfirmDel] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  // 切换资产/打开时归零
  useEffect(() => {
    setIdx(0);
    setConfirmDel(false);
    setPromptCopied(false);
  }, [asset.id]);

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && images.length > 1) {
        setIdx((i) => (i - 1 + images.length) % images.length);
      } else if (e.key === "ArrowRight" && images.length > 1) {
        setIdx((i) => (i + 1) % images.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  const onCopy = () => {
    // 父组件 onCopyPrompt 已统一处理 clipboard + toast，这里只维护按钮状态。
    onCopyPrompt(asset.prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 1500);
  };

  const onDownloadCur = () => {
    if (!cur?.url) return;
    const ext = cur.url.startsWith("data:") ? "png" : "png";
    onDownload(cur.url, `y-agent-${asset.id}-${idx + 1}.${ext}`);
  };

  const onDownloadAll = async () => {
    toast.info(`开始下载 ${images.length} 张图…`);
    // 分批触发，避免浏览器把连续下载当广告拦截。
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (img.url) onDownload(img.url, `y-agent-${asset.id}-${i + 1}.png`);
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  const onDeleteClick = () => {
    if (!confirmDel) {
      setConfirmDel(true);
      toast.warn("再点一次确认删除");
      setTimeout(() => setConfirmDel(false), 2500);
      return;
    }
    onDelete(asset.id);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="bg-bg-panel border border-border rounded-xl shadow-2xl
          w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部栏 */}
        <div className="h-11 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 text-text-secondary text-xs">
            <span className="px-1.5 py-0.5 rounded bg-bg-elev text-text-muted">
              资产详情
            </span>
            {asset.isLayerDecomposition && (
              <span className="px-1.5 py-0.5 rounded bg-accent/20 text-accent flex items-center gap-1">
                <Layers className="w-3 h-3" /> 图层拆分
              </span>
            )}
            {images.length > 1 && (
              <span className="text-text-muted">
                {idx + 1} / {images.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            title="关闭（Esc）"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体：左预览 + 右元数据 */}
        <div className="flex-1 flex min-h-0">
          {/* 左侧：统一尺寸预览区 */}
          <div className="flex-1 min-w-0 bg-bg-base flex flex-col">
            <div className="flex-1 flex items-center justify-center p-4 min-h-0">
              <PreviewStage
                image={cur}
                fallbackUrl={assetMainImage(asset)}
              />
            </div>
            {/* 多图切换控件 */}
            {images.length > 1 && (
              <div className="flex items-center justify-center gap-2 p-2 border-t border-border bg-bg-panel flex-shrink-0">
                <button
                  onClick={() =>
                    setIdx((i) => (i - 1 + images.length) % images.length)
                  }
                  className="btn-icon"
                  title="上一张（←）"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1 overflow-x-auto max-w-[60%]">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setIdx(i)}
                      className={`flex-shrink-0 w-10 h-10 rounded overflow-hidden border-2 transition-colors
                        ${i === idx ? "border-accent" : "border-border hover:border-border-strong"}
                      `}
                      title={img.name ?? `图 ${i + 1}`}
                    >
                      {img.url ? (
                        <img
                          src={img.url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-bg-elev" />
                      )}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setIdx((i) => (i + 1) % images.length)}
                  className="btn-icon"
                  title="下一张（→）"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* 右侧：元数据面板 */}
          <aside className="w-80 lg:w-96 flex-shrink-0 border-l border-border bg-bg-panel flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* 当前图名（如果图层有 name） */}
              {cur?.name && (
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span className="truncate">{cur.name}</span>
                </div>
              )}

              {/* Prompt（重点展示） */}
              <section>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[10px] text-text-muted uppercase tracking-wider">
                    Prompt
                  </h3>
                  <button
                    onClick={onCopy}
                    className="text-[10px] text-accent hover:underline flex items-center gap-1"
                    title="复制 prompt"
                  >
                    {promptCopied ? (
                      <>
                        <Check className="w-3 h-3" /> 已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> 复制
                      </>
                    )}
                  </button>
                </div>
                <p
                  className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap
                    bg-bg-elev border border-border rounded-md p-3 max-h-60 overflow-y-auto"
                >
                  {asset.prompt}
                </p>
              </section>

              {/* 关键参数（紧凑网格） */}
              <section>
                <h3 className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
                  生成参数
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <MetaItem
                    icon={Cpu}
                    label="模型"
                    value={asset.modelName}
                    copyable={asset.model}
                  />
                  <MetaItem icon={Ruler} label="尺寸" value={asset.size} />
                  <MetaItem
                    icon={Clock}
                    label="耗时"
                    value={`${(asset.costMs / 1000).toFixed(2)} s`}
                  />
                  <MetaItem
                    icon={ImageIcon}
                    label="参考图"
                    value={`${asset.refCount} 张`}
                  />
                  <MetaItem
                    icon={Layers}
                    label="类型"
                    value={asset.isLayerDecomposition ? "图层拆分" : "普通生图"}
                  />
                  <MetaItem
                    icon={Hash}
                    label="图片数"
                    value={`${asset.payload.urls?.length || asset.payload.layers?.length || 1} 张`}
                  />
                </div>
              </section>

              {/* 时间信息 */}
              <section>
                <h3 className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
                  时间
                </h3>
                <div className="space-y-1.5 text-xs text-text-secondary">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-3.5 h-3.5 text-text-muted" />
                    <span>创建：{formatDateTime(asset.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-text-muted" />
                    <span>相对：{formatRelative(asset.createdAt)}</span>
                  </div>
                </div>
              </section>

              {/* 技术信息（折叠式小字） */}
              <details className="text-xs">
                <summary className="text-text-muted cursor-pointer hover:text-text-secondary select-none">
                  技术信息
                </summary>
                <div className="mt-2 space-y-1 font-mono text-[10px] text-text-muted break-all">
                  <div>Asset ID: {asset.id}</div>
                  <div>Project ID: {asset.projectId}</div>
                  <div>Model ID: {asset.model}</div>
                </div>
              </details>
            </div>

            {/* 底部操作栏 */}
            <div className="p-3 border-t border-border flex items-center gap-2 flex-shrink-0">
              <button onClick={onCopy} className="btn text-xs h-8 flex-1">
                <Copy className="w-3.5 h-3.5" /> 复制
              </button>
              <button
                onClick={onDownloadCur}
                className="btn text-xs h-8 flex-1"
                disabled={!cur?.url}
              >
                <Download className="w-3.5 h-3.5" /> 下载
              </button>
              {images.length > 1 && (
                <button onClick={onDownloadAll} className="btn text-xs h-8 flex-1">
                  <Download className="w-3.5 h-3.5" /> 全部
                </button>
              )}
              <button
                onClick={onDeleteClick}
                className={`btn text-xs h-8 ${
                  confirmDel
                    ? "!bg-red-500/80 !text-white !border-red-500/80"
                    : "hover:!text-red-400"
                }`}
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/**
 * 统一预览舞台
 * - 容器：max-w-[640px] 16:10
 * - 默认：object-contain 居中（适合 1K~2K 缩略图浏览）
 * - 缩放：滚轮 / 按钮（0.5x ~ 4x），双击重置
 * - 平移：放大后可拖动
 */
function PreviewStage({
  image,
  fallbackUrl,
}: {
  image: GeneratedImage | undefined;
  fallbackUrl: string | null;
}) {
  const url = image?.url ?? fallbackUrl;
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

  // 滚轮缩放（按住 Ctrl 更直观；无 Ctrl 也允许）
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
        <img
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
          title="重置（双击图片也可）"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function MetaItem({
  icon: Icon,
  label,
  value,
  copyable,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  copyable?: string;
}) {
  const toast = useToast();
  return (
    <div className="bg-bg-elev border border-border rounded-md p-2">
      <div className="flex items-center gap-1 text-[10px] text-text-muted mb-0.5">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
      <div
        className={`text-text-primary truncate ${copyable ? "cursor-pointer hover:text-accent" : ""}`}
        title={copyable ?? value}
        onClick={() => {
          if (!copyable) return;
          navigator.clipboard.writeText(copyable).then(
            () => toast.success(`已复制 ${label}`),
            () => toast.error("复制失败")
          );
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatDateTime(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatRelative(t: number): string {
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(t).toLocaleDateString("zh-CN");
}
