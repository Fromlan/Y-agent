/**
 * 图层视图的纯函数助手。
 * 从 `AssetDetailDialog` 抽出，便于单测。
 */
import type { GeneratedImage } from "@/lib/types";

/**
 * 派生"当前应该在合成画布上渲染的图层列表"。
 *
 * 优先级：
 * - `solo` 不为 null → 只返 solo 那一层（无视 hidden）
 * - 否则 → 排除 hidden 里的索引
 *
 * 输入的 `layers` 应已按 `zIndex` 升序排好（用 `flatAssetImages`）。
 * 索引 `i` 在这里指 layers 数组里的位置，**不**是 zIndex 值。
 */
export function pickVisibleLayers(
  layers: GeneratedImage[],
  hidden: ReadonlySet<number>,
  solo: number | null
): GeneratedImage[] {
  if (solo !== null) {
    const target = layers[solo];
    return target ? [target] : [];
  }
  if (hidden.size === 0) return layers;
  return layers.filter((_, i) => !hidden.has(i));
}

/**
 * 从 base 图层（zIndex=0）的 `size` 字段解析像素。
 * 缺失或格式非法时回退到 2048x2048（5.0 Pro 文档保证返回 `size`）。
 */
export function parseBaseSize(base: GeneratedImage | undefined, fallback: { w: number; h: number } = { w: 2048, h: 2048 }): { w: number; h: number } {
  if (!base?.size) return fallback;
  const m = base.size.match(/^(\d+)x(\d+)$/);
  if (!m) return fallback;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return fallback;
  return { w, h };
}

/**
 * 把一个 layer 的 `boundingBox.absolute` 解析成 base 画布上的归一化矩形。
 * 缺失时铺满全画布。
 */
export function layerRectPercent(
  layer: GeneratedImage,
  base: { w: number; h: number }
): { left: number; top: number; width: number; height: number } {
  const abs = layer.boundingBox?.absolute;
  let l: number;
  let t: number;
  let r: number;
  let b: number;
  if (abs && abs.length === 4) {
    [l, t, r, b] = abs;
  } else {
    l = 0; t = 0; r = base.w; b = base.h;
  }
  // 容错：r<l 或 b<t 视为无效，回退铺满
  if (r <= l || b <= t) {
    l = 0; t = 0; r = base.w; b = base.h;
  }
  // 裁剪到画布范围（防越界 bbox 拖出画布）
  l = Math.max(0, Math.min(l, base.w));
  t = Math.max(0, Math.min(t, base.h));
  r = Math.max(0, Math.min(r, base.w));
  b = Math.max(0, Math.min(b, base.h));
  return {
    left: (l / base.w) * 100,
    top: (t / base.h) * 100,
    width: ((r - l) / base.w) * 100,
    height: ((b - t) / base.h) * 100,
  };
}

/**
 * 从 layer 的 `boundingBox.normalized`（0-1000）解析成 [0, 1] 浮点矩形。
 * 缺失 / 越界 / 反向 / 长度不对 → 铺满 [0, 0, 1, 1]。
 *
 * 关键：**aspect-independent**。base 画布是 2048x2048 还是 1024x1536 都不影响
 * 这套坐标的语义——这是 5.0 Pro 官方文档明确推荐的"任意尺寸目标画布"方案
 * （`bounding_box.normalized` 段）。
 *
 * 适用：合成视图渲染、导出任意尺寸合成图、bbox 兜底（当 API 报告的 base size
 * 跟实际 base 图不符时，`absolute` 坐标系会越界/错位，`normalized` 不会）。
 */
export function layerRectNormalized(
  layer: GeneratedImage
): { left: number; top: number; width: number; height: number } {
  const n = layer.boundingBox?.normalized;
  if (!n || n.length !== 4) return { left: 0, top: 0, width: 1, height: 1 };
  let [l, t, r, b] = n.map((v) => v / 1000);
  // 容错：r<=l 或 b<=t 视为无效，回退铺满
  if (r <= l || b <= t) return { left: 0, top: 0, width: 1, height: 1 };
  // 裁剪到 [0, 1]（防 API 偶发越界值）
  l = Math.max(0, Math.min(1, l));
  t = Math.max(0, Math.min(1, t));
  r = Math.max(0, Math.min(1, r));
  b = Math.max(0, Math.min(1, b));
  return { left: l, top: t, width: r - l, height: b - t };
}
