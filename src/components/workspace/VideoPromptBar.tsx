import {
  ArrowUp,
  Plus,
  X,
  ChevronDown,
  Loader2,
  Image as ImageIcon,
  Info,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/shared/Toast";
import { pickImageAsDataUrl } from "@/lib/image-file";
import {
  detectVideoScenario,
  validateAndFixParams,
  type ContentItem,
  type VideoRatio,
  type VideoResolution,
} from "@/lib/video";
import {
  CompactButton,
  ControlCell,
  ParamCell,
  ScenarioChip,
  ToolbarDivider,
  useAutoResizeTextarea,
} from "@/components/workspace/BarPrimitives";

/** 视频 API 的 ratio 选项（i2va 强制 adaptive，所以 i2va 模式下隐藏 ratio 控件） */
const RATIO_OPTIONS: VideoRatio[] = [
  "21:9",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
];
const RESOLUTION_OPTIONS: VideoResolution[] = ["768P", "2K"];

interface Props {
  prompt: string;
  setPrompt: (v: string) => void;
  content: ContentItem[];
  setContent: (updater: (prev: ContentItem[]) => ContentItem[]) => void;
  resolution: VideoResolution;
  setResolution: (r: VideoResolution) => void;
  duration: number;
  setDuration: (n: number) => void;
  ratio: VideoRatio | "auto";
  setRatio: (r: VideoRatio | "auto") => void;
  watermark: boolean;
  setWatermark: (b: boolean) => void;
  /** P9：是否启用 H3-Context-IR 提示词增强。默认 ON。Optional: 旧调用点不传时按 ON 处理。 */
  optimizePrompt?: boolean;
  setOptimizePrompt?: (b: boolean) => void;
  generating: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
}

export default function VideoPromptBar({
  prompt,
  setPrompt,
  content,
  setContent,
  resolution,
  setResolution,
  duration,
  setDuration,
  ratio,
  setRatio,
  watermark,
  setWatermark,
  optimizePrompt = true,
  setOptimizePrompt = () => {},
  generating,
  onSubmit,
  onCancel,
}: Props) {
  const toast = useToast();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const taRef = useAutoResizeTextarea(prompt, { minRows: 1, maxRows: 6 });

  // 场景自适应：根据 content 自动判定 + ratio 控件可用性
  const scenario = detectVideoScenario(content);
  const isI2va = scenario === "i2va";
  const isInvalid = scenario === "invalid";

  // i2va 模式：ratio 强制 adaptive（前端 UI 上禁用 ratio 控件）
  useEffect(() => {
    if (isI2va && ratio !== "auto") {
      setRatio("auto");
    }
  }, [isI2va, ratio, setRatio]);

  // === 参考素材槽位 helpers ===

  const firstFrame = content.find(
    (c) => c.type === "image_url" && c.role === "first_frame"
  );
  const lastFrame = content.find(
    (c) => c.type === "image_url" && c.role === "last_frame"
  );
  const refImages = content.filter(
    (c) => c.type === "image_url" && c.role === "reference_image"
  );
  const refVideo = content.find(
    (c) => c.type === "video_url" && c.role === "reference_video"
  );
  const refAudio = content.find(
    (c) => c.type === "audio_url" && c.role === "reference_audio"
  );

  const addFirstFrame = async () => {
    try {
      const dataUrl = await pickImageAsDataUrl();
      if (!dataUrl) return;
      // 替换已有的 first_frame（单图槽位）
      setContent((prev) => [
        ...prev.filter(
          (c) => !(c.type === "image_url" && c.role === "first_frame")
        ),
        {
          type: "image_url",
          image_url: { url: dataUrl },
          role: "first_frame",
        },
      ]);
    } catch (e: any) {
      toast.error(`读取图片失败：${e?.message ?? e}`);
    }
  };

  const addLastFrame = async () => {
    try {
      const dataUrl = await pickImageAsDataUrl();
      if (!dataUrl) return;
      setContent((prev) => [
        ...prev.filter(
          (c) => !(c.type === "image_url" && c.role === "last_frame")
        ),
        {
          type: "image_url",
          image_url: { url: dataUrl },
          role: "last_frame",
        },
      ]);
    } catch (e: any) {
      toast.error(`读取图片失败：${e?.message ?? e}`);
    }
  };

  const addRefImage = async () => {
    try {
      const dataUrl = await pickImageAsDataUrl();
      if (!dataUrl) return;
      // 多模态参考可加 1-9 张图（API 限制）
      if (refImages.length >= 9) {
        toast.warn("多模态参考图最多 9 张");
        return;
      }
      setContent((prev) => [
        ...prev,
        {
          type: "image_url",
          image_url: { url: dataUrl },
          role: "reference_image",
        },
      ]);
    } catch (e: any) {
      toast.error(`读取图片失败：${e?.message ?? e}`);
    }
  };

  const removeItem = (predicate: (c: ContentItem) => boolean) => {
    setContent((prev) => prev.filter((c) => !predicate(c)));
  };

  // 参考视频/音频：r2va 必传 URL（外链）
  const [videoUrlInput, setVideoUrlInput] = useState(
    refVideo?.type === "video_url" ? refVideo.video_url.url : ""
  );
  const [audioUrlInput, setAudioUrlInput] = useState(
    refAudio?.type === "audio_url" ? refAudio.audio_url.url : ""
  );

  const setRefVideo = (url: string) => {
    setVideoUrlInput(url);
    if (url.trim()) {
      setContent((prev) => [
        ...prev.filter(
          (c) => !(c.type === "video_url" && c.role === "reference_video")
        ),
        { type: "video_url", video_url: { url: url.trim() }, role: "reference_video" },
      ]);
    } else {
      removeItem((c) => c.type === "video_url" && c.role === "reference_video");
    }
  };

  const setRefAudio = (url: string) => {
    setAudioUrlInput(url);
    if (url.trim()) {
      setContent((prev) => [
        ...prev.filter(
          (c) => !(c.type === "audio_url" && c.role === "reference_audio")
        ),
        { type: "audio_url", audio_url: { url: url.trim() }, role: "reference_audio" },
      ]);
    } else {
      removeItem((c) => c.type === "audio_url" && c.role === "reference_audio");
    }
  };

  // === 提交前置校验 ===
  const onSubmitClick = () => {
    if (!prompt.trim()) {
      toast.warn("请输入提示词");
      return;
    }
    if (isInvalid) {
      toast.error("图生视频（首尾帧）与多模态参考不能混用");
      return;
    }
    // 用 video.ts 的统一校验
    const fixedRatio = ratio === "auto" ? undefined : ratio;
    const result = validateAndFixParams({
      model: "MiniMax-H3",
      content: [
        ...content,
        { type: "text", text: prompt.trim() } as ContentItem,
      ],
      resolution,
      duration,
      ratio: fixedRatio,
      aigcWatermark: watermark || undefined,
    });
    if (!result.ok) {
      toast.warn(result.reason);
      return;
    }
    onSubmit();
  };

  // 场景名称 + 色调
  const scenarioLabel: Record<typeof scenario, string> = {
    t2va: "文生视频",
    i2va: "图生视频（首/尾帧）",
    r2va: "多模态参考生视频",
    invalid: "场景冲突（清空首尾帧或多模态参考）",
  };
  const scenarioTone = isInvalid ? "danger" : scenario === "t2va" ? "muted" : "active";

  return (
    <div className="space-y-2.5 relative">
      {/* 场景提示 · 紧凑 chip */}
      <div className="flex items-center gap-2">
        <ScenarioChip label={scenarioLabel[scenario]} tone={scenarioTone} />
        {isInvalid && (
          <span className="text-[11px] text-accent-danger">
            （请清空其中一种素材）
          </span>
        )}
      </div>

      {/* 参考素材预览条（首帧/尾帧/多模态参考图） */}
      {(firstFrame || lastFrame || refImages.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {firstFrame && firstFrame.type === "image_url" && (
            <Thumb
              src={firstFrame.image_url.url}
              label="首帧"
              onRemove={() => removeItem((c) => c.type === "image_url" && c.role === "first_frame")}
            />
          )}
          {lastFrame && lastFrame.type === "image_url" && (
            <Thumb
              src={lastFrame.image_url.url}
              label="尾帧"
              onRemove={() => removeItem((c) => c.type === "image_url" && c.role === "last_frame")}
            />
          )}
          {refImages.map((img, i) =>
            img.type === "image_url" ? (
              <Thumb
                key={`ref-img-${i}`}
                src={img.image_url.url}
                label={`参考图 ${i + 1}`}
                onRemove={() =>
                  removeItem(
                    (c) =>
                      c.type === "image_url" &&
                      c.role === "reference_image" &&
                      c.image_url.url === img.image_url.url
                  )
                }
              />
            ) : null
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 panel px-3 py-2 space-y-2">
          <textarea
            ref={taRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmitClick();
              }
            }}
            placeholder="描述想要的视频画面（按 Ctrl+Enter 发送）"
            rows={1}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted
              focus:outline-none resize-none leading-[20px]"
          />

          {/* 单行工具栏：素材 │ 参数 │ 开关 │ 高级 + 水印 */}
          <div className="flex items-center gap-1 pt-1.5 border-t border-border flex-wrap">
            {/* === 素材组 === */}
            <CompactButton
              title="添加首帧图（图生视频，first_frame）"
              onClick={addFirstFrame}
              active={!!firstFrame}
            >
              <ImageIcon className="w-4 h-4" />
              <span className="ml-1 text-[10px]">首帧</span>
            </CompactButton>
            <CompactButton
              title="添加尾帧图（图生视频，last_frame）"
              onClick={addLastFrame}
              active={!!lastFrame}
            >
              <ImageIcon className="w-4 h-4" />
              <span className="ml-1 text-[10px]">尾帧</span>
            </CompactButton>
            <CompactButton
              title="添加参考图（多模态参考生视频，reference_image）"
              onClick={addRefImage}
              active={refImages.length > 0}
            >
              <Plus className="w-4 h-4" />
              <span className="ml-1 text-[10px]">参考图</span>
            </CompactButton>

            <ToolbarDivider />

            {/* === 核心参数组 === */}
            <ParamCell
              label="时长"
              title="4-15 秒"
            >
              <input
                type="number"
                min={4}
                max={15}
                value={duration}
                onChange={(e) =>
                  setDuration(
                    Math.max(4, Math.min(15, parseInt(e.target.value) || 5))
                  )
                }
                className="text-xs bg-bg-elev border border-border rounded px-1.5 h-6 w-10
                  text-text-primary focus:outline-none focus:border-accent
                  tabular-nums text-center"
              />
              <span className="text-[10px] text-text-muted">秒</span>
            </ParamCell>
            <ParamCell label="分辨率">
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as VideoResolution)}
                className="text-xs bg-bg-elev border border-border rounded px-1.5 h-6
                  text-text-primary focus:outline-none focus:border-accent"
              >
                {RESOLUTION_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </ParamCell>
            <ParamCell
              label="比例"
              title={isI2va ? "i2va 强制 adaptive" : undefined}
              disabled={isI2va}
            >
              <select
                value={ratio === "auto" ? "auto" : ratio}
                onChange={(e) => setRatio(e.target.value as VideoRatio | "auto")}
                className="text-xs bg-bg-elev border border-border rounded px-1.5 h-6
                  text-text-primary focus:outline-none focus:border-accent
                  disabled:opacity-50"
                disabled={isI2va}
              >
                {isI2va ? (
                  <option value="auto">adaptive</option>
                ) : (
                  <>
                    <option value="auto">自适应</option>
                    {RATIO_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </ParamCell>

            <ToolbarDivider />

            {/* === 开关组 === */}
            <ControlCell title="用 H3-Context-IR 把你的描述扩成镜头分镜 + 声音 + 配乐，通常 +5-15s">
              <label className="flex items-center gap-1.5 h-7 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={optimizePrompt}
                  onChange={(e) => setOptimizePrompt(e.target.checked)}
                  className="accent-accent"
                />
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span className="text-[11px] whitespace-nowrap">AI 增强</span>
              </label>
            </ControlCell>
            <ControlCell
              title={
                watermark
                  ? "视频右下角加 AIGC 标识（已开启）"
                  : "默认不加 AIGC 水印"
              }
            >
              <label className="flex items-center gap-1.5 h-7 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={watermark}
                  onChange={(e) => setWatermark(e.target.checked)}
                  className="accent-accent"
                />
                <span className="text-[11px] whitespace-nowrap">AIGC 水印</span>
              </label>
            </ControlCell>

            {/* === 高级面板触发 === */}
            <button
              onClick={() => setShowAdvanced((s) => !s)}
              className={`btn text-[11px] h-7 px-2 ${showAdvanced ? "bg-bg-hover" : ""}`}
              title="多模态参考（视频/音频 URL）"
            >
              高级
              <ChevronDown
                className={`w-3 h-3 text-text-muted ml-0.5 transition-transform ${
                  showAdvanced ? "rotate-180" : ""
                }`}
              />
            </button>
            <div className="flex-1" />
          </div>

          {/* 高级面板：参考视频 / 参考音频（仅 r2va 场景的 URL 输入） */}
          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 pt-2 border-t border-border">
              <ParamCell
                label="参考视频"
                title="r2va 专属；外链 URL（mp4/mov；≤50MB）"
              >
                <input
                  type="url"
                  value={videoUrlInput}
                  onChange={(e) => setRefVideo(e.target.value)}
                  placeholder="https://.../sample.mp4"
                  className="text-xs bg-bg-elev border border-border rounded px-2 h-6
                    text-text-primary placeholder:text-text-muted
                    focus:outline-none focus:border-accent flex-1 min-w-0"
                />
              </ParamCell>
              <ParamCell
                label="参考音频"
                title="r2va 专属；外链 URL（wav/mp3；≤15MB）"
              >
                <input
                  type="url"
                  value={audioUrlInput}
                  onChange={(e) => setRefAudio(e.target.value)}
                  placeholder="https://.../sample.mp3"
                  className="text-xs bg-bg-elev border border-border rounded px-2 h-6
                    text-text-primary placeholder:text-text-muted
                    focus:outline-none focus:border-accent flex-1 min-w-0"
                />
              </ParamCell>
            </div>
          )}
        </div>

        {/* 生成 / 取消按钮 · 40×40 圆形，与工具栏同高 */}
        {generating && onCancel ? (
          <button
            onClick={onCancel}
            className="h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center
              border border-accent-danger text-accent-danger bg-bg-panel
              hover:bg-accent-danger/10 transition-colors"
            title="取消视频生成"
            aria-label="取消视频生成"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={onSubmitClick}
            disabled={generating || isInvalid}
            className="h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center
              bg-accent hover:bg-accent-hover text-text-inverse
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={isInvalid ? "场景冲突，请清空素材" : "生成视频"}
            aria-label="生成视频"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* 提示：r2va 视频/音频大小限制 */}
      {showAdvanced && (videoUrlInput || audioUrlInput) && (
        <div className="text-[10px] text-text-muted/80 flex items-center gap-1 px-1">
          <Info className="w-3 h-3" />
          参考视频 ≤50MB / 参考音频 ≤15MB；请求体总大小 ≤64MB。视频/音频仅支持外链 URL。
        </div>
      )}
      {isInvalid && (
        <div className="text-[10px] text-accent-danger flex items-center gap-1 px-1">
          <AlertCircle className="w-3 h-3" />
          首/尾帧图 与 多模态参考（图片/视频/音频）互斥，请只保留一种素材。
        </div>
      )}
    </div>
  );
}

function Thumb({
  src,
  label,
  onRemove,
}: {
  src: string;
  label: string;
  onRemove: () => void;
}) {
  return (
    <div className="relative group w-12 h-12 rounded overflow-hidden border border-border">
      <img src={src} alt={label} className="w-full h-full object-cover" />
      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[9px] text-center leading-tight">
        {label}
      </div>
      <button
        onClick={onRemove}
        className="absolute top-0 right-0 bg-black/60 text-white p-0.5
          opacity-0 group-hover:opacity-100 transition-opacity"
        title="移除"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
