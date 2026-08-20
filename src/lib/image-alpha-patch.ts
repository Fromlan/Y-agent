/**
 * 在上传给即梦 API 之前，给 PNG data URL "加 1 个透明像素"，绕过 5.0 Pro
 * `background: transparent` 接口"PNG 必须有至少 1 个透明像素"的校验。
 *
 * 关键性质：
 * - 原图字节 0 改动；只重写"飞过 API 的那份" data URL
 * - 失败 / 非 PNG / CORS 拒 / 解码失败 → 静默回退原 URL，让后端 explain_error 兜底
 * - 同一 sourceUrl 走模块级 Promise 缓存，避免重选同一图重复 decode/re-encode
 */

const cache = new Map<string, Promise<string>>();

/**
 * 把 data URL / 可解码的图片处理成"至少含 1 个透明像素"的 PNG data URL。
 * 任何失败都静默回退原 URL，不抛错。
 */
export function ensureHasTransparentPixel(sourceUrl: string): Promise<string> {
  if (!sourceUrl) return Promise.resolve(sourceUrl);
  // 快速短路：非 PNG data URL → 不处理（WebP/JPEG/SVG/远端 URL 等统一回退）
  // 注：远端 http(s) URL 也跳过（要走 CORS decode，对 24h 链接不稳，收益低）
  if (!sourceUrl.startsWith("data:image/png")) {
    return Promise.resolve(sourceUrl);
  }
  const cached = cache.get(sourceUrl);
  if (cached) return cached;
  const next = patch(sourceUrl).catch(() => sourceUrl);
  cache.set(sourceUrl, next);
  return next;
}

async function patch(pngDataUrl: string): Promise<string> {
  // 1. 用 <img> 解码 PNG（PNG 在浏览器内是 native 支持的）
  const img = await loadImage(pngDataUrl);

  // 2. 拿到画布（优先 OffscreenCanvas，回退 HTMLCanvasElement）
  const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);

  // 3. 画原图
  ctx.drawImage(img, 0, 0);

  // 4. 把 (0,0) 像素的 alpha 置 0
  const data = ctx.getImageData(0, 0, 1, 1);
  data.data[3] = 0;
  ctx.putImageData(data, 0, 0);

  // 5. 转回 data URL
  return await canvasToDataUrl(canvas, "image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

interface CanvasCtx {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

function createCanvas(w: number, h: number): CanvasCtx {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2d context unavailable");
    return { canvas, ctx };
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    return { canvas, ctx };
  }
  throw new Error("no canvas support in this environment");
}

async function canvasToDataUrl(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string
): Promise<string> {
  // OffscreenCanvas → Blob → data URL
  if (typeof (canvas as OffscreenCanvas).convertToBlob === "function") {
    const blob = await (canvas as OffscreenCanvas).convertToBlob({ type });
    return await blobToDataUrl(blob);
  }
  // HTMLCanvasElement → 直接 toDataURL
  if (typeof (canvas as HTMLCanvasElement).toDataURL === "function") {
    return (canvas as HTMLCanvasElement).toDataURL(type);
  }
  throw new Error("canvas has neither convertToBlob nor toDataURL");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}
