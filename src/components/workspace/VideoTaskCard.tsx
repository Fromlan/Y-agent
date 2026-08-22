import { useEffect, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  RotateCcw,
  Clapperboard,
  Play,
} from "lucide-react";
import { resolveImageUrlSync } from "@/lib/image-resolver";
import type { ContentItem, VideoRatio, VideoResolution } from "@/lib/video";
import type { OptimizeReason } from "@/lib/h3-context-ir";

/** 前端跟踪一条视频生成任务的状态（内存态，M1；M2 持久化后再接 list 找回）。 */
export interface VideoTaskTrack {
  taskId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  /** 本地提交时刻（ms），用于估算已耗时 */
  createdAt: number;
  /** 用户原始 prompt（卡片展示 / 重试用） */
  prompt: string;
  /** 提交时的素材（重试直接复用） */
  content: ContentItem[];
  meta?: {
    optimizedPrompt?: string;
    originalPrompt: string;
    optimizationReason?: OptimizeReason;
  };
  url?: string;
  localPath?: string;
  error?: { code?: string; message?: string };
  resolution?: VideoResolution;
  duration?: number;
  ratio?: VideoRatio;
  assetId?: string;
}

interface Props {
  task: VideoTaskTrack;
  onCancel: (taskId: string) => void;
  onRetry?: (task: VideoTaskTrack) => void;
  /** 成功后可跳到资产详情 */
  onOpenAsset?: (task: VideoTaskTrack) => void;
}

const STATUS_META: Record<
  VideoTaskTrack["status"],
  { label: string; icon: "spinner" | "ok" | "danger" | "warn" }
> = {
  queued: { label: "排队中", icon: "warn" },
  running: { label: "生成中", icon: "spinner" },
  succeeded: { label: "已完成", icon: "ok" },
  failed: { label: "失败", icon: "danger" },
  cancelled: { label: "已取消", icon: "warn" },
};

function statusColor(status: VideoTaskTrack["status"]): string {
  switch (status) {
    case "succeeded":
      return "var(--status-success)";
    case "failed":
      return "var(--status-danger)";
    case "cancelled":
      return "var(--text-muted)";
    default:
      return "var(--status-warn)";
  }
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function StatusIcon({ status }: { status: VideoTaskTrack["status"] }) {
  switch (STATUS_META[status].icon) {
    case "spinner":
      return <Loader2 className="w-4 h-4 animate-spin" />;
    case "ok":
      return <CheckCircle2 className="w-4 h-4" />;
    case "danger":
      return <XCircle className="w-4 h-4" />;
    default:
      return <AlertTriangle className="w-4 h-4" />;
  }
}

export default function VideoTaskCard({ task, onCancel, onRetry, onOpenAsset }: Props) {
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    if (task.status !== "queued" && task.status !== "running") return;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [task.status]);

  const isActive = task.status === "queued" || task.status === "running";
  const elapsed = tick - task.createdAt;
  const videoSrc =
    task.status === "succeeded" && (task.localPath || task.url)
      ? resolveImageUrlSync(task.localPath ?? task.url)
      : "";

  const chips: string[] = [];
  if (task.resolution) chips.push(task.resolution);
  if (task.duration) chips.push(`${task.duration}s`);
  if (task.ratio) chips.push(task.ratio);

  const color = statusColor(task.status);
  const meta = STATUS_META[task.status];

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-3 p-3">
        {/* 左侧：状态 + 缩略 / 播放 */}
        <div className="relative w-full sm:w-40 aspect-video rounded overflow-hidden border border-border bg-bg-elev flex-shrink-0">
          {task.status === "succeeded" && videoSrc ? (
            <video
              src={videoSrc}
              className="w-full h-full object-cover"
              muted
              playsInline
              preload="metadata"
              controls
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-bg-base">
              <Clapperboard className="w-6 h-6 text-text-muted" />
              <span className="text-[10px] text-text-muted">
                {STATUS_META[task.status].label}
              </span>
            </div>
          )}
        </div>

        {/* 右侧：信息 + 操作 */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                color,
                backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
              }}
            >
              <StatusIcon status={task.status} />
              {meta.label}
            </span>
            {chips.map((c) => (
              <span
                key={c}
                className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elev border border-border text-text-secondary"
              >
                {c}
              </span>
            ))}
            <span className="text-[10px] text-text-muted">MiniMax-H3</span>
            {isActive && (
              <span className="text-[10px] text-text-muted tabular-nums">
                已耗时 {formatElapsed(elapsed)}
              </span>
            )}
          </div>

          <p className="text-xs text-text-secondary line-clamp-2 break-words">
            {task.prompt || "（无描述）"}
          </p>

          {task.status === "failed" && (
            <p className="text-[11px] text-accent-danger break-words">
              {task.error?.code ? `(${task.error.code}) ` : ""}
              {task.error?.message || "未知错误"}
            </p>
          )}

          <div className="flex items-center gap-2 mt-auto">
            {isActive && (
              <button
                onClick={() => onCancel(task.taskId)}
                className="btn text-[11px] h-7 px-2.5 text-accent-danger border-accent-danger/40 hover:bg-accent-danger/10"
              >
                <X className="w-3.5 h-3.5" />
                取消
              </button>
            )}
            {task.status === "failed" && onRetry && (
              <button
                onClick={() => onRetry(task)}
                className="btn text-[11px] h-7 px-2.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                重试
              </button>
            )}
            {task.status === "succeeded" && onOpenAsset && (
              <button
                onClick={() => onOpenAsset(task)}
                className="btn text-[11px] h-7 px-2.5"
              >
                <Play className="w-3.5 h-3.5" />
                查看
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
