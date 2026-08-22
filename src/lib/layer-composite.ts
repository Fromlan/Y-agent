/**
 * 多层资产缩略图合成器。
 *
 * 目标：让资产卡上可以看到「所有图层按 zIndex 叠放后的扁平结果」，而不是只显示底图或
 * 依赖多张 `<img>` 在 DOM 里绝对定位。
 *
 * 与 `AssetCard/LayerCompositeThumb` 的 DOM 叠放方案互为补充：
 * - DOM 叠放：零 IPC、即时可见，但每个图层资产会挂 N 个 `<SafeImage>`，且在小尺寸卡片里
 *   百分比定位容易受容器裁切影响。
 * - Canvas 扁平合成：把每层绘制到一张固定尺寸的画布上，得到一张单一缩略图。成功后卡片
 *   只渲染 1 个 `<img>`，性能更好；合成结果和详情页 `LayerCompositeStage` 保持同一套
 *   `boundingBox.normalized` 定位逻辑。
 *
 * 本地文件优先走 `read_image_data_url`（Tauri IPC 转 data URL），避免 `asset://` 自定义协议
 * 上 Canvas 可能被跨域策略污染的问题；失败时回退到 `resolveImageUrl`，再失败则由调用方
 * 回退到 DOM 叠放视图。
 */
import { invoke } from "@tauri-apps/api/core";
import type { Asset, GeneratedImage } from "@/lib/types";
import { flatAssetImages, imageInput } from "@/lib/types";
import { layerRectNormalized, parseBaseSize } from "@/lib/layer-view";
import { resolveImageUrl } from "@/lib/image-resolver";

export interface CompositeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 取用于合成的图层列表。
 *
 * 对历史 ToolsTab 数据（`isLayerDecomposition=true` 但 `payload.layers` 缺失，
 * 实际只有 `payload.urls` / `payload.localPaths`）做兼容：按 url/localPath 顺序补上
 * `zIndex`（0 = 底图，1..N = 图层），让 Canvas 合成和 DOM fallback 能把分层叠出来。
 * 新数据仍然走 `flatAssetImages`。
 */
export function layerImagesForComposite(asset: Asset): GeneratedImage[] {
  if (
    asset.isLayerDecomposition &&
    !asset.payload.layers?.length &&
    asset.payload.urls.length > 0
  ) {
    return asset.payload.urls.map((url, i) => ({
      url,
      ...(asset.payload.localPaths?.[i] ? { localPath: asset.payload.localPaths![i] } : {}),
      zIndex: i,
      ...(i === 0 ? { name: "底图" } : { name: `图层 ${i}` }),
    }));
  }
  return flatAssetImages(asset);
}

interface CanvasBundle {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

/** 生成缩略图缓存键，避免同一资产反复 decode。 */
export function layerCompositeCacheKey(
  asset: Asset,
  outputWidth: number
): string {
  const layers = layerImagesForComposite(asset);
  const sources = layers
    .map((l) => {
      const n = l.boundingBox?.normalized;
      const bbox = n ? n.join(",") : "";
      return `${imageInput(l)}|${l.zIndex ?? 0}|${bbox}`;
    })
    .join("||");
  return `${asset.id}|${outputWidth}|${sources}`;
}

/** 计算 `object-fit: contain` 在容器中的绘制矩形。 */
export function containRect(
  containerW: number,
  containerH: number,
  imageW: number,
  imageH: number
): CompositeRect {
  if (imageW <= 0 || imageH <= 0 || containerW <= 0 || containerH <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(containerW / imageW, containerH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;
  return {
    x: (containerW - width) / 2,
    y: (containerH - height) / 2,
    width,
    height,
  };
}

/** 计算 `object-fit: cover` 在容器中的绘制矩形。 */
export function coverRect(
  containerW: number,
  containerH: number,
  imageW: number,
  imageH: number
): CompositeRect {
  if (imageW <= 0 || imageH <= 0 || containerW <= 0 || containerH <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.max(containerW / imageW, containerH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;
  return {
    x: (containerW - width) / 2,
    y: (containerH - height) / 2,
    width,
    height,
  };
}

function looksLikeLocalPath(src: string): boolean {
  return !/^(https?:|data:|blob:|asset:)/i.test(src) && /[\\/]/.test(src);
}

async function readLocalImageAsDataUrl(path: string): Promise<string> {
  return await invoke<string>("read_image_data_url", { path });
}

async function loadImageElement(
  layer: GeneratedImage
): Promise<{ img: HTMLImageElement; source: string }> {
  const source = imageInput(layer);
  if (!source) throw new Error("layer has no image source");
  let url: string;
  if (looksLikeLocalPath(source)) {
    try {
      url = await readLocalImageAsDataUrl(source);
    } catch {
      // 非 Tauri 环境 / IPC 失败时退回 asset://，能显示就继续，不能显示由调用方 fallback。
      url = await resolveImageUrl(source);
    }
  } else {
    url = await resolveImageUrl(source);
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, source });
    img.onerror = () => reject(new Error(`layer image load failed: ${source}`));
    img.src = url;
  });
}

function createCanvas(width: number, height: number): CanvasBundle {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2d context unavailable");
    return { canvas, ctx };
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
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
  if (typeof (canvas as OffscreenCanvas).convertToBlob === "function") {
    const blob = await (canvas as OffscreenCanvas).convertToBlob({ type });
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  }
  if (typeof (canvas as HTMLCanvasElement).toDataURL === "function") {
    return (canvas as HTMLCanvasElement).toDataURL(type);
  }
  throw new Error("canvas has neither convertToBlob nor toDataURL");
}

function drawCover(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: HTMLImageElement,
  containerW: number,
  containerH: number
): void {
  const r = coverRect(containerW, containerH, img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, r.x, r.y, r.width, r.height);
}

function drawContain(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: CompositeRect
): void {
  const r = containRect(rect.width, rect.height, img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, rect.x + r.x, rect.y + r.y, r.width, r.height);
}

/**
 * 把图层扁平合成到一张 PNG data URL。
 *
 * 规则与 `LayerCompositeStage` / `LayerCompositeThumb` 保持一致：
 * - 底图层（zIndex=0）铺满整张画布（cover）
 * - 非底图层按 `boundingBox.normalized` 定位到画布，`object-fit: contain` 缩放
 * - bbox 缺失的非底图层按全画布 contain 兜底（缩略图阶段不再静默丢弃，优先保证有图可看）
 *
 * 输出尺寸默认 320px 宽，高度按底图/首张图自然比例或 `size` 字段推算。
 */
export async function flattenLayersToDataUrl(
  layers: GeneratedImage[],
  outputWidth = 320
): Promise<string> {
  if (layers.length === 0) throw new Error("no layers to composite");

  const baseLayer =
    layers.find((l) => (l.zIndex ?? 0) === 0) ?? layers[0];
  const baseSize = parseBaseSize(baseLayer);

  // 并发加载所有图层，避免多图层缩略图等待 N 次串行 IPC/网络。
  const settled = await Promise.allSettled(layers.map((layer) => loadImageElement(layer)));
  const loaded: { layer: GeneratedImage; img: HTMLImageElement }[] = [];
  settled.forEach((item, i) => {
    if (item.status === "fulfilled") {
      loaded.push({ layer: layers[i], img: item.value.img });
    }
  });
  // 单张加载失败时，尝试用已加载的图层继续合成；如果一张都加载不了则向上抛错。
  if (loaded.length === 0) throw new Error("all layers failed to load");

  // 画布比例优先用已加载底图的真实 natural size；API 的 size 字段偶尔不准。
  const baseLoaded = loaded.find((item) => (item.layer.zIndex ?? 0) === 0) ?? loaded[0];
  const naturalW = baseLoaded.img.naturalWidth;
  const naturalH = baseLoaded.img.naturalHeight;
  const aspect = naturalW > 0 && naturalH > 0 ? naturalH / naturalW : baseSize.h / baseSize.w;
  const canvasWidth = Math.max(64, Math.round(outputWidth));
  const canvasHeight = Math.max(64, Math.round(outputWidth * aspect));

  const { canvas, ctx } = createCanvas(canvasWidth, canvasHeight);
  // 默认透明背景（合成结果保留 alpha）
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  for (const { layer, img } of loaded) {
    const isBase = (layer.zIndex ?? 0) === 0;
    if (isBase) {
      drawCover(ctx, img, canvasWidth, canvasHeight);
    } else {
      const n = layerRectNormalized(layer);
      const rect = {
        x: n.left * canvasWidth,
        y: n.top * canvasHeight,
        width: n.width * canvasWidth,
        height: n.height * canvasHeight,
      };
      drawContain(ctx, img, rect);
    }
  }

  return await canvasToDataUrl(canvas, "image/png");
}

const compositeCache = new Map<string, Promise<string>>();

/**
 * 获取资产的多层合成缩略图（data URL），带内存缓存。
 * - 同一资产（图层源/bbox 不变）只会真正 decode 一次
 * - 失败不缓存，调用方回退到 DOM 叠放
 */
export function getLayerCompositeDataUrl(
  asset: Asset,
  outputWidth = 320
): Promise<string> {
  const key = layerCompositeCacheKey(asset, outputWidth);
  const cached = compositeCache.get(key);
  if (cached) return cached;
  const layers = layerImagesForComposite(asset);
  const next = flattenLayersToDataUrl(layers, outputWidth).catch((err) => {
    compositeCache.delete(key);
    throw err;
  });
  compositeCache.set(key, next);
  return next;
}
