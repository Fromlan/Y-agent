/**
 * 统一封装 Tauri 系统对话框。
 * - 优先走 tauri-plugin-dialog（系统原生风格）
 * - 在非 Tauri 环境下（如纯 Vite 浏览器调试）降级到 window.confirm
 *
 * 为什么不用浏览器原生的 window.confirm / window.prompt？
 * - 桌面应用里原生对话框跟整体 UI 风格不搭
 * - 部分 WebView 禁用 window.prompt
 * - 无法设置标题 / 警告级别
 */
import { ask as tauriAsk, confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";

/** 是否运行在 Tauri 桌面端。SSR / 纯浏览器调试时为 false。 */
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface ConfirmOptions {
  title?: string;
  kind?: "info" | "warning" | "error";
  okLabel?: string;
  cancelLabel?: string;
}

/**
 * 询问用户 yes/no。返回 true = 用户点了"是/确认"。
 * - Tauri: 走系统原生 ask
 * - 浏览器: 降级 window.confirm
 */
export async function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (isTauri()) {
    return await tauriAsk(message, {
      title: options.title ?? "Y-agent",
      kind: options.kind ?? "warning",
      okLabel: options.okLabel ?? "确认",
      cancelLabel: options.cancelLabel ?? "取消",
    });
  }
  return window.confirm(message);
}

/** 同 confirmDialog，但 UI 用 Ok/Cancel 文本。语义上更偏"执行操作"而非"问问题"。 */
export async function okCancelDialog(
  message: string,
  options: ConfirmOptions = {}
): Promise<boolean> {
  if (isTauri()) {
    return await tauriConfirm(message, {
      title: options.title ?? "Y-agent",
      kind: options.kind ?? "warning",
      okLabel: options.okLabel ?? "确定",
      cancelLabel: options.cancelLabel ?? "取消",
    });
  }
  return window.confirm(message);
}
