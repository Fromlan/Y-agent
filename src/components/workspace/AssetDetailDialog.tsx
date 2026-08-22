import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  X,
  Copy,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Layers,
  ImageIcon,
  Video as VideoIcon,
  Clock,
  Ruler,
  Cpu,
  CalendarClock,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  EyeOff,
  Frame,
  Brush,
  Send,
  Focus,
  Grid2X2,
  Image,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import type { Asset, GeneratedImage } from "@/lib/types";
import { assetMainImage, assetVideoSource, flatAssetImages, imageInput } from "@/lib/types";
import { resolveImageUrlSync } from "@/lib/image-resolver";
import { useToast } from "@/components/shared/Toast";
import { explainOptimizeReason } from "@/lib/h3-context-ir";
import { generateImage as jimengGenerate, explainError } from "@/lib/jimeng";
import { buildAssetPayload, resolveFormat } from "@/lib/asset-payload";
import { resolveImageUrl } from "@/lib/image-resolver";
import SafeImage from "@/components/shared/SafeImage";
import { createAsset } from "@/lib/assets";
import { pickVisibleLayers, getBboxHealth } from "@/lib/layer-view";
import LayerCompositeStage from "@/components/workspace/LayerCompositeStage";
import LayerThumb from "@/components/workspace/LayerThumb";

/**
 * 从 GeneratedImage 推断下载扩展名
 * - 优先看 payload.outputFormat（P4 起的权威字段）
 * - 缺失时看 data URL / URL 末尾扩展名
 * - 兜底 png
 */
function detectImageExt(img: GeneratedImage, payloadFormat: "png" | "jpeg" | undefined): string {
  if (payloadFormat === "jpeg") return "jpg";
  if (payloadFormat === "png") return "png";
  if (img.outputFormat === "jpeg") return "jpg";
  if (img.outputFormat === "png") return "png";
  const src = img.localPath ?? img.url ?? "";
  // data URL
  if (src.startsWith("data:image/jpeg") || src.startsWith("data:image/jpg")) return "jpg";
  if (src.startsWith("data:image/png")) return "png";
  if (src.startsWith("data:image/webp")) return "webp";
  if (src.startsWith("data:image/")) return "png";
  // 末尾扩展名
  const m = src.split("?")[0].split("#")[0].match(/\.(jpe?g|png|webp)(\.|$)/i);
  if (m) {
    const e = m[1].toLowerCase();
    if (e === "jpg" || e === "jpeg") return "jpg";
    return e;
  }
  return "png";
}

interface Props {
  asset: Asset;
  onClose: () => void;
  onCopyPrompt: (text: string) => void;
  onDownload: (url: string, filename: string) => void;
  onDelete: (id: string) => void;
  /** P3：局部编辑后生成新资产，通知上层刷新列表 */
  onAssetCreated?: (asset: Asset) => void;
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
  onAssetCreated,
}: Props) {
  const images = flatAssetImages(asset);
  const isVideo = asset.payload?.kind === "video";
  const videoSrc = isVideo ? resolveImageUrlSync(assetVideoSource(asset)) : "";
  const [idx, setIdx] = useState(0);
  const toast = useToast();
  const [confirmDel, setConfirmDel] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  // P3：局部编辑模式（画 bbox + 5.0 Pro 重新出图）
  const [editMode, setEditMode] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const editBboxRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // 5.0 Pro 局部编辑：把用户画的 bbox 拼成 <bbox>x1 y1 x2 y2</bbox>，源图作 image 输入
  const doLocalEdit = useCallback(
    async (srcImg: GeneratedImage) => {
      const srcInput = imageInput(srcImg);
      if (!srcInput) return;
      const bbox = editBboxRef.current;
      if (!bbox) {
        toast.warn("请先在图上画一个矩形框");
        return;
      }
      const userPrompt = editPrompt.trim();
      if (!userPrompt) {
        toast.warn("请输入修改指令（例如：在框内加一束花）");
        return;
      }
      // 文档示例：把 bbox 写进 prompt，<bbox>x1 y1 x2 y2</bbox>，坐标是源图像素
      const builtPrompt = `${userPrompt} <bbox>${bbox.x1} ${bbox.y1} ${bbox.x2} ${bbox.y2}</bbox>`;
      setEditBusy(true);
      const t0 = Date.now();
      try {
        // 重要：jimeng API 的 image[] 只接受 http(s)/data: URL；本地绝对路径（assetMainImage 在 P5 后优先 localPath）会被 API 拒。先 resolveImageUrl 把它转成 dataURL 再传。
        const apiImage = await resolveImageUrl(srcInput);
        const resp = await jimengGenerate({
          model: "doubao-seedream-5-0-pro-260628",
          prompt: builtPrompt,
          image: [apiImage],
          size: asset.size || "2k",
        });
        // 局部编辑用 5.0 Pro 同步，resp.output_format 一定有值（5.0 Pro 顶层字段）
        const actualFormat = resolveFormat({
          respFormat: (resp as { output_format?: string }).output_format,
          reqFormat: undefined,
          modelId: "doubao-seedream-5-0-pro-260628",
        });
        const newAsset = await createAsset({
          projectId: asset.projectId,
          prompt: builtPrompt,
          model: "doubao-seedream-5-0-pro-260628",
          modelName: "Seedream 5.0 Pro（局部编辑）",
          size: asset.size || "2k",
          refCount: 1,
          costMs: Date.now() - t0,
          isLayerDecomposition: false,
          payload: buildAssetPayload(
            {
              urls: resp.images.map((i) => i.url),
              usage: resp.usage,
              // 局部编辑场景不是 transparent 背景模式（源图可能是 jpeg）
              isTransparent: false,
              // P3：保留溯源信息（编辑历史）
              parentAssetId: asset.id,
              bbox,
              // P5：把 Rust 端下好的本地路径一起持久化（24h 兜底）。
              // 后端 create_asset 也会兜底：万一这里漏了或下载失败，会自动重拉。
              localPaths: resp.images.map((i) => i.localPath ?? ""),
            },
            actualFormat
          ),
        });
        onAssetCreated?.(newAsset);
        toast.success("局部编辑完成，已入库到资产库");
        setEditMode(false);
        setEditPrompt("");
        editBboxRef.current = null;
      } catch (e: any) {
        const raw = e?.message ?? String(e);
        const friendly = await explainError(raw).catch(() => raw);
        toast.error(friendly);
      } finally {
        setEditBusy(false);
      }
    },
    [asset.id, asset.projectId, asset.size, editPrompt, onAssetCreated, toast]
  );
  // P2：图层可见性。被隐藏的图层不参与左右切换、不显示在主预览。
  const [hiddenLayers, setHiddenLayers] = useState<Set<number>>(new Set());
  const toggleLayerVisible = (i: number) => {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  // 合成视图：solo / 选中 / 视图模式（仅 isLayerDecomposition 生效）
  const [viewMode, setViewMode] = useState<"composite" | "single">("composite");
  const [soloLayerIdx, setSoloLayerIdx] = useState<number | null>(null);
  const [selectedLayerIdx, setSelectedLayerIdx] = useState<number | null>(null);
  const toggleSolo = (i: number) => {
    setSoloLayerIdx((prev) => (prev === i ? null : i));
  };
  const showAllLayers = () => {
    setHiddenLayers(new Set());
    setSoloLayerIdx(null);
  };
  // 派生：当前合成画布上应该渲染的图层
  const visibleLayers = useMemo(
    () => pickVisibleLayers(images, hiddenLayers, soloLayerIdx),
    [images, hiddenLayers, soloLayerIdx]
  );
  // 派生：底图层（zIndex=0），用于解析画布像素
  const baseLayer = useMemo(
    () => images.find((img) => (img.zIndex ?? 0) === 0) ?? images[0],
    [images]
  );
  // 派生：当前选中的图层对象（用于 bbox 描边）
  const selectedLayer = useMemo(
    () => (selectedLayerIdx === null ? null : images[selectedLayerIdx] ?? null),
    [images, selectedLayerIdx]
  );
  // P0+：bbox 健康度（从所有图层派生，不只看 visibleLayers — 整体降级用）
  // 判定：非底图层 bbox 全部缺失 → 合成视图无意义，自动降级到单图层视图
  const bboxHealth = useMemo(() => getBboxHealth(images), [images]);
  // "非底图层" 至少要有 1 个有 bbox，合成视图才有意义
  // getBboxHealth 把底图算 ok(1)，所以 nonBaseOk = bboxHealth.ok - (有底图 ? 1 : 0)
  const hasBaseInImages = images.some((img) => (img.zIndex ?? 0) === 0);
  const nonBaseOk = bboxHealth.ok - (hasBaseInImages ? 1 : 0);
  const allNonBaseBboxMissing =
    asset.isLayerDecomposition && images.length > 1 && nonBaseOk === 0;
  // 行点击：合成模式 → 高亮 bbox；单图层模式 → 切到该图层
  const onLayerRowClick = (i: number) => {
    if (viewMode === "single" || !asset.isLayerDecomposition) {
      setIdx(i);
    } else {
      setSelectedLayerIdx(i);
    }
  };

  // P0+：整体降级 — 如果非底图层 bbox 全缺,在合成模式下自动切到单图层。
  // 用 useEffect 避免在渲染期间 setState 触发循环。
  useEffect(() => {
    if (
      asset.isLayerDecomposition &&
      viewMode === "composite" &&
      allNonBaseBboxMissing
    ) {
      setViewMode("single");
    }
  }, [asset.isLayerDecomposition, viewMode, allNonBaseBboxMissing]);

  // 如果当前 idx 被隐藏，自动跳到第一个可见图层；全部隐藏时返回 -1
  const visibleIdx = hiddenLayers.has(idx)
    ? images.findIndex((_, k) => !hiddenLayers.has(k))
    : idx;
  const effectiveIdx = visibleIdx === -1 ? -1 : visibleIdx;
  const cur = effectiveIdx === -1 ? undefined : images[effectiveIdx];

  // 切换资产/打开时归零
  useEffect(() => {
    setIdx(0);
    setConfirmDel(false);
    setPromptCopied(false);
    setHiddenLayers(new Set());
    setSoloLayerIdx(null);
    setSelectedLayerIdx(null);
    // 图层资产默认走合成；非图层资产强制走单图层（防御性，正常不会进入该分支）
    setViewMode(asset.isLayerDecomposition ? "composite" : "single");
    // 局部编辑状态：切资产时也清掉，避免上一个资产的 bbox / prompt 留到新资产上
    setEditMode(false);
    setEditPrompt("");
    editBboxRef.current = null;
  }, [asset.id, asset.isLayerDecomposition]);

  // 视图模式变化时清掉选中高亮（合成 <-> 单图层 概念不同）
  useEffect(() => {
    setSelectedLayerIdx(null);
  }, [viewMode]);

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // 合成视图下禁用 ←/→（没有"当前图层"概念）
      else if (
        (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        images.length > 1 &&
        viewMode === "single"
      ) {
        setIdx((i) => {
          // 用 images.length 配合 idx 自身 + hiddenLayers 计算下一个可见位置
          // （避免在 handler 里引用 images 整个数组触发 exhaustive-deps）
          if (images.length === 0) return i;
          const step = e.key === "ArrowLeft" ? -1 : 1;
          for (let n = 1; n <= images.length; n++) {
            const next = (((i + step * n) % images.length) + images.length) % images.length;
            if (!hiddenLayers.has(next)) return next;
          }
          return i;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose, viewMode, hiddenLayers]);

  const onCopy = () => {
    // 父组件 onCopyPrompt 已统一处理 clipboard + toast，这里只维护按钮状态。
    onCopyPrompt(asset.prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 1500);
  };

  const onDownloadCur = () => {
    if (!cur?.url) return;
    const ext = detectImageExt(cur, asset.payload.outputFormat);
    const label = cur.name ? `-${cur.name.replace(/\s+/g, "_")}` : `-${effectiveIdx + 1}`;
    onDownload(cur.url, `y-agent-${asset.id}${label}.${ext}`);
  };

  // P8：视频资产走专用渲染（无多图/图层/局部编辑）
  if (isVideo) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay"
        onClick={onClose}
      >
        <div
          className="panel w-[90vw] max-w-4xl p-4 max-h-[90vh] flex flex-col gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <VideoIcon className="w-4 h-4 text-accent" />
              <span>
                视频资产 · {asset.payload.video?.resolution} · {asset.payload.video?.duration}s · {asset.payload.video?.ratio}
              </span>
            </div>
            <button onClick={onClose} className="btn-icon">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center bg-black rounded overflow-hidden min-h-0">
            {videoSrc ? (
              <video
                src={videoSrc}
                controls
                autoPlay
                playsInline
                className="max-w-full max-h-[60vh] object-contain"
              />
            ) : (
              <div className="text-text-muted text-sm p-8">
                视频源不可用（可能 URL 24h 过期或本地缓存丢失）
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-[11px] text-text-muted">
            <p className="line-clamp-2 flex-1">{asset.prompt}</p>
            <div className="flex items-center gap-2">
              {videoSrc && (
                <a href={videoSrc} download={`y-agent-${asset.id}.mp4`} target="_blank" rel="noreferrer" className="btn-icon p-1" title="下载">
                  <Download className="w-3.5 h-3.5" />
                </a>
              )}
              <button onClick={() => onCopyPrompt(asset.prompt)} className="btn-icon p-1" title="复制 prompt">
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}
                className="btn-icon p-1 text-text-muted hover:text-accent-danger"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {asset.payload.video?.optimizedPrompt || asset.payload.video?.optimizationReason ? (
            <details className="text-[11px] text-text-muted border border-border rounded p-2 bg-bg-hover/30">
              <summary className="cursor-pointer flex items-center gap-1.5 select-none">
                <Sparkles className="w-3 h-3 text-accent" />
                <span>
                  {asset.payload.video.optimizedPrompt
                    ? "AI 增强提示词（点击展开对比）"
                    : "AI 增强（未生效）"}
                </span>
                {asset.payload.video.optimizationReason &&
                  asset.payload.video.optimizationReason !== "ok" &&
                  asset.payload.video.optimizationReason !== "demo" && (
                    <span className="text-accent-danger/80">
                      · {explainOptimizeReason(asset.payload.video.optimizationReason) ??
                        asset.payload.video.optimizationReason}
                    </span>
                  )}
              </summary>
              <div className="mt-2 space-y-2">
                {asset.payload.video.originalPrompt && (
                  <div>
                    <div className="text-text-muted/80 mb-0.5">原文</div>
                    <pre className="whitespace-pre-wrap break-words text-text-secondary leading-relaxed max-h-32 overflow-auto bg-bg-base/40 p-2 rounded">
                      {asset.payload.video.originalPrompt}
                    </pre>
                  </div>
                )}
                {asset.payload.video.optimizedPrompt && (
                  <div>
                    <div className="text-accent mb-0.5">AI 增强后</div>
                    <pre className="whitespace-pre-wrap break-words text-text-secondary leading-relaxed max-h-40 overflow-auto bg-bg-base/40 p-2 rounded">
                      {asset.payload.video.optimizedPrompt}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    );
  }

  const onDownloadAll = async () => {
    toast.info(`开始下载 ${images.length} 张图…`);
    // 分批触发，避免浏览器把连续下载当广告拦截。
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (img.url) {
        const label = img.name ? `-${img.name.replace(/\s+/g, "_")}` : `-${i + 1}`;
        const ext = detectImageExt(img, asset.payload.outputFormat);
        onDownload(img.url, `y-agent-${asset.id}${label}.${ext}`);
      }
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
      className="fixed inset-0 z-50 bg-bg-overlay flex items-center justify-center p-4 sm:p-8"
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
            {asset.isLayerDecomposition && (
              <span className="px-1.5 py-0.5 rounded bg-accent/20 text-accent flex items-center gap-1">
                <Layers className="w-3 h-3" /> 图层拆分
              </span>
            )}
            {images.length > 1 && (
              <span className="text-text-muted">
                {asset.isLayerDecomposition && viewMode === "composite"
                  ? `${visibleLayers.length} / ${images.length} 合成`
                  : `${idx + 1} / ${images.length}`}
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

        {/* P0+：bbox 整体缺失 notice — 当所有非底图层的 boundingBox 都缺失时,
            自动切到单图层视图 + 顶部黄条提示,让用户知道为什么没看到合成。 */}
        {asset.isLayerDecomposition && allNonBaseBboxMissing && (
          <div
            className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/30
              text-amber-200 text-xs flex items-center gap-2 flex-shrink-0"
            title="API 没返回图层位置信息（boundingBox）。常见原因:用了不支持的旧模型/endpoint,或响应解析失败。已自动切到单图层视图。"
          >
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>图层位置缺失 — 已切到单图层视图</span>
          </div>
        )}

        {/* 主体：左预览 + 右元数据 */}
        <div className="flex-1 flex min-h-0">
          {/* 左侧：统一尺寸预览区 */}
          <div className="flex-1 min-w-0 bg-bg-base flex flex-col relative">
            {/* 合成/单图层 视图模式切换（仅图层资产） */}
            {asset.isLayerDecomposition && images.length > 1 && !editMode && (
              <div className="absolute top-2 left-2 z-20 flex items-center gap-0.5
                bg-bg-panel/90 backdrop-blur rounded p-0.5 text-xs border border-border">
                <button
                  onClick={() => setViewMode("composite")}
                  className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                    viewMode === "composite"
                      ? "bg-accent text-text-inverse"
                      : "text-text-secondary hover:bg-bg-elev"
                  }`}
                  title="合成视图：所有可见图层按 zIndex 叠放"
                >
                  <Grid2X2 className="w-3 h-3" /> 合成
                </button>
                <button
                  onClick={() => setViewMode("single")}
                  className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                    viewMode === "single"
                      ? "bg-accent text-text-inverse"
                      : "text-text-secondary hover:bg-bg-elev"
                  }`}
                  title="单图层视图：一张一张翻看"
                >
                  <Image className="w-3 h-3" /> 单图层
                </button>
              </div>
            )}
            <div className="flex-1 flex items-center justify-center p-4 min-h-0">
              {editMode && cur && (cur.localPath || cur.url) ? (
                <EditStage
                  imageUrl={imageInput(cur)}
                  onBboxChange={(b) => {
                    editBboxRef.current = b;
                  }}
                />
              ) : !cur ? (
                <AllHiddenPlaceholder />
              ) : asset.isLayerDecomposition && viewMode === "composite" ? (
                <LayerCompositeStage
                  layers={visibleLayers}
                  baseLayer={baseLayer}
                  selectedLayer={selectedLayer}
                />
              ) : (
                <PreviewStage
                  image={cur}
                  fallbackUrl={assetMainImage(asset)}
                />
              )}
            </div>
            {/* P3：编辑模式的 prompt + 提交栏 */}
            {editMode && cur?.url && (
              <EditBar
                busy={editBusy}
                prompt={editPrompt}
                onPromptChange={setEditPrompt}
                onSubmit={() => doLocalEdit(cur)}
                onCancel={() => {
                  setEditMode(false);
                  setEditPrompt("");
                  editBboxRef.current = null;
                }}
                canSubmit={!editBusy && !!editPrompt.trim() && !!editBboxRef.current}
              />
            )}
            {/* 多图切换控件（单图层模式 / 合成模式都显示，但合成模式淡化） */}
            {images.length > 1 && (
              <div className={`flex items-center justify-center gap-2 p-2 border-t border-border bg-bg-panel flex-shrink-0 ${
                asset.isLayerDecomposition && viewMode === "composite" ? "opacity-60" : ""
              }`}>
                <button
                  onClick={() => {
                    if (asset.isLayerDecomposition && viewMode === "composite") {
                      // 合成模式：点切换按钮 = 切到单图层 + 跳到当前选中图层的上一个
                      setViewMode("single");
                    }
                    setIdx((i) => {
                      // 跳过隐藏的图层
                      const visible = images
                        .map((_, k) => k)
                        .filter((k) => !hiddenLayers.has(k));
                      if (visible.length === 0) return i;
                      const curPos = visible.indexOf(i);
                      const nextPos =
                        (curPos - 1 + visible.length) % visible.length;
                      return visible[nextPos];
                    });
                  }}
                  className="btn-icon"
                  title="上一张（←）"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1 overflow-x-auto max-w-[60%]">
                  {images.map((img, i) => {
                    const isHidden = hiddenLayers.has(i);
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          if (isHidden) return;
                          // 合成模式：点缩略图 = 切到单图层 + 定位
                          if (asset.isLayerDecomposition && viewMode === "composite") {
                            setViewMode("single");
                          }
                          setIdx(i);
                        }}
                        className={`relative flex-shrink-0 w-10 h-10 rounded overflow-hidden border-2 transition-colors
                          ${isHidden ? "border-border opacity-40" : i === idx ? "border-accent" : "border-border hover:border-border-strong"}
                        `}
                        title={
                          asset.isLayerDecomposition && viewMode === "composite"
                            ? `${img.name ?? `图层 ${i + 1}`}（点击切到单图层视图）`
                            : isHidden
                            ? `${img.name ?? `图 ${i + 1}`}（已隐藏，点亮显示）`
                            : img.name ?? `图 ${i + 1}`
                        }
                      >
                        {img.url ? (
                          <SafeImage
                            src={imageInput(img)}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-bg-elev" />
                        )}
                        {isHidden && (
                          <EyeOff className="absolute inset-0 m-auto w-3.5 h-3.5 text-white drop-shadow" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    if (asset.isLayerDecomposition && viewMode === "composite") {
                      setViewMode("single");
                    }
                    setIdx((i) => {
                      const visible = images
                        .map((_, k) => k)
                        .filter((k) => !hiddenLayers.has(k));
                      if (visible.length === 0) return i;
                      const curPos = visible.indexOf(i);
                      const nextPos = (curPos + 1) % visible.length;
                      return visible[nextPos];
                    });
                  }}
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
                    value={`${(asset.costMs / 1000).toFixed(1)} s`}
                  />
                  <MetaItem
                    icon={ImageIcon}
                    label="参考图"
                    value={`${asset.refCount} 张`}
                  />
                  <MetaItem
                    icon={Layers}
                    label="详情"
                    value={
                      asset.isLayerDecomposition
                        ? `图层拆分 · ${
                            asset.payload.layers?.length ||
                            (asset.payload.urls.length > 0 ? asset.payload.urls.length : 0)
                          } 层${
                            asset.payload.transparent ? " · PNG(透明)" : ""
                          }`
                        : `普通生图 · ${asset.payload.urls?.length ?? 1} 张${
                            asset.payload.outputFormat
                              ? " · " + asset.payload.outputFormat.toUpperCase() +
                                (asset.payload.transparent ? "(透明)" : "")
                              : ""
                          }`
                    }
                  />
                </div>
              </section>

              {/* P2：图层面板（仅 layer_decomposition 资产） */}
              {asset.isLayerDecomposition && images.length > 0 && (
                <section>
                  <h3 className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Layers className="w-3 h-3" /> 图层列表
                    <span className="text-text-muted/60 normal-case">
                      ({visibleLayers.length} / {images.length} 可见{soloLayerIdx !== null ? " · Solo" : ""})
                    </span>
                  </h3>
                  <div className="space-y-1">
                    {images.map((img, i) => {
                      const isHidden = hiddenLayers.has(i);
                      const isSoloed = soloLayerIdx === i;
                      const isBase = (img.zIndex ?? 0) === 0;
                      // 优先显示 normalized（5.0 Pro 官方"任意尺寸重建"字段，
                      // aspect-independent）；缺失时 fallback 到 absolute（老数据）。
                      const bbNorm = img.boundingBox?.normalized;
                      const bbAbs = img.boundingBox?.absolute;
                      const isSelected = selectedLayerIdx === i;
                      const hasDetailText = !!(img.description || bbNorm || bbAbs);
                      return (
                        <div
                          key={i}
                          onClick={() => onLayerRowClick(i)}
                          className={`flex items-start gap-2 p-1.5 rounded border transition-colors cursor-pointer
                            ${isSelected ? "border-l-2 border-l-accent border-border-strong" : ""}
                            ${isHidden
                              ? "border-border bg-bg-base opacity-60"
                              : isSoloed
                              ? "border-accent/60 bg-accent/10"
                              : "border-border bg-bg-elev hover:border-border-strong"}
                          `}
                        >
                          {/* P0+：单复合缩略图（底图作背景 + 当前图层 bbox 描边）。
                              把原 48x48 主图 + 32x32 bbox mini 合并为单个 48x48 容器，
                              行高从 ~100px 降到 ~60px。 */}
                          {baseLayer && (
                            <div
                              className="flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isHidden) return;
                                // 缩略图点击 = 切到单图层并定位（与底条行为一致）
                                if (asset.isLayerDecomposition && viewMode === "composite") {
                                  setViewMode("single");
                                }
                                setIdx(i);
                              }}
                            >
                              <LayerThumb
                                baseLayer={baseLayer}
                                layer={img}
                                size={48}
                                highlight={isSelected}
                                hidden={isHidden}
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 text-xs">
                              {isBase ? (
                                <span className="px-1.5 py-0.5 bg-accent/20 text-accent rounded text-[10px] font-medium">
                                  底图
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-bg-panel text-text-muted rounded text-[10px]">
                                  图层 {img.zIndex}
                                </span>
                              )}
                              <span className="text-text-primary truncate flex-1" title={img.name}>
                                {img.name ?? `图层 ${i + 1}`}
                              </span>
                            </div>
                            {/* 详情(description / bbox 坐标)折叠：5+ 层时默认收起,
                                选中行或 hover 时展开。tooltip 也在 LayerThumb 上保留。 */}
                            {hasDetailText && (
                              <details
                                className="mt-0.5 group"
                                open={isSelected}
                              >
                                <summary
                                  className="text-[10px] text-text-muted/70 cursor-pointer
                                    hover:text-text-secondary list-none
                                    [&::-webkit-details-marker]:hidden
                                    before:content-['▸'] before:mr-1 before:inline-block
                                    group-open:before:content-['▾']
                                    select-none"
                                >
                                  详情
                                </summary>
                                <div className="mt-0.5 space-y-0.5 pl-3">
                                  {img.description && (
                                    <p className="text-[10px] text-text-muted line-clamp-2">
                                      {img.description}
                                    </p>
                                  )}
                                  {(bbNorm || bbAbs) && (
                                    <p className="text-[10px] text-text-muted/70 font-mono flex items-center gap-1">
                                      <Frame className="w-2.5 h-2.5" />
                                      {bbNorm
                                        ? `[${bbNorm.join(", ")}] (0-1000)`
                                        : `[${bbAbs!.join(", ")}] (px)`}
                                    </p>
                                  )}
                                </div>
                              </details>
                            )}
                          </div>
                          <div
                            className="flex flex-col gap-0.5 flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => toggleLayerVisible(i)}
                              className="btn-icon p-1"
                              title={isHidden ? "显示此图层" : "隐藏此图层"}
                            >
                              {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => toggleSolo(i)}
                              className={`btn-icon p-1 ${isSoloed ? "!bg-accent/30 !text-accent" : ""}`}
                              title={isSoloed ? "取消 Solo" : "Solo：只看此图层"}
                            >
                              <Focus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => img.url && onDownload(img.url, `y-agent-${asset.id}-${img.name ?? i + 1}.png`)}
                              className="btn-icon p-1"
                              title="导出该图层"
                              disabled={!img.url}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* 全部显示按钮：仅当有图层被隐藏或处于 solo 模式时显示 */}
                  {(hiddenLayers.size > 0 || soloLayerIdx !== null) && (
                    <button
                      onClick={showAllLayers}
                      className="mt-2 w-full btn text-xs h-7"
                      title="清除所有隐藏 / Solo，恢复显示所有图层"
                    >
                      <Eye className="w-3.5 h-3.5" /> 全部显示
                    </button>
                  )}
                </section>
              )}

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
              {!editMode && asset.model === "doubao-seedream-5-0-pro-260628" && cur?.url && (
                <button
                  onClick={() => setEditMode(true)}
                  className="btn text-xs h-8"
                  title="画框并描述修改"
                >
                  <Brush className="w-3.5 h-3.5" /> 局部编辑
                </button>
              )}
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
                    : "hover:!text-accent-danger"
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
 * 所有图层都被隐藏时的占位（单图层视图路径）
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
  // P5：优先用 localPath（已下载到本地，URL 失效后仍可看）
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

/**
 * P3：局部编辑的画框舞台。
 * - 显示原图 + 一个覆盖层
 * - 用户在覆盖层画矩形 → 记录图像素坐标 (bbox)
 * - 通过 onBboxChange callback 把 bbox 同步给父组件 ref
 */
function EditStage({
  imageUrl,
  onBboxChange,
}: {
  imageUrl: string;
  onBboxChange: (
    bbox: { x1: number; y1: number; x2: number; y2: number } | null
  ) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [drawn, setDrawn] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  // bbox 变化时同步给父组件（包括清空）
  useEffect(() => {
    onBboxChange(drawn);
  }, [drawn, onBboxChange]);

  // 屏幕坐标 → 图像素坐标
  const screenToImage = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img || !naturalSize.w || !naturalSize.h) return null;
    const rect = img.getBoundingClientRect();
    // 点在图片外的部分直接丢弃
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null;
    }
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(naturalSize.w, Math.round(relX * naturalSize.w))),
      y: Math.max(0, Math.min(naturalSize.h, Math.round(relY * naturalSize.h))),
    };
  };

  const onDown = (e: React.MouseEvent) => {
    const pt = screenToImage(e.clientX, e.clientY);
    if (!pt) return;
    setDrag(pt);
    setDrawn({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const pt = screenToImage(e.clientX, e.clientY);
    if (!pt) return;
    setDrawn({ x1: drag.x, y1: drag.y, x2: pt.x, y2: pt.y });
  };
  const onUp = () => setDrag(null);

  return (
    <div
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      className="relative w-full max-w-[640px] aspect-[16/10] bg-bg-elev rounded-md overflow-hidden border border-border select-none cursor-crosshair"
      title="拖动鼠标在图上画一个矩形框"
    >
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        onLoad={(e) => {
          const t = e.currentTarget;
          setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight });
        }}
        className="w-full h-full object-contain pointer-events-none"
        draggable={false}
      />
      {drawn && (
        <div
          className="absolute border-2 border-accent bg-accent/15 pointer-events-none"
          style={{
            left: `${(Math.min(drawn.x1, drawn.x2) / Math.max(naturalSize.w, 1)) * 100}%`,
            top: `${(Math.min(drawn.y1, drawn.y2) / Math.max(naturalSize.h, 1)) * 100}%`,
            width: `${(Math.abs(drawn.x2 - drawn.x1) / Math.max(naturalSize.w, 1)) * 100}%`,
            height: `${(Math.abs(drawn.y2 - drawn.y1) / Math.max(naturalSize.h, 1)) * 100}%`,
          }}
        >
          <span className="absolute -top-6 left-0 bg-accent text-text-inverse text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
            bbox [{Math.min(drawn.x1, drawn.x2)}, {Math.min(drawn.y1, drawn.y2)}, {Math.max(drawn.x1, drawn.x2)}, {Math.max(drawn.y1, drawn.y2)}]
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * P3：编辑模式底栏（prompt + 提交/取消）
 * - bbox 已由 EditStage 通过 onBboxChange 同步到父组件 ref
 * - 这里只读 prompt，按 Enter 或点提交
 */
function EditBar({
  busy,
  prompt,
  onPromptChange,
  onSubmit,
  onCancel,
  canSubmit,
}: {
  busy: boolean;
  prompt: string;
  onPromptChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  /** 父组件判定：!busy && prompt 非空 && bbox 已画 */
  canSubmit: boolean;
}) {
  const hint = !canSubmit && !busy
    ? prompt.trim()
      ? "请先在图上画一个矩形框"
      : "请输入修改指令"
    : undefined;
  return (
    <div className="border-t border-border bg-bg-panel p-3 flex items-center gap-2 flex-shrink-0">
      <input
        type="text"
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit) onSubmit();
        }}
        placeholder="修改指令（例：在框内加一束花）"
        disabled={busy}
        className="flex-1 input text-sm"
      />
      <button onClick={onCancel} className="btn text-xs h-8" disabled={busy}>
        取消
      </button>
      <button
        onClick={onSubmit}
        className="btn btn-primary text-xs h-8"
        disabled={!canSubmit}
        title={hint}
      >
        <Send className="w-3.5 h-3.5" /> {busy ? "生成中…" : "提交"}
      </button>
      {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
    </div>
  );
}
