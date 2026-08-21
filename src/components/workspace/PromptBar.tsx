import { ArrowUp, Plus, X, Layers, Search, Zap, Image as ImageIcon, Droplet } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { MODEL_OPTIONS, modelCapabilities, type ModelOption } from "@/lib/types";
import SizeSelect from "@/components/workspace/SizeSelect";
import ModelSelect from "@/components/workspace/ModelSelect";
import { pickImageAsDataUrl } from "@/lib/image-file";
import SkillPicker from "@/components/workspace/SkillPicker";
import type { Skill } from "@/lib/skill";
import { useState } from "react";

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
  setGroupCount: (n: number) => void;
  layerDecomp: boolean;
  setLayerDecomp: (b: boolean) => void;
  // P0 新增：能力位开关
  webSearch: boolean;
  setWebSearch: (b: boolean) => void;
  fastMode: boolean;
  setFastMode: (b: boolean) => void;
  outputFormat: "png" | "jpeg" | "";
  setOutputFormat: (f: "png" | "jpeg" | "") => void;
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

  // 能力位驱动：模型换了之后，不支持的开关要重置
  const caps = modelCapabilities(model.id);

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

      <div className="flex items-end gap-3">
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
            placeholder="描述你要生成的画面...输入 / 触发 Skill 面板（Ctrl+Enter 发送）"
            rows={3}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted
              focus:outline-none resize-none"
          />
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
            {caps.groupGeneration && (
              <label className="text-xs text-text-secondary flex items-center gap-1.5">
                数量
                <input
                  type="number"
                  min={1}
                  max={caps.maxGroupImages}
                  value={groupCount}
                  onChange={(e) =>
                    setGroupCount(Math.max(1, Math.min(caps.maxGroupImages, Number(e.target.value) || 1)))
                  }
                  className="w-12 input text-center"
                />
              </label>
            )}
            {caps.layerDecomposition && (
              <label
                className="text-xs text-text-secondary flex items-center gap-1.5 cursor-pointer"
                title="将参考图拆为底图 + 多个图层（仅 5.0 Pro）"
              >
                <input
                  type="checkbox"
                  checked={layerDecomp}
                  onChange={(e) => setLayerDecomp(e.target.checked)}
                  className="accent-accent"
                />
                <Layers className="w-3.5 h-3.5" />
                拆分图层
              </label>
            )}
            {/* P0：能力位开关（按 caps 显隐） */}
            {caps.webSearch && (
              <label
                className="text-xs text-text-secondary flex items-center gap-1.5 cursor-pointer"
                title="联网搜索：模型会先搜互联网再出图（天气、商品等实时信息）"
              >
                <input
                  type="checkbox"
                  checked={webSearch}
                  onChange={(e) => setWebSearch(e.target.checked)}
                  className="accent-accent"
                />
                <Search className="w-3.5 h-3.5" />
                联网
              </label>
            )}
            {caps.fastMode && (
              <label
                className="text-xs text-text-secondary flex items-center gap-1.5 cursor-pointer"
                title="极速模式：牺牲一点画质换速度（仅 5.0 Pro / 4.0）"
              >
                <input
                  type="checkbox"
                  checked={fastMode}
                  onChange={(e) => setFastMode(e.target.checked)}
                  className="accent-accent"
                />
                <Zap className="w-3.5 h-3.5" />
                极速
              </label>
            )}
            {caps.outputFormats.length > 1 && (
              <label
                className="text-xs text-text-secondary flex items-center gap-1.5 cursor-pointer"
                title="输出文件格式（4.5/4.0 仅 JPEG）"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <select
                  value={outputFormat}
                  onChange={(e) => {
                    const v = e.target.value as "png" | "jpeg" | "";
                    setOutputFormat(v);
                    // P4：切到 jpeg 时若 transparent 开了，强制关掉
                    if (v === "jpeg" && transparent) setTransparent(false);
                  }}
                  className="text-xs bg-bg-elev border border-border rounded px-1.5 py-0.5
                    text-text-primary focus:outline-none focus:border-accent"
                >
                  <option value="">PNG（Y-agent 默认）</option>
                  {caps.outputFormats.map((f) => (
                    <option key={f} value={f}>
                      {f.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {caps.background && (
              <label
                className={`text-xs text-text-secondary flex items-center gap-1.5 cursor-pointer ${
                  outputFormat === "jpeg" ? "opacity-40" : ""
                }`}
                title={
                  outputFormat === "jpeg"
                    ? "透明背景需要 PNG 输出，请先把格式切到 PNG"
                    : "输出 PNG 透明背景（仅 5.0 Pro 图生图场景）"
                }
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
                <Droplet className="w-3.5 h-3.5" />
                透明背景
              </label>
            )}
            <div className="flex-1" />
          </div>
        </div>
        <button
          onClick={onSubmit}
          disabled={generating}
          className="btn btn-primary h-[88px] w-12 flex flex-col items-center justify-center"
          title="生成"
        >
          <ArrowUp className="w-5 h-5" />
          <span className="text-[10px] mt-1">生成</span>
        </button>
      </div>
      {generating && (
        <p className="text-xs text-text-secondary text-center animate-pulse">
          {inputMode === "chat"
            ? "Agent 处理中…（LLM 流式输出 / 工具调用）"
            : inputMode === "generate"
            ? "正在调用即梦 API，请稍候（最多 ~3 分钟）…"
            : "工具执行中…"}
        </p>
      )}
    </div>
  );
}

// Re-export MODEL_OPTIONS for callers that need it
export { MODEL_OPTIONS };
