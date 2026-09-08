/**
 * useVideoTaskBoard — 视频任务板的状态/事件/CRUD 集中
 *
 * 把散落在 ProjectDetail 里的视频任务管理集中起来：
 *   - videoTasks Record<task_id, track>（含 videoTasksRef 给事件回调读最新值）
 *   - hasVideoKey 检测（切项目 / 切 inputMode / 每次生成完都重检）
 *   - subscribeVideoEvents 订阅（progress / succeeded / failed / cancelled 4 个 handler）
 *   - listVideoTasks 跨重启恢复（进入项目时重建未落定任务）
 *   - patchVideoTask / addVideoTask（task CRUD）
 *   - cancelVideo（IPC 调用）
 *   - videoTaskFilter / setVideoTaskFilter（"active"/"failed"/"all"）
 *   - videoSubmitting（防重复点击；与任务本身 status 解耦）
 *
 * **不在本 hook 范围**（保留在调用方）：
 *   - onSubmitVideo（依赖表单状态 videoPrompt/videoContent/videoResolution/...，
 *     这些是 VideoPromptBar 拥有的，调用方合表后用 addVideoTask 把任务加进来）
 *   - onRetryVideo（依赖 onSubmitVideo）
 *
 * 调用方只需要传 projectId + reload + toast + inputMode，剩下的全自动。
 * (commit 11 抽自 ProjectDetail.tsx,纯结构性切片,不改行为)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createAsset } from "@/lib/assets";
import { buildAssetPayload } from "@/lib/asset-payload";
import {
  cancelVideo as ipcCancelVideo,
  hasVideoApiKey,
  listVideoTasks,
  subscribeVideoEvents,
  type ContentItem,
  type VideoRatio,
  type VideoResolution,
} from "@/lib/video";
import { explainError } from "@/lib/jimeng";
import { useToast } from "@/components/shared/Toast";
import type { VideoTaskTrack } from "@/components/workspace/VideoTaskCard";
import { log } from "@/lib/logger";

export interface UseVideoTaskBoardArgs {
  projectId: string | undefined;
  /** 视频任务 succeeded 入库后,刷新资产库用 */
  reload: (opts?: { silent?: boolean }) => Promise<void>;
  toast: ReturnType<typeof useToast>;
  /** 切到 video 模式时重检 key */
  inputMode: string;
}

export interface VideoTaskBoardAPI {
  videoTasks: Record<string, VideoTaskTrack>;
  hasVideoKey: boolean | null;
  videoTaskFilter: "active" | "failed" | "all";
  setVideoTaskFilter: (f: "active" | "failed" | "all") => void;
  videoSubmitting: boolean;
  setVideoSubmitting: (v: boolean) => void;
  patchVideoTask: (taskId: string, patch: Partial<VideoTaskTrack>) => void;
  addVideoTask: (track: VideoTaskTrack) => void;
  cancelVideo: (taskId: string) => Promise<void>;
}

export function useVideoTaskBoard({
  projectId,
  reload,
  toast,
  inputMode,
}: UseVideoTaskBoardArgs): VideoTaskBoardAPI {
  const [hasVideoKey, setHasVideoKey] = useState<boolean | null>(null);
  // P10：视频任务队列（放开单项目单任务限制）。用 Record<task_id, track> 存。
  // ref 给事件回调读最新值（闭包会过期），state 交给 React 渲染。
  const [videoTasks, setVideoTasks] = useState<Record<string, VideoTaskTrack>>({});
  const videoTasksRef = useRef<Record<string, VideoTaskTrack>>({});
  // 「提交中」用于防重复点击，与「生成中」解耦：允许排队提交多个任务。
  const [videoSubmitting, setVideoSubmitting] = useState(false);
  // M3：视频任务中心的状态筛选（进行中 / 已失败 / 全部）。
  const [videoTaskFilter, setVideoTaskFilter] = useState<"active" | "failed" | "all">("active");

  // 订阅回调里用的最新值引用，避免订阅被频繁重建 / 闭包过期。
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const patchVideoTask = useCallback((taskId: string, patch: Partial<VideoTaskTrack>) => {
    const next = {
      ...videoTasksRef.current,
      [taskId]: { ...videoTasksRef.current[taskId], ...patch },
    };
    videoTasksRef.current = next;
    setVideoTasks(next);
  }, []);
  const addVideoTask = useCallback((track: VideoTaskTrack) => {
    const next = { ...videoTasksRef.current, [track.taskId]: track };
    videoTasksRef.current = next;
    setVideoTasks(next);
  }, []);

  // P8：切到生视频模式 / 切项目时检查 video key
  useEffect(() => {
    hasVideoApiKey().then(setHasVideoKey).catch(() => setHasVideoKey(false));
  }, [projectId, inputMode]);

  // P8：订阅视频事件（progress / succeeded / failed / cancelled）
  // P10：用 videoTasksRef 按 task_id 更新对应 track，故支持多任务并发。
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    subscribeVideoEvents({
      onProgress: ({ taskId, status }) => {
        if (!videoTasksRef.current[taskId]) return;
        patchVideoTask(taskId, { status });
      },
      onSucceeded: async ({ taskId, url, localPath, resolution, duration, ratio }) => {
        const track = videoTasksRef.current[taskId];
        if (!track) return;
        const pid = projectIdRef.current;
        if (!pid) return;
        try {
          const t1 = Date.now();
          // P9: meta 里存着增强状态，任务入库时回填
          const meta = track.meta;
          const asset = await createAsset({
            projectId: pid,
            prompt: meta?.originalPrompt ?? track.prompt,
            model: "MiniMax-H3",
            modelName: "MiniMax H3 (视频)",
            size: resolution || track.resolution || "2K",
            refCount: track.content.filter(
              (c) =>
                c.type === "image_url" ||
                c.type === "video_url" ||
                c.type === "audio_url"
            ).length,
            costMs: Date.now() - t1,
            isLayerDecomposition: false,
            payload: buildAssetPayload(
              {
                urls: [],
                isTransparent: false,
                kind: "video",
                video: {
                  url,
                  localPath,
                  duration: duration || track.duration || 5,
                  ratio: ratio || track.ratio || "16:9",
                  resolution: (resolution ||
                    track.resolution ||
                    "2K") as "768P" | "2K",
                  taskId,
                  // P9: 三个 H3 增强字段(全 optional,老数据无)
                  ...(meta?.optimizedPrompt ? { optimizedPrompt: meta.optimizedPrompt } : {}),
                  ...(meta?.originalPrompt ? { originalPrompt: meta.originalPrompt } : {}),
                  ...(meta?.optimizationReason ? { optimizationReason: meta.optimizationReason } : {}),
                },
                status: "approved",
              },
              undefined
            ),
          });
          patchVideoTask(taskId, {
            status: "succeeded",
            url,
            localPath,
            resolution: resolution || track.resolution,
            duration: duration || track.duration,
            ratio: ratio || track.ratio,
            assetId: asset.id,
          });
          await reloadRef.current({ silent: true });
          toastRef.current.success("视频已生成，已入库到资产库");
        } catch (e: any) {
          const raw = e?.message ?? String(e);
          const friendly = await explainError(raw).catch(() => raw);
          toastRef.current.error(`视频入库失败：${friendly}`);
          patchVideoTask(taskId, { status: "failed", error: { message: friendly } });
        }
      },
      onFailed: async ({ taskId, code, message }) => {
        if (!videoTasksRef.current[taskId]) return;
        patchVideoTask(taskId, { status: "failed", error: { code, message } });
        const raw = `${code ? `(${code}) ` : ""}${message}`;
        const friendly = await explainError(raw).catch(() => raw);
        toastRef.current.error(`视频生成失败：${friendly}`);
      },
      onCancelled: ({ taskId }) => {
        if (!videoTasksRef.current[taskId]) return;
        patchVideoTask(taskId, { status: "cancelled" });
        toastRef.current.info("视频生成已取消");
      },
    })
      .then((u) => {
        if (cancelled) u();
        else unlisten = u;
      })
      .catch((e) => console.error("subscribeVideoEvents failed", e));
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
    // patchVideoTask 是 useCallback([]) 稳定引用，放 deps 只是满足 exhaustive-deps，不会重复订阅。
  }, [projectId, patchVideoTask]);

  // P10/M2：进入项目时从持久化库找回"未落定"的视频任务（跨重启恢复）。
  // 后端启动时已对这些任务重新挂轮询；这里前端重建任务卡，好让 succeeded 时能入库 + 显示。
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    listVideoTasks(projectId)
      .then((records) => {
        if (cancelled) return;
        for (const rec of records) {
          // 成功已作为资产入库，这里不重复显示；queued/running 恢复为进行中，
          // failed/cancelled 留下来作为任务历史。
          if (rec.status === "succeeded") continue;
          let meta: VideoTaskTrack["meta"];
          try {
            meta = rec.meta ? (JSON.parse(rec.meta) as VideoTaskTrack["meta"]) : undefined;
          } catch {
            meta = undefined;
          }
          let content: ContentItem[] = [];
          try {
            content = JSON.parse(rec.content) as ContentItem[];
          } catch {
            content = [];
          }
          addVideoTask({
            taskId: rec.taskId,
            status: rec.status as VideoTaskTrack["status"],
            createdAt: rec.createdAt,
            prompt: rec.prompt,
            content,
            meta: meta ?? { originalPrompt: rec.prompt },
            resolution: rec.resolution as VideoResolution | undefined,
            duration: rec.duration ?? undefined,
            ratio: rec.ratio as VideoRatio | undefined,
          });
        }
      })
      .catch((e) => {
        // 静默：最坏情况就是中断的任务不会自动恢复，不影响主流程。
        log.warn("video-task-board", "listVideoTasks failed:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, addVideoTask]);

  const cancelVideo = useCallback(async (taskId: string) => {
    try {
      await ipcCancelVideo(taskId);
    } catch (e: any) {
      console.warn("cancelVideo failed", e);
    }
  }, []);

  return {
    videoTasks,
    hasVideoKey,
    videoTaskFilter,
    setVideoTaskFilter,
    videoSubmitting,
    setVideoSubmitting,
    patchVideoTask,
    addVideoTask,
    cancelVideo,
  };
}
