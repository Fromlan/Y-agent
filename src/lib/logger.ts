/**
 * 统一日志抽象。
 * - 现在：转 console.*（Tauri WebView 会显示在 DevTools / 终端里）
 * - 未来：可加 Tauri 后端日志上报、错误聚合（sentry/自建）
 *
 * 用法：
 *   import { log } from "@/lib/logger";
 *   log.warn("llm", "tool args parse failed:", err);
 *   log.error("project-detail", "save asset failed:", err);
 *
 * 设计原则：
 * - 第一个参数是"模块名"（小写短串），便于快速定位
 * - 后续参数同 console.log，可读性好
 * - 内部用 console.*，生产环境构建天然 tree-shake 不掉（Vite 会保留 console）；
 *   如果未来想发布版静默，加 VITE_LOG_LEVEL=error 之类环境开关即可
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** 当前最低输出等级。开发期 = debug；可由环境变量覆盖。 */
const currentLevel: number = LEVEL_ORDER[
  ((import.meta.env.VITE_LOG_LEVEL as Level) || "debug") as Level
] ?? LEVEL_ORDER.debug;

function shouldLog(level: Level): boolean {
  return LEVEL_ORDER[level] >= currentLevel;
}

function fmt(tag: string, level: Level): string {
  const t = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  return `[${t}] [${level.toUpperCase()}] [${tag}]`;
}

function emit(level: Level, tag: string, args: unknown[]): void {
  if (!shouldLog(level)) return;
  const prefix = fmt(tag, level);
  switch (level) {
    case "debug":
      console.debug(prefix, ...args);
      break;
    case "info":
      console.info(prefix, ...args);
      break;
    case "warn":
      console.warn(prefix, ...args);
      break;
    case "error":
      console.error(prefix, ...args);
      break;
  }
}

export const log = {
  debug: (tag: string, ...args: unknown[]) => emit("debug", tag, args),
  info: (tag: string, ...args: unknown[]) => emit("info", tag, args),
  warn: (tag: string, ...args: unknown[]) => emit("warn", tag, args),
  error: (tag: string, ...args: unknown[]) => emit("error", tag, args),
};
