import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * P5+：把图片 URL 解析为浏览器可用的 src。
 *
 * - http(s):// / data: / blob: / asset: → 直接返回
 * - 本地绝对路径（Windows C:\... 或 POSIX /...）→ 调 `convertFileSrc`
 *   拿到 `asset://localhost/<encoded>` URL，Webview 通过内置 asset 协议
 *   处理器从本地磁盘直读，**零 IPC，零 base64 编码**。
 *
 * 缓存：同一路径的 asset URL 在内存里缓存，避免重复字符串处理。
 * 缓存是纯字符串 mapping 优化（convertFileSrc 本身是同步的纯函数），
 * 不持有任何 IO 状态，进程生命周期即可。
 */
const pathToAssetUrl = new Map<string, string>();

/** 把本地绝对路径转为 `asset://` URL。开发模式（无 Tauri）容错回退。 */
export function localPathToAssetUrl(absolutePath: string): string {
    const cached = pathToAssetUrl.get(absolutePath);
    if (cached) return cached;
    let url: string;
    try {
        url = convertFileSrc(absolutePath);
    } catch (e) {
        // 没在 Tauri 运行时（dev mode 跑 vite 直接打开）→ 回退到 file://
        // 或原值。容错，避免让整个资产库崩溃。
        console.warn("convertFileSrc failed for", absolutePath, e);
        url = absolutePath.startsWith("/") ? `file://${absolutePath}` : absolutePath;
    }
    pathToAssetUrl.set(absolutePath, url);
    return url;
}

/** 判断字符串是否像本地绝对路径（Windows C:\、UNC \\、POSIX /）。 */
function looksLikeLocalPath(s: string): boolean {
    return !/^(https?:|data:|blob:|asset:)/i.test(s) && /[\\/]/.test(s);
}

export async function resolveImageUrl(
    input: string | null | undefined
): Promise<string> {
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
    // 本地路径：直接走 asset 协议
    if (looksLikeLocalPath(input)) {
        return localPathToAssetUrl(input);
    }
    // 其它（如相对路径）原样返回
    return input;
}

/** 同步版本：优先返回缓存；未缓存时调 `localPathToAssetUrl`（内部同步）。 */
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
    if (looksLikeLocalPath(input)) {
        return localPathToAssetUrl(input);
    }
    return input;
}

/**
 * 预热：提前把 src 加入 asset URL 缓存。
 * asset 协议是浏览器直读本地磁盘，无 IPC、无 base64 编码，预热价值不大，
 * 保留接口只是不破坏 SafeImage 调用方。
 */
export function prefetchImageUrl(input: string | null | undefined): void {
    if (!input) return;
    if (
        input.startsWith("http://") ||
        input.startsWith("https://") ||
        input.startsWith("data:")
    ) {
        return;
    }
    if (looksLikeLocalPath(input)) {
        localPathToAssetUrl(input);
    }
}
