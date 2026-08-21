/**
 * MiniMax H3-Context-IR 视频提示词增强 API 客户端（前端封装）。
 *
 * ## 设计要点
 * - **永远不抛异常**：`optimizeVideoPrompt` 失败时 Rust 端兜底为
 *   `{ prompt: 原 prompt, isOptimized: false, reason }`，前端拿到后用 `result.prompt` 继续 video submit。
 * - **demo 模式**：API Key 以 `demo-` 开头时，Rust 不调真实 API，
 *   返回合成增强 prompt（reason="demo"）。UI 完整流程在 demo 模式可跑通。
 *
 * ## 失败兜底约定
 * 任何 reason（除 "ok" / "demo"）都意味着没增强成功，调用方应：
 * 1. 用 `result.prompt`（即原 prompt 透传）继续 video submit
 * 2. 弹一条 toast 告知用户「优化跳过（原因）」
 *
 * ## 调用时机
 * 由 `ProjectDetail.onSubmitVideo` 在调 `submitVideo` 之前调用。
 * 当前对话模式下不调（chat agent 路径仍只走图片生成 plan）。
 */
import { invoke } from "@tauri-apps/api/core";
import type { ContentItem, VideoRatio } from "@/lib/video";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 优化结果的状态/原因。前端按 `isOptimized` 决定是否弹"优化跳过"toast，
 * 并用 `result.prompt` 继续调 video submit。
 *
 * 字符串值必须与 Rust 端 `h3_context_ir::OptimizeReason` 的
 * `#[serde(rename_all = "snake_case")]` 序列化结果一致。
 */
export type OptimizeReason =
  /** 真实 API 增强成功 */
  | "ok"
  /** Demo 模式（key 以 demo- 开头），不调真实 API */
  | "demo"
  /** 用户主动关闭（前端跳过整个流程，正常不会进 Rust） */
  | "skipped"
  /** API 限流 (429/1002) */
  | "rate_limit"
  /** 鉴权失败 (401/1004) */
  | "auth"
  /** 余额不足 (402/1008) */
  | "insufficient_balance"
  /** 内容敏感 (422/1026) */
  | "sensitive"
  /** 参数错误 (400/2013) */
  | "invalid_param"
  /** 轮询超过 60s 总超时 */
  | "timeout"
  /** 连续 3 次 poll 失败 */
  | "network"
  /** 响应解析失败 / 字段缺失 */
  | "parse"
  /** content.prompt 为空 */
  | "empty_response";

/**
 * 优化结果。
 * - `prompt`：最终给 video_generation 用的 text。增强成功时是 H3 返回的增强 prompt；失败时是原 prompt 透传。
 * - `isOptimized`：是否真的被 H3 增强过。false 时调用方应用 `explainOptimizeReason` 弹 toast。
 * - `reason`：优化结果的状态/原因。
 */
export interface H3OptimizeResult {
  prompt: string;
  isOptimized: boolean;
  reason: OptimizeReason;
}

/** H3-Context-IR 入参。content 形状和 video_generation 一致。 */
export interface OptimizeParams {
  model: "MiniMax-H3";
  content: ContentItem[];
  duration: number; // 4..=15
  ratio?: VideoRatio; // t2va 必填 ≠ adaptive；i2va 强制 adaptive；r2va 可选
}

// ============================================================================
// API 调用
// ============================================================================

/**
 * 同步执行 H3-Context-IR submit + poll，**永远不会抛异常**。
 *
 * 失败时返回 `{ prompt: originalPrompt, isOptimized: false, reason }`，
 * 唯一可能抛的情况是视频 API Key 未设置（Rust 端 Err("视频 API Key 未设置")）。
 */
export async function optimizeVideoPrompt(
  params: OptimizeParams,
  originalPrompt: string
): Promise<H3OptimizeResult> {
  return await invoke<H3OptimizeResult>("jimeng_h3_optimize", {
    params,
    originalPrompt,
  });
}

// ============================================================================
// UI 辅助
// ============================================================================

/**
 * 把 OptimizeReason 翻译成中文短句，供 UI 弹 toast 用。
 * 返回 null 表示「成功 / demo」等不需要弹。
 */
export function explainOptimizeReason(r: OptimizeReason): string | null {
  switch (r) {
    case "ok":
    case "demo":
      return null;
    case "rate_limit":
      return "API 限流";
    case "auth":
      return "鉴权失败";
    case "insufficient_balance":
      return "余额不足";
    case "sensitive":
      return "触发内容审核";
    case "invalid_param":
      return "参数错误";
    case "timeout":
      return "优化超时";
    case "network":
      return "网络异常";
    case "parse":
      return "响应解析失败";
    case "empty_response":
      return "返回为空";
    case "skipped":
      return "用户跳过";
  }
}

/**
 * 是否真正的成功。`ok` / `demo` 都算成功，UI 弹「已优化」。
 */
export function isOptimizeSuccess(r: OptimizeReason): boolean {
  return r === "ok" || r === "demo";
}

/**
 * 是否硬失败（程序员 bug，不应该出现）。
 * 出现时说明前端传参错了或响应解析出错 —— 不应该静默兜底,
 * 必须 toast.error 弹给用户看到,避免「视频能跑但其实没增强」的隐性 bug。
 *
 * 软失败（rate_limit / auth / network / timeout / sensitive / ...）走静默降级即可,
 * 因为这些是用户可恢复或环境性的,不影响最终视频生成。
 */
export function isHardFailure(r: OptimizeReason): boolean {
  return r === "invalid_param" || r === "parse";
}
