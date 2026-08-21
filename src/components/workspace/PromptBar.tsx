import {
  ArrowUp,
  Plus,
  X,
  Layers,
  Search,
  Zap,
  Droplet,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { MODEL_OPTIONS, modelCapabilities, type ModelOption } from "@/lib/types";
import SizeSelect from "@/components/workspace/SizeSelect";
import ModelSelect from "@/components/workspace/ModelSelect";
import { pickImageAsDataUrl } from "@/lib/image-file";
import SkillPicker from "@/components/workspace/SkillPicker";
import type { Skill } from "@/lib/skill";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

interface Props {
  prompt: string;
  setPrompt: (v: string) => void;
  refs: string[];
  setRefs: (updater: (prev: string[]) => string[]) => void;
  model: ModelOption;
  setModel: (m: ModelOption) => void;
  size: string;
  setSize: (s: string) => void;
  groupCount: number;
  setGroupCount: Dispatch<SetStateAction<number>>;
  layerDecomp: boolean;
  setLayerDecomp: (b: boolean) => void;
  // P0 新增：能力位开关
  webSearch: boolean;
  setWebSearch: (b: boolean) => void;
  fastMode: boolean;
  setFastMode: (b: boolean) => void;
  outputFormat: "png" | "jpeg" | "";
  setOutputFormat: Dispatch<SetStateAction<"png" | "jpeg" | "">>;
  transparent: boolean;
  setTransparent: (b: boolean) => void;
  generating: boolean;
  /** 当前输入模式：决定底部 "正在..." 提示文案 */
  inputMode?: "chat" | "generate" | "tools";
  onSubmit: () => void;
}

export default function PromptBar({
  prompt,
  setPrompt,
  refs,
  setRefs,
  model,
  setModel,
  size,
  setSize,
  groupCount,
  setGroupCount,
  layerDecomp,
  setLayerDecomp,
  webSearch,
  setWebSearch,
  fastMode,
  setFastMode,
  outputFormat,
  setOutputFormat,
  transparent,
  setTransparent,
  generating,
  inputMode = "generate",
  onSubmit,
}: Props) {
  const toast = useToast();
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // 能力位驱动：模型换了之后，不支持的开关要重置
  const caps = modelCapabilities(model.id);

  useEffect(() => {
    setGroupCount((prev) => Math.max(1, Math.min(caps.maxGroupImages, prev)));
    if (!caps.webSearch) setWebSearch(false);
    if (!caps.fastMode) setFastMode(false);
    if (!caps.background) setTransparent(false);
    if (!caps.layerDecomposition) setLayerDecomp(false);
    setOutputFormat((prev) =>
      prev === "" || caps.outputFormats.includes(prev) ? prev : ""
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id]);

  const onPickRef = async () => {
    try {
      const dataUrl = await pickImageAsDataUrl();
      if (!dataUrl) return;
      if (refs.length >= caps.maxInputImages) {
        toast.warn(`当前模型最多 ${caps.maxInputImages} 张参考图`);
        return;
      }
      setRefs((p) => [...p, dataUrl]);
    } catch (e: any) {
      toast.error(`读取图片失败：${e?.message ?? e}`);
    }
  };

  // 监听输入：末尾是 / 触发 Skill picker
  const onInputChange = (v: string) => {
    setPrompt(v);
    if (v.endsWith("/") || /^\/[\w-]*$/.test(v)) {
      setShowSkillPicker(true);
    } else {
      setShowSkillPicker(false);
    }
  };

  const onSkillSelect = (skill: Skill) => {
    setPrompt(`/${skill.id} `);
    setShowSkillPicker(false);
  };

  const pickerQuery = (() => {
    if (prompt.endsWith("/")) return "";
    const m = prompt.match(/^\/([\w-]*)$/);
    return m ? m[1] : "";
  })();

  // "更多"面板里被打开的能力位数量（角标）
  const activeToggles = [
    caps.groupGeneration && groupCount > 1,
    caps.layerDecomposition && layerDecomp,
    caps.webSearch && webSearch,
    caps.fastMode && fastMode,
    caps.outputFormats.length > 1 && outputFormat !== "",
    caps.background && transparent,
  ].filter(Boolean).length;

  return (
    <div className="space-y-3 relative">
      {refs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {refs.map((r, i) => (
            <div key={i} className="relative group w-12 h-12 rounded overflow-hidden border border-border">
              <img src={r} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => setRefs((p) => p.filter((_, idx) => idx !== i))}
                className="absolute top-0 right-0 bg-black/60 text-white p-0.5
                  opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showSkillPicker && (
        <SkillPicker
          query={pickerQuery}
          onSelect={onSkillSelect}
          onClose={() => setShowSkillPicker(false)}
        />
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 panel p-3 space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (showSkillPicker) return; // 让 picker 处理键盘
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="描述画面，按 / 选 Skill；Ctrl+Enter 发送"
            rows={3}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted
              focus:outline-none resize-none"
          />
          {/* 主行：加参考图 / 模型 / 尺寸 / 更多 / 生成 */}
          <div className="flex items-center gap-2 pt-1 border-t border-border flex-wrap">
            <button
              className="btn-icon"
              title={`添加参考图（最多 ${caps.maxInputImages} 张，单张 ≤ 8MB）`}
              onClick={onPickRef}
            >
              <Plus className="w-4 h-4" />
            </button>
            <ModelSelect value={model} onChange={setModel} />
            <SizeSelect value={size} onChange={setSize} modelId={model.id} />
            {/* "更多"折叠按钮 — 默认收起，角标显示已开启能力位数 */}
            <button
              onClick={() => setShowMore((s) => !s)}
              className={`btn text-xs h-7 px-2.5 relative ${
                showMore ? "bg-bg-hover" : ""
              }`}
              title="更多能力位"
            >
              更多
              {activeToggles > 0 && (
                <span
                  className="ml-1 px-1.5 h-4 min-w-[16px] rounded-full
                    bg-accent text-text-inverse text-[10px] font-semibold
                    flex items-center justify-center tabular-nums"
                >
                  {activeToggles}
                </span>
              )}
              <ChevronDown
                className={`w-3 h-3 text-text-muted ml-1 transition-transform ${
                  showMore ? "rotate-180" : ""
                }`}
              />
            </button>
            <div className="flex-1" />
          </div>
          {/* 折叠面板：能力位开关。默认收起。 */}
          {showMore && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 pt-2 border-t border-border">
              {caps.groupGeneration && (
                <Field label={`数量 (1-${caps.maxGroupImages})`}>
                  <input
                    type="number"
                    min={1}
                    max={caps.maxGroupImages}
                    value={groupCount}
                    onChange={(e) =>
                      setGroupCount(
                        Math.max(1, Math.min(caps.maxGroupImages, Number(e.target.value) || 1))
                      )
                    }
                    className="input text-sm"
                  />
                </Field>
              )}
              {caps.layerDecomposition && (
                <Field label="拆分图层" hint="仅 5.0 Pro">
                  <label className="flex items-center gap-1.5 h-[38px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layerDecomp}
                      onChange={(e) => setLayerDecomp(e.target.checked)}
                      className="accent-accent"
                    />
                    <Layers className="w-3.5 h-3.5 text-text-muted" />
                    <span className="text-xs text-text-secondary">拆为底图 + 图层</span>
                  </label>
                </Field>
              )}
              {caps.webSearch && (
                <Field label="联网搜索" hint="5.0 Lite">
                  <label className="flex items-center gap-1.5 h-[38px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webSearch}
                      onChange={(e) => setWebSearch(e.target.checked)}
                      className="accent-accent"
                    />
                    <Search className="w-3.5 h-3.5 text-text-muted" />
                    <span className="text-xs text-text-secondary">先搜再画</span>
                  </label>
                </Field>
              )}
              {caps.fastMode && (
                <Field label="极速模式" hint="5.0 Pro / 4.0">
                  <label className="flex items-center gap-1.5 h-[38px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fastMode}
                      onChange={(e) => setFastMode(e.target.checked)}
                      className="accent-accent"
                    />
                    <Zap className="w-3.5 h-3.5 text-text-muted" />
                    <span className="text-xs text-text-secondary">牺牲画质换速度</span>
                  </label>
                </Field>
              )}
              {caps.outputFormats.length > 1 && (
                <Field label="输出格式">
                  <select
                    value={outputFormat}
                    onChange={(e) => {
                      const v = e.target.value as "png" | "jpeg" | "";
                      setOutputFormat(v);
                      // P4：切到 jpeg 时若 transparent 开了，强制关掉
                      if (v === "jpeg" && transparent) setTransparent(false);
                    }}
                    className="input text-sm"
                  >
                    <option value="">PNG</option>
                    {caps.outputFormats.map((f) => (
                      <option key={f} value={f}>
                        {f.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {caps.background && (
                <Field
                  label="透明背景"
                  hint="5.0 Pro"
                  disabled={outputFormat === "jpeg"}
                  disabledHint="需要 PNG 输出"
                >
                  <label
                    className={`flex items-center gap-1.5 h-[38px] ${
                      outputFormat === "jpeg" ? "opacity-40" : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={transparent}
                      onChange={(e) => {
                        setTransparent(e.target.checked);
                        if (e.target.checked && outputFormat !== "png") {
                          setOutputFormat("png"); // transparent 强制 png
                        }
                      }}
                      className="accent-accent"
                      disabled={outputFormat === "jpeg"}
                    />
                    <Droplet className="w-3.5 h-3.5 text-text-muted" />
                    <span className="text-xs text-text-secondary">PNG 透明背景</span>
                  </label>
                </Field>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onSubmit}
          disabled={generating}
          className="btn btn-primary h-[88px] w-12 flex flex-col items-center justify-center"
          title={
            generating
              ? "生成中…"
              : inputMode === "chat"
              ? "发送给 Agent"
              : "生成图片"
          }
        >
          {generating ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <ArrowUp className="w-5 h-5" />
          )}
          <span className="text-[10px] mt-1">生成</span>
        </button>
      </div>
    </div>
  );
}

/** "更多"面板里的字段：label + 控件 + 可选 hint/disabled 提示 */
function Field({
  label,
  hint,
  disabled,
  disabledHint,
  children,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  disabledHint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-text-muted">{label}</span>
        {hint && <span className="text-[10px] text-text-muted/70">{hint}</span>}
      </div>
      <div
        className={disabled ? "pointer-events-none" : ""}
        title={disabled ? disabledHint : undefined}
      >
        {children}
      </div>
    </div>
  );
}

// Re-export MODEL_OPTIONS for callers that need it
export { MODEL_OPTIONS };
