/**
 * MiniMax H3 视频生成 API 客户端（前端封装）。
 *
 * 异步任务模式：
 * 1. `submitVideo(params)` 立即返回 task_id
 * 2. 监听 Tauri 事件 `jimeng_video://{progress|succeeded|failed|cancelled}` 拿到后续状态
 * 3. `cancelVideo(task_id)` 主动停止轮询（仅本地，不调取消 API）
 *
 * 场景自适应（参考后端 `video::detect_scenario`）：
 * - 只有 text → t2va（ratio 必填 ≠ adaptive）
 * - 有 first_frame / last_frame → i2va（ratio 强制 adaptive）
 * - 有 reference_image / reference_video / reference_audio → r2va（ratio 默认 adaptive）
 *
 * 三种场景**互斥**：i2va 和 r2va 不能同时出现（API 限制）。
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ============================================================================
// 类型定义
// ============================================================================

/** 单个 content 项。type 决定用 image_url / video_url / audio_url 哪个字段。 */
export type ContentItem =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string };
      /** i2va: first_frame | last_frame；r2va: reference_image */
      role?: "first_frame" | "last_frame" | "reference_image";
    }
  | {
      type: "video_url";
      video_url: { url: string };
      /** r2va 专属：reference_video */
      role?: "reference_video";
    }
  | {
      type: "audio_url";
      audio_url: { url: string };
      /** r2va 专属：reference_audio */
      role?: "reference_audio";
    };

export type VideoResolution = "768P" | "2K";
/** 文生视频必填且 ≠ adaptive；图生视频强制 adaptive（前端不传，后端覆盖）；多模态参考默认 adaptive */
export type VideoRatio =
  | "adaptive"
  | "21:9"
  | "16:9"
  | "4:3"
  | "1:1"
  | "3:4"
  | "9:16";

export interface SubmitVideoParams {
  model: "MiniMax-H3";
  content: ContentItem[];
  resolution: VideoResolution;
  duration: number; // 4..=15
  ratio?: VideoRatio;
  aigcWatermark?: boolean;
}

/** 后端轮询返回的最小任务对象（前端兜底用，事件 payload 字段更多） */
export interface VideoTask {
  taskId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  url?: string;
  code?: string;
  message?: string;
  resolution?: VideoResolution;
  duration?: number;
  ratio?: VideoRatio;
}

// ============================================================================
// API Key 三件套
// ============================================================================

export async function getVideoApiKey(): Promise<string | null> {
  return await invoke<string | null>("get_video_api_key");
}

export async function setVideoApiKey(key: string): Promise<void> {
  await invoke("set_video_api_key", { key });
}

export async function clearVideoApiKey(): Promise<void> {
  await invoke("clear_video_api_key");
}

export async function hasVideoApiKey(): Promise<boolean> {
  const k = await getVideoApiKey();
  return !!k && k.length > 0;
}

// ============================================================================
// 提交 + 轮询
// ============================================================================

/** 提交视频任务。立即返回 task_id。后续状态通过监听 `jimeng_video://*` 事件拿到。 */
export async function submitVideo(
  params: SubmitVideoParams,
  projectId: string
): Promise<string> {
  return await invoke<string>("jimeng_video_submit", {
    params: {
      model: params.model,
      content: params.content,
      resolution: params.resolution,
      duration: params.duration,
      ratio: params.ratio,
      aigcWatermark: params.aigcWatermark,
    },
    projectId,
  });
}

/** 手动查一次（前端兜底用，例如重连后想确认某 task_id 状态）。 */
export async function queryVideo(taskId: string): Promise<VideoTask> {
  const raw = await invoke<{
    taskId: string;
    status: string;
    url?: string;
    error?: { code?: string; message?: string };
    resolution?: string;
    duration?: number;
    ratio?: string;
  }>("jimeng_video_query", { taskId });
  return {
    taskId: raw.taskId,
    status: raw.status as VideoTask["status"],
    url: raw.url,
    code: raw.error?.code,
    message: raw.error?.message,
    resolution: raw.resolution as VideoResolution | undefined,
    duration: raw.duration,
    ratio: raw.ratio as VideoRatio | undefined,
  };
}

/** 主动停止轮询。Rust 端会 emit `jimeng_video://cancelled` 事件。 */
export async function cancelVideo(taskId: string): Promise<void> {
  await invoke("jimeng_video_cancel", { taskId });
}

// ============================================================================
// 事件订阅
// ============================================================================

export type VideoEvent =
  | { type: "progress"; taskId: string; status: "queued" | "running" }
  | {
      type: "succeeded";
      taskId: string;
      url: string;
      localPath?: string;
      resolution?: VideoResolution;
      duration?: number;
      ratio?: VideoRatio;
    }
  | { type: "failed"; taskId: string; code?: string; message: string }
  | { type: "cancelled"; taskId: string };

interface VideoHandlers {
  onProgress?: (e: Extract<VideoEvent, { type: "progress" }>) => void;
  onSucceeded?: (e: Extract<VideoEvent, { type: "succeeded" }>) => void;
  onFailed?: (e: Extract<VideoEvent, { type: "failed" }>) => void;
  onCancelled?: (e: Extract<VideoEvent, { type: "cancelled" }>) => void;
}

/**
 * 订阅视频任务事件。
 * - 每个事件 payload 都有 task_id 字段，用它过滤并发任务
 * - 返回 unlisten 函数
 * - 监听所有 `jimeng_video://*` 事件，handler 按 type 分发
 */
export async function subscribeVideoEvents(
  handlers: VideoHandlers
): Promise<UnlistenFn> {
  const unlistenProgress = await listen<{
    type: "Progress";
    taskId: string;
    status: string;
  }>("jimeng_video://progress", (e) => {
    handlers.onProgress?.({
      type: "progress",
      taskId: e.payload.taskId,
      status: e.payload.status as "queued" | "running",
    });
  });
  const unlistenSucceeded = await listen<{
    type: "Succeeded";
    taskId: string;
    url: string;
    localPath?: string;
    resolution?: string;
    duration?: number;
    ratio?: string;
  }>("jimeng_video://succeeded", (e) => {
    handlers.onSucceeded?.({
      type: "succeeded",
      taskId: e.payload.taskId,
      url: e.payload.url,
      localPath: e.payload.localPath,
      resolution: e.payload.resolution as VideoResolution | undefined,
      duration: e.payload.duration,
      ratio: e.payload.ratio as VideoRatio | undefined,
    });
  });
  const unlistenFailed = await listen<{
    type: "Failed";
    taskId: string;
    code?: string;
    message: string;
  }>("jimeng_video://failed", (e) => {
    handlers.onFailed?.({
      type: "failed",
      taskId: e.payload.taskId,
      code: e.payload.code,
      message: e.payload.message,
    });
  });
  const unlistenCancelled = await listen<{
    type: "Cancelled";
    taskId: string;
  }>("jimeng_video://cancelled", (e) => {
    handlers.onCancelled?.({
      type: "cancelled",
      taskId: e.payload.taskId,
    });
  });
  return () => {
    unlistenProgress();
    unlistenSucceeded();
    unlistenFailed();
    unlistenCancelled();
  };
}

// ============================================================================
// 场景判定（前端预检，避免无效请求打到后端）
// ============================================================================

/**
 * 检测场景。返回 "t2va" | "i2va" | "r2va" | "invalid"。
 * - "invalid" = 同时含 reference_* 和 first_frame/last_frame，API 互斥
 */
export function detectVideoScenario(
  content: ContentItem[]
): "t2va" | "i2va" | "r2va" | "invalid" {
  let hasRef = false;
  let hasFrame = false;
  for (const item of content) {
    if (item.type === "text") continue;
    const role = item.role;
    if (
      role === "reference_image" ||
      role === "reference_video" ||
      role === "reference_audio"
    ) {
      hasRef = true;
    } else if (role === "first_frame" || role === "last_frame") {
      hasFrame = true;
    }
  }
  if (hasRef && hasFrame) return "invalid";
  if (hasRef) return "r2va";
  if (hasFrame) return "i2va";
  return "t2va";
}

/** 校验参数并修正 ratio。返回错误字符串（前端 toast 用）或 null。 */
export function validateAndFixParams(
  params: SubmitVideoParams
): { ok: true; fixed: SubmitVideoParams } | { ok: false; reason: string } {
  if (params.model !== "MiniMax-H3") {
    return { ok: false, reason: "视频模型当前仅支持 MiniMax-H3" };
  }
  if (params.resolution !== "768P" && params.resolution !== "2K") {
    return { ok: false, reason: "分辨率必须是 768P 或 2K" };
  }
  if (!Number.isInteger(params.duration) || params.duration < 4 || params.duration > 15) {
    return { ok: false, reason: "视频时长必须是 4..=15 秒整数" };
  }
  const hasText = params.content.some(
    (c) => c.type === "text" && c.text.trim().length > 0
  );
  if (!hasText) {
    return { ok: false, reason: "请输入提示词（content 必须包含非空 text）" };
  }
  const scenario = detectVideoScenario(params.content);
  if (scenario === "invalid") {
    return {
      ok: false,
      reason: "图生视频（first_frame/last_frame）与多模态参考（reference_*）互斥",
    };
  }

  let ratio = params.ratio;
  if (scenario === "t2va") {
    if (!ratio || ratio === "adaptive") {
      return {
        ok: false,
        reason: "文生视频必须指定 ratio（21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16），不能是 adaptive",
      };
    }
  } else if (scenario === "i2va") {
    // i2va: ratio 强制 adaptive（后端也会强制覆盖，这里给前端一致性）
    ratio = "adaptive";
  } else if (scenario === "r2va") {
    // r2va: ratio 默认 adaptive
    if (!ratio) ratio = "adaptive";
  }

  return {
    ok: true,
    fixed: { ...params, ratio },
  };
}
