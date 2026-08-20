import { invoke } from "@tauri-apps/api/core";

/**
 * P5：把图片 URL 解析为浏览器可用的 src。
 * - http(s):// → 直接返回（24h 失效前用）
 * - data: → 直接返回（demo 模式 / b64 流式）
 * - 本地绝对路径（Windows C:\... 或 POSIX /...）→ 调 read_image_data_url 读成 data URL
 *
 * 缓存：同一路径的 data URL 在内存里缓存，避免重复 IPC。
 */
const dataUrlCache = new Map<string, string>();

export async function resolveImageUrl(input: string | null | undefined): Promise<string> {
  if (!input) return "";
  // http(s) / data: / blob: / asset: 直接用
  if (
    input.startsWith("http://") ||
    input.startsWith("https://") ||
    input.startsWith("data:") ||
    input.startsWith("blob:") ||
    input.startsWith("asset:")
  ) {
    return input;
  }
  // 本地路径：调后端读
  const cached = dataUrlCache.get(input);
  if (cached) return cached;
  try {
    const dataUrl = await invoke<string>("read_image_data_url", { path: input });
    dataUrlCache.set(input, dataUrl);
    return dataUrl;
  } catch (e) {
    // 失败时回退到原值（可能前端用了别的 scheme，或文件已被删）
    console.warn("read_image_data_url failed for", input, e);
    return input;
  }
}

/** 同步版本：优先返回缓存；未缓存时回退 input 本身（异步解析中可先用原值） */
export function resolveImageUrlSync(input: string | null | undefined): string {
  if (!input) return "";
  if (
    input.startsWith("http://") ||
    input.startsWith("https://") ||
    input.startsWith("data:") ||
    input.startsWith("blob:") ||
    input.startsWith("asset:")
  ) {
    return input;
  }
  return dataUrlCache.get(input) ?? input;
}

/** 异步触发预解析（不阻塞 UI） */
export function prefetchImageUrl(input: string | null | undefined): void {
  if (!input) return;
  if (
    input.startsWith("http://") ||
    input.startsWith("https://") ||
    input.startsWith("data:")
  ) {
    return;
  }
  if (dataUrlCache.has(input)) return;
  // 静默异步解析
  void resolveImageUrl(input).catch(() => {});
}
