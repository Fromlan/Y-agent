import {
  ArrowUp,
  Plus,
  X,
  ChevronDown,
  Loader2,
  Image as ImageIcon,
  Info,
  AlertCircle,
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
  generating,
  onSubmit,
  onCancel,
}: Props) {
  const toast = useToast();
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  // 参考视频/音频：v1 只支持外链 URL（避免 base64 超 64MB body 限制）
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

  // 场景名称
  const scenarioLabel: Record<typeof scenario, string> = {
    t2va: "文生视频",
    i2va: "图生视频（首/尾帧）",
    r2va: "多模态参考生视频",
    invalid: "场景冲突（清空首尾帧或多模态参考）",
  };
  const scenarioColor: Record<typeof scenario, string> = {
    t2va: "text-text-muted",
    i2va: "text-accent",
    r2va: "text-accent",
    invalid: "text-accent-danger",
  };

  return (
    <div className="space-y-3 relative">
      {/* 场景提示 */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className={scenarioColor[scenario]}>当前场景：{scenarioLabel[scenario]}</span>
        {isInvalid && (
          <span className="text-accent-danger">（请清空其中一种素材）</span>
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
        <div className="flex-1 panel p-3 space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmitClick();
              }
            }}
            placeholder="描述想要的视频画面（按 Ctrl+Enter 发送）"
            rows={3}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted
              focus:outline-none resize-none"
          />

          {/* 主行：素材按钮 + 时长 + 分辨率 + 比例 + 更多 + 生成 */}
          <div className="flex items-center gap-2 pt-1 border-t border-border flex-wrap">
            {/* 首帧 / 尾帧（互斥于多模态参考） */}
            <button
              className="btn-icon"
              title="添加首帧图（图生视频，first_frame）"
              onClick={addFirstFrame}
            >
              <ImageIcon className="w-4 h-4" />
              <span className="ml-1 text-[10px]">首帧</span>
            </button>
            <button
              className="btn-icon"
              title="添加尾帧图（图生视频，last_frame）"
              onClick={addLastFrame}
            >
              <ImageIcon className="w-4 h-4" />
              <span className="ml-1 text-[10px]">尾帧</span>
            </button>
            <span className="text-text-muted/40">|</span>
            {/* 多模态参考（互斥于首尾帧） */}
            <button
              className="btn-icon"
              title="添加参考图（多模态参考生视频，reference_image）"
              onClick={addRefImage}
            >
              <Plus className="w-4 h-4" />
              <span className="ml-1 text-[10px]">参考图</span>
            </button>

            {/* 核心参数 */}
            <span className="text-text-muted/40">|</span>
            <Field label="时长" hint="4-15 秒">
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
                className="input text-sm w-14"
              />
            </Field>
            <Field label="分辨率">
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as VideoResolution)}
                className="input text-sm"
              >
                {RESOLUTION_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="比例" hint={isI2va ? "i2va 强制 adaptive" : undefined}>
              <select
                value={ratio === "auto" ? "auto" : ratio}
                onChange={(e) => setRatio(e.target.value as VideoRatio | "auto")}
                className="input text-sm"
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
            </Field>

            {/* 更多按钮 */}
            <button
              onClick={() => setShowAdvanced((s) => !s)}
              className={`btn text-xs h-7 px-2.5 ${showAdvanced ? "bg-bg-hover" : ""}`}
              title="多模态参考（视频/音频）+ AIGC 水印"
            >
              更多
              <ChevronDown
                className={`w-3 h-3 text-text-muted ml-1 transition-transform ${
                  showAdvanced ? "rotate-180" : ""
                }`}
              />
            </button>
            <div className="flex-1" />
          </div>

          {/* 高级面板：参考视频 / 参考音频 / 水印 */}
          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-border">
              <Field
                label="参考视频"
                hint="r2va 专属；外链 URL（mp4/mov；≤50MB）"
              >
                <input
                  type="url"
                  value={videoUrlInput}
                  onChange={(e) => setRefVideo(e.target.value)}
                  placeholder="https://.../sample.mp4"
                  className="input text-sm"
                />
              </Field>
              <Field
                label="参考音频"
                hint="r2va 专属；外链 URL（wav/mp3；≤15MB）"
              >
                <input
                  type="url"
                  value={audioUrlInput}
                  onChange={(e) => setRefAudio(e.target.value)}
                  placeholder="https://.../sample.mp3"
                  className="input text-sm"
                />
              </Field>
              <Field label="AIGC 水印" hint="默认不加">
                <label className="flex items-center gap-1.5 h-[38px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={watermark}
                    onChange={(e) => setWatermark(e.target.checked)}
                    className="accent-accent"
                  />
                  <span className="text-xs text-text-secondary">视频右下角加 AIGC 标识</span>
                </label>
              </Field>
            </div>
          )}
        </div>
        {/* 生成 / 取消按钮 */}
        {generating && onCancel ? (
          <button
            onClick={onCancel}
            className="btn h-[88px] w-12 flex flex-col items-center justify-center border-accent-danger text-accent-danger hover:bg-accent-danger/10"
            title="取消视频生成"
          >
            <X className="w-5 h-5" />
            <span className="text-[10px] mt-1">取消</span>
          </button>
        ) : (
          <button
            onClick={onSubmitClick}
            disabled={generating || isInvalid}
            className="btn btn-primary h-[88px] w-12 flex flex-col items-center justify-center"
            title={isInvalid ? "场景冲突，请清空素材" : "生成视频"}
          >
            {generating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ArrowUp className="w-5 h-5" />
            )}
            <span className="text-[10px] mt-1">生成</span>
          </button>
        )}
      </div>

      {/* 提示：r2va 视频/音频大小限制 */}
      {showAdvanced && (videoUrlInput || audioUrlInput) && (
        <div className="text-[10px] text-text-muted/80 flex items-center gap-1">
          <Info className="w-3 h-3" />
          参考视频 ≤50MB / 参考音频 ≤15MB；请求体总大小 ≤64MB。视频/音频仅支持外链 URL（v1 不支持本地文件 base64 上传）。
        </div>
      )}
      {isInvalid && (
        <div className="text-[10px] text-accent-danger flex items-center gap-1">
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-text-muted">{label}</span>
        {hint && <span className="text-[10px] text-text-muted/70">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
