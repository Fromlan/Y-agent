import {
  ArrowUp,
  Plus,
  X,
  Layers,
  Search,
  Zap,
  Droplet,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { MODEL_OPTIONS, modelCapabilities, type CharacterArchive, type ModelOption } from "@/lib/types";
import SizeSelect from "@/components/workspace/SizeSelect";
import ModelSelect from "@/components/workspace/ModelSelect";
import { pickImageAsDataUrl } from "@/lib/image-file";
import { resolveImageUrl } from "@/lib/image-resolver";
import { listAssets } from "@/lib/assets";
import SkillPicker from "@/components/workspace/SkillPicker";
import CharacterArchivePicker from "@/components/workspace/CharacterArchivePicker";
import { CapabilityChip, QuantityGroup } from "@/components/workspace/CapabilityChip";
import type { Skill } from "@/lib/skill";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  CompactButton,
  ControlCell,
  ParamCell,
  ToolbarDivider,
  useAutoResizeTextarea,
} from "@/components/workspace/BarPrimitives";

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
  inputMode?: "chat" | "generate" | "tools" | "characters";
  /** M3.6：当前项目 id(给 CharacterArchivePicker 做真实 projectId 过滤用) */
  projectId: string;
  /** M3：当前项目下可见的角色档案（含 scope=global），由上层 ProjectDetail 持有 */
  archives: CharacterArchive[];
  /** M3：当前选中的角色档案 id（null = 未选） */
  selectedArchiveId: string | null;
  setSelectedArchiveId: (id: string | null) => void;
  /** M3：点 picker 底部"去角色工坊"时切到 characters tab */
  onOpenCharacterWorkshop?: () => void;
  /** M3：picker 内新建/删除档案后回调（让上层 reload archives） */
  onArchivesChanged?: () => void;
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
  projectId,
  archives,
  selectedArchiveId,
  setSelectedArchiveId,
  onOpenCharacterWorkshop,
  onArchivesChanged,
  onSubmit,
}: Props) {
  const toast = useToast();
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  // M-7: 拖入资产时的视觉反馈
  const [dragHover, setDragHover] = useState(false);
  const taRef = useAutoResizeTextarea(prompt, { minRows: 1, maxRows: 6 });

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

  // M-7: 接受从 AssetCard 拖入的资产(text/plain = asset id)
  const onDropAsset = async (assetId: string) => {
    if (refs.length >= caps.maxInputImages) {
      toast.warn(`当前模型最多 ${caps.maxInputImages} 张参考图`);
      return;
    }
    try {
      // 从项目所有资产里找(不只当前列表,保险)
      const all = await listAssets(projectId);
      const asset = all.find((a) => a.id === assetId);
      if (!asset) {
        toast.warn("未找到该资产");
        return;
      }
      // 取主图 URL,resolve 成浏览器可读 src,再转 dataURL 喂给 refs
      const url = asset.payload.localPaths?.[0] || asset.payload.urls?.[0] || "";
      if (!url) {
        toast.warn("该资产无可用图片");
        return;
      }
      const resolved = await resolveImageUrl(url);
      // resolveImageUrl 已经返回 asset:// URL,直接放 refs
      setRefs((p) => [...p, resolved]);
      toast.success(`已添加「${asset.prompt.slice(0, 20)}…」为参考图`);
    } catch (e: any) {
      toast.error(`添加参考图失败：${e?.message ?? e}`);
    }
  };

  // 接受 text/uri-list 或直接是 URL/data: 的拖入
  const onDropDataUrl = (url: string) => {
    if (refs.length >= caps.maxInputImages) {
      toast.warn(`当前模型最多 ${caps.maxInputImages} 张参考图`);
      return;
    }
    setRefs((p) => [...p, url]);
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

  // O-2: 现在能力位都直接展示,不再需要 activeToggles 计数
  // (保留位置以便后续如需"已用能力位 X 项"标识)
  void caps;

  return (
    <div className="space-y-2.5 relative">
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
          hasSelectedArchive={!!selectedArchiveId}
        />
      )}

      <div className="flex items-end gap-2">
        <div
          className={`flex-1 panel px-3 py-2 space-y-2 relative transition-colors ${
            dragHover ? "ring-2 ring-accent ring-offset-1 ring-offset-bg-base" : ""
          }`}
          onDragOver={(e) => {
            // M-7: 接 asset drag
            if (e.dataTransfer.types.includes("text/plain") ||
                e.dataTransfer.types.includes("text/uri-list")) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              if (!dragHover) setDragHover(true);
            }
          }}
          onDragLeave={(e) => {
            // 只有离开 panel 自身才清(子元素 dragleave 不会清)
            if (e.currentTarget === e.target) setDragHover(false);
          }}
          onDrop={async (e) => {
            e.preventDefault();
            setDragHover(false);
            // 1) text/plain (AssetCard drag) 解析 asset id
            const assetId = e.dataTransfer.getData("text/plain") ||
                            e.dataTransfer.getData("asset-id");
            if (assetId) {
              await onDropAsset(assetId);
              return;
            }
            // 2) 浏览器拖图(text/uri-list / 直接 data:)
            const uri = e.dataTransfer.getData("text/uri-list") ||
                        e.dataTransfer.getData("text/plain");
            if (uri && (uri.startsWith("data:") || uri.startsWith("http"))) {
              onDropDataUrl(uri);
            }
          }}
        >
          <textarea
            ref={taRef}
            value={prompt}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (showSkillPicker) return; // 让 picker 处理键盘
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="描述画面，按 / 选 Skill；Ctrl+Enter 发送；可拖入资产作为参考图"
            rows={1}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted
              focus:outline-none resize-none leading-[20px]"
          />
          {dragHover && (
            <div className="absolute inset-0 flex items-center justify-center bg-accent/10
              border-2 border-dashed border-accent rounded pointer-events-none z-10">
              <span className="text-xs text-accent font-medium bg-bg-panel px-2 py-1 rounded">
                放开以加入参考图
              </span>
            </div>
          )}
          {/* 单行工具栏：参考 │ 角色 │ 模型/尺寸 */}
          <div className="flex items-center gap-1 pt-1.5 border-t border-border flex-wrap">
            <CompactButton
              title={`添加参考图（最多 ${caps.maxInputImages} 张，单张 ≤ 8MB）`}
              onClick={onPickRef}
              active={refs.length > 0}
            >
              <Plus className="w-4 h-4" />
              {refs.length > 0 && (
                <span className="ml-1 text-[10px] tabular-nums">{refs.length}</span>
              )}
            </CompactButton>

            <ToolbarDivider />

            {/* M3：角色档案下拉（在模型/尺寸前，跟"输入内容"分组） */}
            <CharacterArchivePicker
              projectId={projectId}
              archives={archives}
              selectedId={selectedArchiveId}
              onSelect={setSelectedArchiveId}
              onOpenWorkshop={onOpenCharacterWorkshop}
              onArchiveChanged={onArchivesChanged}
            />

            <ToolbarDivider />

            <ParamCell label="模型" bare>
              <ModelSelect value={model} onChange={setModel} />
            </ParamCell>
            <ParamCell label="尺寸" bare>
              <SizeSelect value={size} onChange={setSize} modelId={model.id} />
            </ParamCell>
          </div>

          {/* O-2: 能力位 chip 行 — 默认全部展开,不用"高级"折叠 */}
          {(() => {
            const hasAny =
              caps.groupGeneration ||
              caps.layerDecomposition ||
              caps.webSearch ||
              caps.fastMode ||
              caps.outputFormats.length > 1 ||
              caps.background;
            if (!hasAny) return null;
            return (
              <div className="flex items-center gap-1.5 pt-1.5 border-t border-border flex-wrap">
                {caps.groupGeneration && (
                  <>
                    <span className="text-[10px] text-text-muted">数量</span>
                    <QuantityGroup
                      value={groupCount}
                      max={caps.maxGroupImages}
                      onChange={setGroupCount}
                    />
                  </>
                )}
                {caps.layerDecomposition && (
                  <CapabilityChip
                    icon={<Layers className="w-3 h-3" />}
                    label="拆图层"
                    title="仅 5.0 Pro 支持"
                    active={layerDecomp}
                    onClick={() => setLayerDecomp(!layerDecomp)}
                  />
                )}
                {caps.webSearch && (
                  <CapabilityChip
                    icon={<Search className="w-3 h-3" />}
                    label="联网"
                    title="5.0 Lite 支持"
                    active={webSearch}
                    onClick={() => setWebSearch(!webSearch)}
                  />
                )}
                {caps.fastMode && (
                  <CapabilityChip
                    icon={<Zap className="w-3 h-3" />}
                    label="极速"
                    title="5.0 Pro / 4.0 支持"
                    active={fastMode}
                    onClick={() => setFastMode(!fastMode)}
                  />
                )}
                {caps.outputFormats.length > 1 && (
                  <ControlCell title="输出格式">
                    <select
                      value={outputFormat}
                      onChange={(e) => {
                        const v = e.target.value as "png" | "jpeg" | "";
                        setOutputFormat(v);
                        if (v === "jpeg" && transparent) setTransparent(false);
                      }}
                      className="text-[11px] bg-bg-elev border border-border rounded px-1.5 h-6
                        text-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value="">PNG</option>
                      {caps.outputFormats.map((f) => (
                        <option key={f} value={f}>
                          {f.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </ControlCell>
                )}
                {caps.background && (
                  <CapabilityChip
                    icon={<Droplet className="w-3 h-3" />}
                    label="透明"
                    title={outputFormat === "jpeg" ? "需要 PNG 输出" : "5.0 Pro 支持"}
                    active={transparent}
                    disabled={outputFormat === "jpeg"}
                    onClick={() => {
                      const next = !transparent;
                      setTransparent(next);
                      if (next && outputFormat !== "png") setOutputFormat("png");
                    }}
                  />
                )}
              </div>
            );
          })()}
        </div>

        {/* 生成按钮 · 40×40 圆形，与工具栏同高 */}
        <button
          onClick={onSubmit}
          disabled={generating}
          className="h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center
            bg-accent hover:bg-accent-hover text-text-inverse
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={
            generating
              ? "生成中…"
              : inputMode === "chat"
              ? "发送给 Agent"
              : "生成图片"
          }
          aria-label="生成"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowUp className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

// Re-export MODEL_OPTIONS for callers that need it
export { MODEL_OPTIONS };
