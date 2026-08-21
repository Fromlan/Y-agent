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
 * 判断归一化 bbox 是否“可用”。
 *
 * 与 `layerRectNormalized` 的容错规则保持一致：长度为 4、数值有限、
 * 且右 > 左、下 > 上（反向 / 零面积都视为不可用）。
 * 越界值仍算可用（`layerRectNormalized` 会裁剪到 [0, 1]）。
 */
export function isNormalizedBboxValid(n: number[] | undefined): boolean {
  if (!n || n.length !== 4) return false;
  if (!n.every((v) => Number.isFinite(v))) return false;
  const [l, t, r, b] = n;
  return r > l && b > t;
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
  if (
    abs &&
    abs.length === 4 &&
    abs.every((v) => Number.isFinite(v)) &&
    abs[2] > abs[0] &&
    abs[3] > abs[1]
  ) {
    [l, t, r, b] = abs;
  } else {
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
 * 缺失 / 反向 / 零面积 / 非有限 / 长度不对 → 铺满 [0, 0, 1, 1]。
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
  if (!isNormalizedBboxValid(n)) return { left: 0, top: 0, width: 1, height: 1 };
  let [l, t, r, b] = n!.map((v) => v / 1000);
  // 裁剪到 [0, 1]（防 API 偶发越界值）
  l = Math.max(0, Math.min(1, l));
  t = Math.max(0, Math.min(1, t));
  r = Math.max(0, Math.min(1, r));
  b = Math.max(0, Math.min(1, b));
  return { left: l, top: t, width: r - l, height: b - t };
}

/**
 * 派生一组图层的 bbox 健康度。
 *
 * 用于:
 * - `LayerCompositeStage` 决定是否显示 "位置信息缺失" 警告 banner
 * - `AssetDetailDialog` 决定整体降级到单图层视图
 * - 任何依赖 bbox 的 UI（资产卡 mini 缩略图等）
 *
 * 判定标准（"ok"）：
 * - `boundingBox.normalized` 存在
 * - 长度恰好 4
 * - 4 个值都是有限数（不是 `NaN` / `Infinity`）
 * - 右 > 左、下 > 上（反向 / 零面积 bbox 在合成视图里没有意义）
 *
 * 底图层（zIndex=0）即使缺 bbox 也算 ok — 底图本就铺满，不影响合成。
 * 这条规则避免"5.0 Pro 不给底图返 bbox（合理）"被误判为缺失。
 *
 * 返回值:
 * - `ok`: 健康图层数（>=0）
 * - `missing`: 缺 bbox 的图层 indices 列表（用于"哪一个有问题"定位）
 * - `total`: 输入的图层总数
 */
export function getBboxHealth(layers: GeneratedImage[]): {
  ok: number;
  missing: number[];
  total: number;
} {
  const missing: number[] = [];
  let ok = 0;
  for (let i = 0; i < layers.length; i++) {
    const img = layers[i];
    // 底图层：缺 bbox 视为健康（应当铺满）
    const isBase = (img.zIndex ?? 0) === 0;
    if (isBase) {
      ok += 1;
      continue;
    }
    if (isNormalizedBboxValid(img.boundingBox?.normalized)) {
      ok += 1;
    } else {
      missing.push(i);
    }
  }
  return { ok, missing, total: layers.length };
}

/**
 * 派生「资产卡缩略图里应该显示的主体图层」。
 *
 * 用法：`LayerThumbnailMini` 56x56 缩略图已经从「3 个 bbox 色块叠加」简化为
 * 「主体图层整张铺满 + accent 单边框」；这个函数告诉组件哪一层是「主体」。
 *
 * 判定规则(按优先级):
 * 1. 过滤出所有「非底图层」(`zIndex > 0`)且 bbox 完整
 * 2. 计算 `width * height`(normalized 矩形面积)作为「视觉占比」分值
 * 3. 取分值最大的层;并列时取 zIndex 较大的(更上层的视觉上更突出)
 * 4. 找不到 → 退化:
 *    - 有底图层 → 返底图层(整体铺满,主图就是它)
 *    - 连底图层都没有 → 返 `null`,让调用方决定占位策略
 *
 * 与 `getBboxHealth` 配合使用：父组件可以先看 `bboxHealth.missing.length` 决定
 * 是否显示「缺位置」警告角标，再调本函数取主体。
 */
export function pickMainLayer(layers: GeneratedImage[]): GeneratedImage | null {
  if (layers.length === 0) return null;
  const baseLayer = layers.find((l) => (l.zIndex ?? 0) === 0) ?? null;
  // 候选：非底图层 + normalized bbox 完整且可用（含面积 > 0）
  const candidates = layers.filter(
    (l) => (l.zIndex ?? 0) !== 0 && isNormalizedBboxValid(l.boundingBox?.normalized)
  );
  if (candidates.length > 0) {
    // 按 (area, zIndex) 二元比较：area 降序 → zIndex 降序（同面积时取更上层的）
    // 不用“area * 1e6 + zIndex”的合成分数，避免浮点误差导致面积微差被 zIndex 反超。
    const area = (l: GeneratedImage) => {
      const n = l.boundingBox!.normalized!;
      const [l0, t0, r0, b0] = n.map((v) => v / 1000);
      return (r0 - l0) * (b0 - t0);
    };
    let best = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      const cur = candidates[i];
      const curArea = area(cur);
      const bestArea = area(best);
      if (
        curArea > bestArea ||
        (curArea === bestArea && (cur.zIndex ?? 0) > (best.zIndex ?? 0))
      ) {
        best = cur;
      }
    }
    return best;
  }
  // 退化：所有非底图层都缺 bbox → 返底图层(铺满)或 null
  return baseLayer;
}
