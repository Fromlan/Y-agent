import { useState, useRef, useEffect } from "react";
import {
  Layers,
  X,
  ImagePlus,
  Scissors,
  Search,
  Droplet,
  Brush,
  Grid3x3,
  Sparkles,
  ArrowUp,
  Settings as SettingsIcon,
  Loader2,
  AlertCircle,
  Check,
} from "lucide-react";
import type { Asset, ModelOption } from "@/lib/types";
import { MODEL_OPTIONS, modelCapabilities, assetMainImage } from "@/lib/types";
import { useToast } from "@/components/shared/Toast";
import { explainError } from "@/lib/jimeng";
import AssetPicker from "@/components/workspace/tools/AssetPicker";
import { runTool, type ToolProgress } from "@/components/workspace/tools/runTool";
import { splitSpriteSheet, type SplitResult } from "@/lib/sprite-splitter";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

interface Props {
  projectId: string;
  assets: Asset[];
  onAssetCreated: (asset: Asset) => void;
  hasKey: boolean | null;
  onOpenSettings: () => void;
}

type ToolKind = "batch" | "websearch" | "transparent" | "layers" | "localedit" | "splitsprite";

interface ToolDef {
  id: ToolKind;
  title: string;
  desc: string;
  icon: typeof Layers;
  tag: string;
}

const TOOLS: ToolDef[] = [
  {
    id: "batch",
    title: "批量组图",
    desc: "一次出 N 张同 prompt（适合挑选用）",
    icon: Grid3x3,
    tag: "5.0 Lite / 4.5 / 4.0",
  },
  {
    id: "websearch",
    title: "联网出图",
    desc: "模型先搜互联网再画（天气、商品等实时信息）",
    icon: Search,
    tag: "5.0 Lite",
  },
  {
    id: "transparent",
    title: "背景去背",
    desc: "把已有图导出为 PNG 透明背景（UI 图标 / 素材）",
    icon: Droplet,
    tag: "5.0 Pro",
  },
  {
    id: "layers",
    title: "图层拆分",
    desc: "把一张图拆为底图 + 多个可编辑图层",
    icon: Layers,
    tag: "5.0 Pro",
  },
  {
    id: "localedit",
    title: "局部编辑",
    desc: "在图上画框 + 改写 prompt 重画局部",
    icon: Brush,
    tag: "5.0 Pro",
  },
  {
    id: "splitsprite",
    title: "雪碧图切分",
    desc: "把一张网格图按 rows×cols 切成独立 PNG + ZIP",
    icon: Scissors,
    tag: "P2",
  },
];

/**
 * 判断资产图是否为 JPEG 格式（5.0 Pro 的 background: transparent 严格要求 PNG 输入）。
 * - payload.outputFormat 是最权威的来源（生图时记录的）
 * - URL 末尾扩展名是次要依据（兼容老数据 / 外部导入）
 */
function isAssetJpeg(asset: Asset): boolean {
  if (asset.payload.outputFormat === "jpeg") return true;
  const main = assetMainImage(asset);
  if (!main) return false;
  // 去掉 query / hash 后看扩展名
  const stripped = main.split("?")[0].split("#")[0];
  return /\.(jpe?g)(\.|$)/i.test(stripped);
}

// 5.0 Pro / 5.0 Lite 模型的固定 ID（避免被 MODEL_OPTIONS 别名变更影响）
const PRO_ID = "doubao-seedream-5-0-pro-260628";
const LITE_ID = "doubao-seedream-5-0-lite-260128";
const PRO_NAME = "Seedream 5.0 Pro";

export default function ToolsTab({ projectId, assets, onAssetCreated, hasKey, onOpenSettings }: Props) {
  const toast = useToast();
  const [active, setActive] = useState<ToolKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ToolProgress | null>(null);

  const onClose = () => {
    if (busy) return;
    setActive(null);
    setProgress(null);
  };

  const runAndClose = async (
    kind: ToolKind,
    fn: (onProgress: (p: ToolProgress) => void) => Promise<Asset>
  ) => {
    if (hasKey === false) {
      onOpenSettings();
      return;
    }
    setBusy(true);
    setProgress({ phase: "requesting", message: "准备中…" });
    try {
      const asset = await fn((p) => setProgress(p));
      onAssetCreated(asset);
      toast.success(`已生成并入库：${TOOLS.find((t) => t.id === kind)?.title ?? ""}`);
      // 短延迟让用户看到 "done" 状态再关
      setTimeout(() => {
        setActive(null);
        setProgress(null);
      }, 600);
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      const friendly = await explainError(raw).catch(() => raw);
      toast.error(friendly);
      setProgress({ phase: "error", message: friendly });
      // 错误状态也保留一会儿，让用户看清楚
      setTimeout(() => setBusy(false), 1500);
      return;
    }
    setBusy(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <h2 className="text-base font-medium">工具</h2>

        {hasKey === false && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-md border text-xs"
            style={{
              backgroundColor: "color-mix(in srgb, var(--status-warn) 8%, transparent)",
              borderColor: "color-mix(in srgb, var(--status-warn) 28%, transparent)",
            }}
          >
            <span className="flex-1 text-text-secondary">
              还没配置即梦 API Key。
            </span>
            <button
              onClick={onOpenSettings}
              className="px-2 py-0.5 rounded text-xs font-medium hover:opacity-80 flex items-center gap-1"
              style={{
                color: "var(--status-warn)",
                backgroundColor: "color-mix(in srgb, var(--status-warn) 18%, transparent)",
              }}
            >
              <SettingsIcon className="w-3 h-3" /> 打开设置
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TOOLS.map(({ id, title, desc, icon: Icon, tag }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              disabled={hasKey === false}
              className="panel p-4 text-left space-y-2 hover:border-accent transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-start justify-between">
                <Icon className="w-5 h-5 text-accent" />
                <span className="text-[10px] text-text-muted uppercase tracking-wider">
                  {tag}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-medium">{title}</h3>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">{desc}</p>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                打开 <ArrowUp className="w-3 h-3 rotate-90" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {active && (
        <ToolModal
          kind={active}
          onClose={onClose}
          busy={busy}
          progress={progress}
          projectId={projectId}
          assets={assets}
          onRun={(fn) => runAndClose(active, fn)}
        />
      )}
    </div>
  );
}

// ============================================================================
// 工具 Modal：根据 active kind 渲染不同表单
// ============================================================================

interface ToolModalProps {
  kind: ToolKind;
  projectId: string;
  assets: Asset[];
  busy: boolean;
  progress: ToolProgress | null;
  onClose: () => void;
  onRun: (fn: (onProgress: (p: ToolProgress) => void) => Promise<Asset>) => void;
}

function ToolModal({ kind, projectId, assets, busy, progress, onClose, onRun }: ToolModalProps) {
  const def = TOOLS.find((t) => t.id === kind)!;
  const Icon = def.icon;
  return (
    <div
      className="fixed inset-0 z-50 bg-bg-overlay flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="panel w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-medium">{def.title}</h3>
            <span className="text-[10px] text-text-muted">{def.tag}</span>
          </div>
          <button onClick={onClose} disabled={busy} className="btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {kind === "batch" && <BatchForm projectId={projectId} onRun={onRun} busy={busy} />}
          {kind === "websearch" && (
            <WebSearchForm projectId={projectId} onRun={onRun} busy={busy} />
          )}
          {kind === "transparent" && (
            <TransparentForm
              projectId={projectId}
              assets={assets}
              onRun={onRun}
              busy={busy}
            />
          )}
          {kind === "layers" && (
            <LayerForm projectId={projectId} assets={assets} onRun={onRun} busy={busy} />
          )}
          {kind === "localedit" && (
            <LocalEditForm
              projectId={projectId}
              assets={assets}
              onRun={onRun}
              busy={busy}
            />
          )}
          {kind === "splitsprite" && <SplitSpriteForm busy={busy} />}
        </div>
        {progress && (
          <ProgressBar progress={progress} />
        )}
      </div>
    </div>
  );
}

/**
 * 进度条：在 ToolModal 底部展示当前阶段 + 文本 + 进度条（流式 partial 时）
 */
function ProgressBar({ progress }: { progress: ToolProgress }) {
  const { phase, message, partialCount, totalCount } = progress;
  const showBar = typeof totalCount === "number" && totalCount > 0;
  const pct = showBar
    ? Math.min(100, Math.round(((partialCount ?? 0) / (totalCount as number)) * 100))
    : null;

  // 阶段图标
  const icon =
    phase === "done" ? (
      <Check className="w-4 h-4 text-accent-success" />
    ) : phase === "error" ? (
      <AlertCircle className="w-4 h-4 text-status-danger" />
    ) : (
      <Loader2 className="w-4 h-4 animate-spin text-accent" />
    );

  return (
    <div
      className="px-4 py-3 border-t border-border bg-bg-elev"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <span
          className={`text-xs ${
            phase === "error" ? "text-status-danger" : "text-text-primary"
          }`}
        >
          {message}
        </span>
        {showBar && partialCount !== undefined && (
          <span className="text-[10px] text-text-muted ml-auto tabular-nums">
            {partialCount} / {totalCount}
          </span>
        )}
      </div>
      {showBar && (
        <div className="h-1 bg-bg-base rounded overflow-hidden">
          <div
            className={`h-full transition-all duration-200 ${
              phase === "error"
                ? "bg-status-danger"
                : phase === "done"
                ? "bg-accent-success"
                : "bg-accent"
            }`}
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 5 个工具的表单
// ============================================================================

interface FormProps {
  projectId: string;
  /** 表单的 submit 包装：把闭包里的 runTool 逻辑 + onProgress 传给父组件的 runAndClose */
  onRun: (
    fn: (onProgress: (p: ToolProgress) => void) => Promise<Asset>
  ) => void;
  busy: boolean;
}

function BatchForm({ projectId, onRun, busy }: FormProps) {
  const lite = MODEL_OPTIONS.find((m) => m.id === LITE_ID) ?? MODEL_OPTIONS[0];
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelOption>(lite);
  const [size, setSize] = useState("2k");
  const [count, setCount] = useState(4);
  const [fastMode, setFastMode] = useState(false);
  const [outputFormat, setOutputFormat] = useState<"" | "png" | "jpeg">("png");
  const caps = modelCapabilities(model.id);

  const submit = () => {
    if (!prompt.trim()) return;
    onRun((onProgress) =>
      runTool(
        {
          projectId,
          prompt: prompt.trim(),
          modelId: model.id,
          modelName: model.name,
          size,
          sequential: "auto",
          maxImages: count,
          ...(caps.fastMode && fastMode ? { optimizePromptMode: "fast" as const } : {}),
          ...(outputFormat ? { outputFormat } : {}),
        },
        onProgress
      )
    );
  };

  return (
    <div className="space-y-3">
      <Field label="Prompt">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="input w-full"
          placeholder="描述你要的画面…"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="模型">
          <select
            value={model.id}
            onChange={(e) => {
              const m = MODEL_OPTIONS.find((x) => x.id === e.target.value);
              if (m) setModel(m);
              // 切模型时重置不兼容的开关
              setFastMode(false);
              setOutputFormat("");
            }}
            className="input w-full"
          >
            {MODEL_OPTIONS.filter((m) => modelCapabilities(m.id).groupGeneration).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="尺寸">
          <select value={size} onChange={(e) => setSize(e.target.value)} className="input w-full">
            {(caps.sizePresets ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label={`数量 (1-${caps.maxGroupImages})`}>
          <input
            type="number"
            min={1}
            max={caps.maxGroupImages}
            value={count}
            onChange={(e) =>
              setCount(Math.max(1, Math.min(caps.maxGroupImages, Number(e.target.value) || 1)))
            }
            className="input w-full"
          />
        </Field>
        {caps.fastMode && (
          <Field label="极速模式">
            <label className="flex items-center gap-1.5 h-[38px]">
              <input
                type="checkbox"
                checked={fastMode}
                onChange={(e) => setFastMode(e.target.checked)}
                className="accent-accent"
              />
              <span className="text-xs text-text-secondary">fast（牺牲画质换速度）</span>
            </label>
          </Field>
        )}
        {caps.outputFormats.length > 1 && (
          <Field label="输出格式">
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as "" | "png" | "jpeg")}
              className="input w-full"
            >
              <option value="">PNG（Y-agent 默认）</option>
              {caps.outputFormats.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Submit onClick={submit} disabled={!prompt.trim() || busy} />
    </div>
  );
}

function WebSearchForm({ projectId, onRun, busy }: FormProps) {
  const lite = MODEL_OPTIONS.find((m) => m.id === LITE_ID) ?? MODEL_OPTIONS[0];
  const caps = modelCapabilities(lite.id);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("2k");
  const [outputFormat, setOutputFormat] = useState<"" | "png" | "jpeg">("png");
  const submit = () => {
    if (!prompt.trim()) return;
    onRun((onProgress) =>
      runTool(
        {
          projectId,
          prompt: prompt.trim(),
          modelId: lite.id,
          modelName: lite.name,
          size,
          tools: ["web_search"],
          ...(outputFormat ? { outputFormat } : {}),
        },
        onProgress
      )
    );
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        5.0 Lite 会先调用联网搜索拉取实时信息（天气、商品、新闻等），再基于搜索结果出图。
        prompt 里描述清楚你想要的实时信息。
      </p>
      <Field label="Prompt">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="input w-full"
          placeholder="例如：上海今天天气晴，画一张街角的咖啡店"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="尺寸">
          <select value={size} onChange={(e) => setSize(e.target.value)} className="input w-full">
            {(caps.sizePresets ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        {caps.outputFormats.length > 1 && (
          <Field label="输出格式">
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as "" | "png" | "jpeg")}
              className="input w-full"
            >
              <option value="">PNG（Y-agent 默认）</option>
              {caps.outputFormats.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Submit onClick={submit} disabled={!prompt.trim() || busy} />
    </div>
  );
}

interface ImageFormProps extends FormProps {
  assets: Asset[];
}

function TransparentForm({ projectId, assets, onRun, busy }: ImageFormProps) {
  const caps = modelCapabilities(PRO_ID);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [prompt, setPrompt] = useState("保持主体不变，背景改为透明");
  const [size, setSize] = useState("2k");
  const [fastMode, setFastMode] = useState(false);
  const isJpeg = selectedAsset ? isAssetJpeg(selectedAsset) : false;
  const submit = () => {
    if (!sourceUrl || isJpeg) return;
    onRun((onProgress) =>
      runTool(
        {
          projectId,
          prompt: prompt.trim() || "保持主体不变，背景改为透明",
          modelId: PRO_ID,
          modelName: PRO_NAME,
          size,
          image: [sourceUrl],
          outputFormat: "png",
          background: "transparent",
          isTransparent: true,
          ...(fastMode ? { optimizePromptMode: "fast" as const } : {}),
        },
        onProgress
      )
    );
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        用 5.0 Pro 的 background: transparent 能力，输出 PNG 透明背景版本，适合做 UI 图标 / 素材。
        <span className="text-status-warn">⚠ 输入图必须是 PNG。</span>
      </p>
      <Field label="1. 选一张图（必须是 PNG）">
        {sourceUrl ? (
          <div className="flex items-center gap-2">
            <div className="w-16 h-16 rounded border border-border overflow-hidden">
              <img src={sourceUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <button onClick={() => setPickOpen(true)} className="btn text-xs">
              重选
            </button>
          </div>
        ) : (
          <button onClick={() => setPickOpen(true)} className="btn flex items-center gap-1">
            <ImagePlus className="w-3.5 h-3.5" /> 从资产库选图
          </button>
        )}
      </Field>
      {isJpeg && (
        <div
          className="flex items-start gap-2 px-3 py-2 rounded-md border text-xs"
          style={{
            backgroundColor: "color-mix(in srgb, var(--status-warn) 8%, transparent)",
            borderColor: "color-mix(in srgb, var(--status-warn) 28%, transparent)",
          }}
        >
          <AlertCircle
            className="w-4 h-4 flex-shrink-0 mt-0.5"
            style={{ color: "var(--status-warn)" }}
          />
          <div className="flex-1 text-text-secondary space-y-1">
            <div>
              <strong className="text-text-primary">这张图是 JPEG</strong>，5.0 Pro 的「背景透明」必须用 PNG。
            </div>
            <div>
              解决：① 在「批量组图」用 <strong>输出格式=PNG</strong> 重出一张；
              ② 或用「局部编辑」把这张图转一道再回来选。
            </div>
          </div>
        </div>
      )}
      <Field label="2. 描述怎么处理这张图（可改 prompt）">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="input w-full"
          placeholder="保持主体不变，背景改为透明"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="尺寸">
          <select value={size} onChange={(e) => setSize(e.target.value)} className="input w-full">
            {(caps.sizePresets ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        {caps.fastMode && (
          <Field label="极速模式">
            <label className="flex items-center gap-1.5 h-[38px]">
              <input
                type="checkbox"
                checked={fastMode}
                onChange={(e) => setFastMode(e.target.checked)}
                className="accent-accent"
              />
              <span className="text-xs text-text-secondary">fast</span>
            </label>
          </Field>
        )}
      </div>
      <Submit
        onClick={submit}
        disabled={!sourceUrl || isJpeg || busy}
        hint={isJpeg ? "请选一张 PNG 图" : undefined}
      />
      {pickOpen && (
        <AssetPicker
          assets={assets}
          onSelect={(asset, src) => {
            setSelectedAsset(asset);
            setSourceUrl(src);
            setPickOpen(false);
          }}
          onClose={() => setPickOpen(false)}
          title="选一张 PNG 图（去背后输出透明 PNG）"
        />
      )}
    </div>
  );
}

function LayerForm({ projectId, assets, onRun, busy }: ImageFormProps) {
  const caps = modelCapabilities(PRO_ID);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [prompt, setPrompt] = useState("将图像拆分为底图与可编辑图层");
  const [size, setSize] = useState("2k");
  const [fastMode, setFastMode] = useState(false);
  const submit = () => {
    if (!sourceUrl) return;
    onRun((onProgress) =>
      runTool(
        {
          projectId,
          prompt: prompt.trim() || "将图像拆分为底图与可编辑图层",
          modelId: PRO_ID,
          modelName: PRO_NAME,
          size,
          image: [sourceUrl],
          layerDecomposition: true,
          ...(fastMode ? { optimizePromptMode: "fast" as const } : {}),
        },
        onProgress
      )
    );
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        5.0 Pro 的 layer_decomposition 能力，把图拆为 1 张底图 + N 个可编辑图层。
        进入资产详情可看图层列表 / 隐藏 / 单图层导出。
      </p>
      <Field label="1. 选一张图">
        {sourceUrl ? (
          <div className="flex items-center gap-2">
            <div className="w-16 h-16 rounded border border-border overflow-hidden">
              <img src={sourceUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <button onClick={() => setPickOpen(true)} className="btn text-xs">
              重选
            </button>
          </div>
        ) : (
          <button onClick={() => setPickOpen(true)} className="btn flex items-center gap-1">
            <ImagePlus className="w-3.5 h-3.5" /> 从资产库选图
          </button>
        )}
      </Field>
      <Field label="2. 拆分指令（可改）">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="input w-full"
          placeholder="将图像拆分为底图与可编辑图层"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="尺寸">
          <select value={size} onChange={(e) => setSize(e.target.value)} className="input w-full">
            {(caps.sizePresets ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        {caps.fastMode && (
          <Field label="极速模式">
            <label className="flex items-center gap-1.5 h-[38px]">
              <input
                type="checkbox"
                checked={fastMode}
                onChange={(e) => setFastMode(e.target.checked)}
                className="accent-accent"
              />
              <span className="text-xs text-text-secondary">fast</span>
            </label>
          </Field>
        )}
      </div>
      <Submit onClick={submit} disabled={!sourceUrl || busy} />
      {pickOpen && (
        <AssetPicker
          assets={assets}
          onSelect={(_asset, src) => {
            setSourceUrl(src);
            setPickOpen(false);
          }}
          onClose={() => setPickOpen(false)}
          title="选一张要拆分的图"
        />
      )}
    </div>
  );
}

function LocalEditForm({ projectId, assets, onRun, busy }: ImageFormProps) {
  const caps = modelCapabilities(PRO_ID);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("2k");
  const [fastMode, setFastMode] = useState(false);
  // bbox 用图像素坐标（API 文档要求的格式）
  const [bbox, setBbox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null
  );
  // 用 ref 拿到 <img> 元素 + 自然像素尺寸
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // 屏幕坐标 → 图像素坐标
  const screenToImage = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img || !naturalSize.w || !naturalSize.h) return null;
    const rect = img.getBoundingClientRect();
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

  // 拖框：mousedown 起点，mousemove 更新，mouseup 结束
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    const pt = screenToImage(e.clientX, e.clientY);
    if (!pt) return;
    dragRef.current = pt;
    setBbox({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const pt = screenToImage(e.clientX, e.clientY);
      if (!pt) return;
      setBbox({
        x1: dragRef.current.x,
        y1: dragRef.current.y,
        x2: pt.x,
        y2: pt.y,
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // screenToImage 闭包内引用，每次 render 重新生成；监听器只在 naturalSize 变化时重绑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalSize]);

  const submit = () => {
    if (!sourceUrl || !bbox || !prompt.trim()) return;
    const finalPrompt = `${prompt.trim()} <bbox>${bbox.x1} ${bbox.y1} ${bbox.x2} ${bbox.y2}</bbox>`;
    onRun((onProgress) =>
      runTool(
        {
          projectId,
          prompt: finalPrompt,
          modelId: PRO_ID,
          modelName: PRO_NAME,
          size,
          image: [sourceUrl],
          bbox,
          ...(fastMode ? { optimizePromptMode: "fast" as const } : {}),
        },
        onProgress
      )
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        5.0 Pro 的局部编辑能力：选图 → 在图上拖框 → 描述要改的内容 → 重出图。
        prompt 自动按 5.0 Pro 文档的 &lt;bbox&gt;x1 y1 x2 y2&lt;/bbox&gt; 格式拼接（坐标是图像素）。
      </p>
      <Field label="1. 选一张图">
        {sourceUrl ? (
          <div className="space-y-2">
            <div className="relative inline-block max-w-full">
              <img
                ref={imgRef}
                src={sourceUrl}
                alt=""
                onLoad={(e) => {
                  setNaturalSize({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  });
                }}
                onMouseDown={onMouseDown}
                className="max-h-64 rounded border border-border cursor-crosshair select-none"
                draggable={false}
              />
              {bbox && naturalSize.w > 0 && (
                <div
                  className="absolute border-2 border-accent bg-accent/15 pointer-events-none"
                  style={{
                    left: `${(Math.min(bbox.x1, bbox.x2) / naturalSize.w) * 100}%`,
                    top: `${(Math.min(bbox.y1, bbox.y2) / naturalSize.h) * 100}%`,
                    width: `${(Math.abs(bbox.x2 - bbox.x1) / naturalSize.w) * 100}%`,
                    height: `${(Math.abs(bbox.y2 - bbox.y1) / naturalSize.h) * 100}%`,
                  }}
                >
                  <span className="absolute -top-5 left-0 bg-accent text-text-inverse text-[10px] px-1 py-0.5 rounded whitespace-nowrap">
                    [{Math.min(bbox.x1, bbox.x2)}, {Math.min(bbox.y1, bbox.y2)}, {Math.max(bbox.x1, bbox.x2)}, {Math.max(bbox.y1, bbox.y2)}]
                  </span>
                </div>
              )}
            </div>
            <div className="text-[10px] text-text-muted">
              {naturalSize.w > 0
                ? `源图 ${naturalSize.w}×${naturalSize.h}px · 在图上拖框选区域`
                : "等待图加载..."}
            </div>
            <div className="flex gap-1">
              <button onClick={() => setPickOpen(true)} className="btn text-xs">
                换图
              </button>
              <button
                onClick={() => setBbox(null)}
                className="btn text-xs"
                disabled={!bbox}
              >
                清除 bbox
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setPickOpen(true)} className="btn flex items-center gap-1">
            <ImagePlus className="w-3.5 h-3.5" /> 从资产库选图
          </button>
        )}
      </Field>
      <Field label="2. 描述要改成什么">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="input w-full"
          placeholder="例如：在这里加一束红色的玫瑰"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="尺寸">
          <select value={size} onChange={(e) => setSize(e.target.value)} className="input w-full">
            {(caps.sizePresets ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        {caps.fastMode && (
          <Field label="极速模式">
            <label className="flex items-center gap-1.5 h-[38px]">
              <input
                type="checkbox"
                checked={fastMode}
                onChange={(e) => setFastMode(e.target.checked)}
                className="accent-accent"
              />
              <span className="text-xs text-text-secondary">fast</span>
            </label>
          </Field>
        )}
      </div>
      <Submit
        onClick={submit}
        disabled={!sourceUrl || !bbox || !prompt.trim() || busy}
        hint={!bbox ? "需要在图上拖框" : undefined}
      />
      {pickOpen && (
        <AssetPicker
          assets={assets}
          onSelect={(_asset, src) => {
            setSourceUrl(src);
            setBbox(null);
            setNaturalSize({ w: 0, h: 0 });
            setPickOpen(false);
          }}
          onClose={() => setPickOpen(false)}
          title="选一张要改的图"
        />
      )}
    </div>
  );
}

// ============================================================================
// 公共小组件
// ============================================================================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-text-muted mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function Submit({
  onClick,
  disabled,
  hint,
}: {
  onClick: () => void;
  disabled: boolean;
  hint?: string;
}) {
  return (
    <div className="pt-2 flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={disabled}
        className="btn btn-primary flex items-center gap-1"
      >
        <Sparkles className="w-3.5 h-3.5" /> 生成
      </button>
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </div>
  );
}

// ============================================================================
// 雪碧图切分（P2）—— 不调即梦，纯本地 Rust 命令
// ============================================================================

interface SplitSpriteFormProps {
  busy: boolean;
}

function SplitSpriteForm({ busy }: SplitSpriteFormProps) {
  const toast = useToast();
  const [inputPath, setInputPath] = useState("");
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [outputDir, setOutputDir] = useState("");
  const [baseName, setBaseName] = useState("tile");
  const [outputZip, setOutputZip] = useState(true);
  const [lastResult, setLastResult] = useState<SplitResult | null>(null);

  const pickInput = async () => {
    const p = await openDialog({
      multiple: false,
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (typeof p === "string") {
      setInputPath(p);
      // 自动用源图所在目录作为输出目录
      if (!outputDir) {
        const dir = p.replace(/[\\/][^\\/]+$/, "");
        setOutputDir(dir);
      }
    }
  };

  const pickOutputDir = async () => {
    const p = await openDialog({ directory: true, multiple: false });
    if (typeof p === "string") setOutputDir(p);
  };

  const canRun =
    !busy &&
    !!inputPath &&
    rows >= 1 &&
    cols >= 1 &&
    !!outputDir;

  const onRun = async () => {
    try {
      const result = await splitSpriteSheet({
        inputPath,
        rows,
        cols,
        outputDir,
        baseName,
        outputZip,
      });
      setLastResult(result);
      toast.success(
        `已切出 ${result.tiles.length} 个 PNG` +
          (result.zipPath ? "，已打包 ZIP" : "")
      );
    } catch (e: any) {
      toast.error(`切分失败：${e?.message ?? e}`);
    }
  };

  const openContainingFolder = async (filePath: string) => {
    try {
      // 优先：用 explorer /select 打开所在文件夹并选中（Windows 体验最好）
      // fallback：shell.open 直接打开文件（macOS / Linux 走默认程序）
      const { open: shellOpen } = await import("@tauri-apps/plugin-shell");
      if (navigator.userAgent.includes("Windows")) {
        // Windows: explorer /select,"path" 高亮该文件
        const { Command } = await import("@tauri-apps/plugin-shell");
        await Command.create("explorer", ["/select,", filePath]).execute();
      } else {
        await shellOpen(filePath);
      }
    } catch (e: any) {
      toast.error(`打开失败：${e?.message ?? e}`);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        把一张「网格状」雪碧图按 <code>rows × cols</code> 切成多个独立 PNG。
        与 <code>ui-component-breakdown</code> 互补：后者输出独立组件（无需切图），
        本工具处理「一张网格图 → 多个独立 PNG + ZIP」的本地切图场景。
      </p>
      <Field label="1. 源图（PNG / JPG）">
        {inputPath ? (
          <div className="flex items-center gap-2">
            <span className="input flex-1 truncate text-xs" title={inputPath}>
              {inputPath}
            </span>
            <button onClick={pickInput} className="btn text-xs">重选</button>
          </div>
        ) : (
          <button onClick={pickInput} className="btn flex items-center gap-1">
            <ImagePlus className="w-3.5 h-3.5" /> 选择图片
          </button>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="行数 (rows)">
          <input
            type="number"
            min={1}
            value={rows}
            onChange={(e) => setRows(Math.max(1, Number(e.target.value) || 1))}
            className="input w-full"
          />
        </Field>
        <Field label="列数 (cols)">
          <input
            type="number"
            min={1}
            value={cols}
            onChange={(e) => setCols(Math.max(1, Number(e.target.value) || 1))}
            className="input w-full"
          />
        </Field>
      </div>
      <Field label="2. 输出目录">
        {outputDir ? (
          <div className="flex items-center gap-2">
            <span className="input flex-1 truncate text-xs" title={outputDir}>
              {outputDir}
            </span>
            <button onClick={pickOutputDir} className="btn text-xs">重选</button>
          </div>
        ) : (
          <button onClick={pickOutputDir} className="btn flex items-center gap-1">
            <ImagePlus className="w-3.5 h-3.5" /> 选择目录
          </button>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="文件名前缀">
          <input
            type="text"
            value={baseName}
            onChange={(e) => setBaseName(e.target.value.trim() || "tile")}
            className="input w-full"
            placeholder="tile"
          />
        </Field>
        <Field label="同时打包 ZIP">
          <label className="flex items-center gap-1.5 h-[38px]">
            <input
              type="checkbox"
              checked={outputZip}
              onChange={(e) => setOutputZip(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-xs text-text-secondary">
              切完后生成 <code>{baseName}.zip</code>
            </span>
          </label>
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onRun} disabled={!canRun} className="btn btn-primary flex items-center gap-1">
          <Scissors className="w-3.5 h-3.5" /> 切分
        </button>
        {inputPath && rows * cols > 0 && (
          <span className="text-xs text-text-muted">
            将切出 {rows * cols} 个文件
          </span>
        )}
      </div>
      {lastResult && (
        <div className="mt-3 panel p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-accent-success">
              切分成功 · {lastResult.tiles.length} 个 PNG
            </div>
            <span className="text-[10px] text-text-muted">
              源图 {lastResult.sourceWidth}×{lastResult.sourceHeight} ·{" "}
              {lastResult.rows}×{lastResult.cols}
            </span>
          </div>
          {lastResult.zipPath && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-muted">ZIP：</span>
              <code className="flex-1 truncate" title={lastResult.zipPath}>
                {lastResult.zipPath}
              </code>
              <button
                onClick={() => openContainingFolder(lastResult.zipPath!)}
                className="btn text-xs"
              >
                打开位置
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
