import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { GeneratedImage, Usage, ImageError } from "@/lib/types";

export interface GenerateImageParams {
  model: string;
  prompt: string;
  image?: string[];
  size?: string;
  /** 仅当需要组图时设置；不要传 "disabled" */
  sequential?: "auto";
  maxImages?: number;
  layerDecomposition?: boolean;
  /**
   * 是否在生成图右下角加 "AI生成" 水印。
   * 留空走 Y-agent 默认（不加）；Seedream API 默认 true，Y-agent 后端会显式补 false 关闭。
   * 如未来需要 UI 开关，往这里传 true/false 即可。
   */
  watermark?: boolean;
  /** 输出文件格式：png | jpeg。仅 5.0 Pro / 5.0 Lite 支持。 */
  outputFormat?: "png" | "jpeg";
  /** 工具调用。当前仅支持 web_search（5.0 Lite 专属）。 */
  tools?: Array<"web_search">;
  /** 提示词优化模式：standard | fast。fast 仅 5.0 Pro / 4.0 支持。 */
  optimizePromptMode?: "standard" | "fast";
  /** 背景透明：transparent | opaque。仅 5.0 Pro 专属。 */
  background?: "transparent" | "opaque";
}

export interface GenerateImageResponse {
  images: GeneratedImage[];
  /** 是否走 demo 模式（不消耗 token） */
  isDemo: boolean;
  /** API 顶层 usage（生成张数 / token / 工具调用次数） */
  usage?: Usage;
  /** API 顶层 error（整个请求都失败时） */
  error?: ImageError;
  /** P4：实际输出格式（png|jpeg），仅 5.0 Pro / Lite 返回 */
  output_format?: "png" | "jpeg";
}

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResponse> {
  return await invoke<GenerateImageResponse>("jimeng_generate", {
    params: applyOutputFormatDefault(params),
  });
}

// ============================================================================
// P1：流式生图
// ============================================================================

/** 流事件类型（与 Rust 端 StreamEvent 对齐）
 * P5: partial_image / partial_image_b64 可能带 `localPath`（24h 兜底用）。
 * Rust 端先 emit 一次 localPath 为空的事件让前端立刻入库；下载完成后再 emit 一次带 localPath。
 * 前端应以后续事件里的 localPath 为准，更新已入库资产的 payload.localPaths。
 */
export type StreamEvent =
  | {
      type: "partial_image";
      request_id: string;
      index: number;
      url: string;
      size?: string;
      localPath?: string;
    }
  | {
      type: "partial_image_b64";
      request_id: string;
      index: number;
      b64: string;
      localPath?: string;
    }
  | { type: "partial_failed"; request_id: string; index?: number; code?: string; message?: string }
  | { type: "completed"; request_id: string; usage?: Usage }
  | { type: "aborted"; request_id: string; reason: string };

export interface StreamHandlers {
  /** 单图完成（URL 直链） */
  onPartial?: (img: { index: number; url: string; size?: string; localPath?: string }) => void;
  /** 单图完成（base64，自动补 data:image/png;base64, 前缀） */
  onPartialB64?: (img: { index: number; url: string; localPath?: string }) => void;
  /** 单图失败 */
  onPartialFailed?: (info: { index?: number; code?: string; message?: string }) => void;
  /** 全部完成 */
  onCompleted?: (info: { usage?: Usage }) => void;
  /** 流中断（InternalServiceError / 网络断开 / 顶层 error） */
  onAborted?: (info: { reason: string }) => void;
}

/**
 * 启动一次流式生图，立即返回 request_id。
 * 后台通过 Tauri event `jimeng://stream` 持续推事件，handlers 会被对应回调命中。
 * InternalServiceError 或顶层 error 会在 `onAborted` 里告知，**不**抛异常。
 */
export async function generateImageStream(
  params: GenerateImageParams,
  handlers: StreamHandlers = {}
): Promise<string> {
  const requestId = await invoke<string>("jimeng_generate_stream", {
    params: applyOutputFormatDefault(params),
  });

  // 监听本次 request_id 的事件（用事件 payload 里的 request_id 过滤，避免与其它并发请求串台）
  const unlisten: UnlistenFn = await listen<StreamEvent>("jimeng://stream", (e) => {
    const ev = e.payload;
    if (ev.request_id !== requestId) return;
    switch (ev.type) {
      case "partial_image":
        handlers.onPartial?.({
          index: ev.index,
          url: ev.url,
          size: ev.size,
          localPath: ev.localPath,
        });
        break;
      case "partial_image_b64": {
        // 兼容 data:image/... 前缀与裸 base64
        const b64 = ev.b64;
        const url = b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
        handlers.onPartialB64?.({ index: ev.index, url, localPath: ev.localPath });
        break;
      }
      case "partial_failed":
        handlers.onPartialFailed?.({
          index: ev.index,
          code: ev.code,
          message: ev.message,
        });
        break;
      case "completed":
        handlers.onCompleted?.({ usage: ev.usage });
        break;
      case "aborted":
        handlers.onAborted?.({ reason: ev.reason });
        break;
    }
  });

  // 把 unlisten 挂到全局，下次发起流式时清掉（防泄漏）
  // 这里用一个简易的全局单例模式：旧的 unlisten 先释放
  if ((generateImageStream as unknown as { _unlisten?: UnlistenFn })._unlisten) {
    try {
      ((generateImageStream as unknown as { _unlisten: UnlistenFn })._unlisten)();
    } catch {
      /* ignore */
    }
  }
  (generateImageStream as unknown as { _unlisten?: UnlistenFn })._unlisten = () => {
    try {
      unlisten();
    } catch {
      /* ignore */
    }
  };

  return requestId;
}

/** 把后端原始错误信息转成更友好的提示 */
export async function explainError(raw: string): Promise<string> {
  return await invoke<string>("explain_error", { raw });
}

/**
 * 给 outputFormat 设默认值：Y-agent 业务规则 — 5.0 Pro / Lite 默认 PNG，4.5 / 4.0 不设（API 默认 jpeg）。
 * - 调用方显式传了 png/jpeg → 不动
 * - 调用方传 undefined：
 *   - 5.0 Pro / Lite → 设 "png"
 *   - 4.5 / 4.0 → 不设（保持 undefined，让 API 走默认 jpeg）
 *   - 其它/未知 → 不设
 */
function applyOutputFormatDefault(
  params: GenerateImageParams
): GenerateImageParams {
  if (params.outputFormat) return params;
  const id = params.model;
  const is5x =
    id.startsWith("doubao-seedream-5-0-pro") ||
    id.startsWith("doubao-seedream-5-0-lite") ||
    id.startsWith("doubao-seedream-5-0-260128");
  if (is5x) {
    return { ...params, outputFormat: "png" };
  }
  return params;
}