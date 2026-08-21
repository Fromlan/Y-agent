import { Download, Copy, Video as VideoIcon } from "lucide-react";
import type { Asset, GeneratedImage } from "@/lib/types";
import { assetVideoSource, imageInput } from "@/lib/types";
import { resolveImageUrlSync } from "@/lib/image-resolver";
import { useToast } from "@/components/shared/Toast";
import SafeImage from "@/components/shared/SafeImage";

interface Props {
  images: GeneratedImage[];
  meta?: { prompt: string; costMs: number; modelName?: string; size?: string } | null;
  /** P8：视频资产。传入时优先渲染视频，忽略 images。 */
  videoAsset?: Asset;
}

export default function ResultGrid({ images, meta, videoAsset }: Props) {
  // P8：视频分支
  const isVideo = videoAsset?.payload?.kind === "video";
  const videoSrc = isVideo ? resolveImageUrlSync(assetVideoSource(videoAsset)) : "";
  const toast = useToast();
  if (isVideo) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {meta && (
          <div className="panel p-3 flex items-center justify-between gap-3">
            <p className="text-sm text-text-primary flex-1 line-clamp-2">{meta.prompt}</p>
            <div className="flex items-center gap-2 text-xs text-text-muted whitespace-nowrap">
              <span>{meta.modelName}</span>
              {meta.size && <span>· {meta.size}</span>}
              <span>· {meta.costMs}ms</span>
            </div>
          </div>
        )}
        <div className="panel p-4 flex flex-col items-center gap-3">
          {videoSrc ? (
            <video
              src={videoSrc}
              controls
              autoPlay
              playsInline
              className="max-w-full max-h-[70vh] rounded"
            />
          ) : (
            <div className="text-text-muted text-sm py-12 flex flex-col items-center gap-2">
              <VideoIcon className="w-8 h-8" />
              视频源不可用（可能 24h URL 过期或本地缓存丢失）
            </div>
          )}
          {videoSrc && (
            <a
              href={videoSrc}
              download={`y-agent-${videoAsset!.id}.mp4`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
            >
              <Download className="w-3.5 h-3.5" />
              下载视频
            </a>
          )}
        </div>
      </div>
    );
  }
  const onCopy = () => {
    if (!meta?.prompt) return;
    navigator.clipboard.writeText(meta.prompt).then(
      () => toast.success("已复制 prompt"),
      () => toast.error("复制失败")
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {meta && (
        <div className="panel p-3 flex items-center justify-between gap-3">
          <p className="text-sm text-text-primary flex-1 line-clamp-2">{meta.prompt}</p>
          <div className="flex items-center gap-2 text-xs text-text-muted whitespace-nowrap">
            <span>{meta.modelName}</span>
            {meta.size && <span>· {meta.size}</span>}
            <span>· {meta.costMs}ms</span>
            <button
              onClick={onCopy}
              className="btn-icon p-1"
              title="复制 prompt"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      <div
        className={`grid gap-2 ${
          images.length === 1
            ? "grid-cols-1"
            : images.length === 2
            ? "grid-cols-2"
            : images.length === 3
            ? "grid-cols-3"
            : "grid-cols-2 md:grid-cols-4"
        }`}
      >
        {images.map((img, i) => (
          <div key={i} className="relative group">
            <SafeImage
              src={imageInput(img)}
              alt={img.name ?? `生成结果 ${i + 1}`}
              className="w-full rounded border border-border"
            />
            {img.name && (
              <div className="absolute bottom-1 left-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded truncate">
                {img.name}
              </div>
            )}
            <a
              href={img.url}
              download={`y-agent-${Date.now()}-${i + 1}.png`}
              target="_blank"
              rel="noreferrer"
              className="absolute top-2 right-2 bg-black/70 text-white p-1.5 rounded
                opacity-0 group-hover:opacity-100 transition-opacity"
              title="下载"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
