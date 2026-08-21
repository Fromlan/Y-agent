import { describe, it, expect } from "vitest";
import { pickVisibleLayers, parseBaseSize, layerRectPercent, layerRectNormalized, getBboxHealth, pickMainLayer, isNormalizedBboxValid } from "@/lib/layer-view";
import type { GeneratedImage } from "@/lib/types";

const L = (i: number): GeneratedImage => ({ url: `l${i}.png`, zIndex: i });

describe("pickVisibleLayers", () => {
  it("全显示 + 无 solo → 返回全部（保持顺序）", () => {
    const layers = [L(0), L(1), L(2)];
    const out = pickVisibleLayers(layers, new Set(), null);
    expect(out.map((x) => x.zIndex)).toEqual([0, 1, 2]);
  });

  it("有 hidden → 排除 hidden 索引", () => {
    const layers = [L(0), L(1), L(2)];
    const out = pickVisibleLayers(layers, new Set([1]), null);
    expect(out.map((x) => x.zIndex)).toEqual([0, 2]);
  });

  it("有 solo → 只返 solo 那一层", () => {
    const layers = [L(0), L(1), L(2)];
    const out = pickVisibleLayers(layers, new Set(), 1);
    expect(out.map((x) => x.zIndex)).toEqual([1]);
  });

  it("hidden 和 solo 同时存在 → solo 胜出", () => {
    const layers = [L(0), L(1), L(2)];
    const out = pickVisibleLayers(layers, new Set([0, 2]), 1);
    expect(out.map((x) => x.zIndex)).toEqual([1]);
  });

  it("空 layers → 返 []", () => {
    expect(pickVisibleLayers([], new Set(), null)).toEqual([]);
    expect(pickVisibleLayers([], new Set([0]), 0)).toEqual([]);
  });

  it("单图层（仅底图）→ 返 1 个", () => {
    const layers = [L(0)];
    expect(pickVisibleLayers(layers, new Set(), null)).toEqual([L(0)]);
    expect(pickVisibleLayers(layers, new Set([0]), null)).toEqual([]);
    expect(pickVisibleLayers(layers, new Set(), 0)).toEqual([L(0)]);
  });

  it("solo 索引越界 → 返 []（不抛错）", () => {
    const layers = [L(0), L(1)];
    expect(pickVisibleLayers(layers, new Set(), 5)).toEqual([]);
  });
});

describe("parseBaseSize", () => {
  it("合法 size 字符串 → 解析像素", () => {
    expect(parseBaseSize({ url: "x", size: "2048x2048" })).toEqual({ w: 2048, h: 2048 });
    expect(parseBaseSize({ url: "x", size: "1024x1536" })).toEqual({ w: 1024, h: 1536 });
  });

  it("缺失 size → 回退 2048x2048", () => {
    expect(parseBaseSize({ url: "x" })).toEqual({ w: 2048, h: 2048 });
    expect(parseBaseSize(undefined)).toEqual({ w: 2048, h: 2048 });
  });

  it("非法 size 格式 → 回退", () => {
    expect(parseBaseSize({ url: "x", size: "abc" })).toEqual({ w: 2048, h: 2048 });
    expect(parseBaseSize({ url: "x", size: "2048" })).toEqual({ w: 2048, h: 2048 });
  });

  it("可定制 fallback", () => {
    expect(parseBaseSize(undefined, { w: 1024, h: 1024 })).toEqual({ w: 1024, h: 1024 });
  });
});

describe("layerRectPercent", () => {
  const base = { w: 2048, h: 2048 };

  it("无 boundingBox → 铺满 100%/100%", () => {
    const r = layerRectPercent({ url: "x" }, base);
    expect(r).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });

  it("正常 bbox → 转成百分比", () => {
    const r = layerRectPercent(
      { url: "x", boundingBox: { absolute: [0, 0, 1024, 2048] } },
      base
    );
    expect(r).toEqual({ left: 0, top: 0, width: 50, height: 100 });
  });

  it("bbox 在画布中部", () => {
    const r = layerRectPercent(
      { url: "x", boundingBox: { absolute: [512, 512, 1536, 1536] } },
      base
    );
    expect(r).toEqual({ left: 25, top: 25, width: 50, height: 50 });
  });

  it("bbox 越界 → 裁剪到画布", () => {
    const r = layerRectPercent(
      { url: "x", boundingBox: { absolute: [-100, -100, 3000, 3000] } },
      base
    );
    expect(r).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });

  it("bbox 反向 (r<=l) → 回退铺满", () => {
    const r = layerRectPercent(
      { url: "x", boundingBox: { absolute: [2000, 0, 1000, 2048] } },
      base
    );
    expect(r).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });
});

describe("layerRectNormalized（aspect-independent bbox，0-1000 -> 0-1）", () => {
  it("正常 [187, 59, 808, 188] -> 0-1 浮点矩形", () => {
    const r = layerRectNormalized({
      url: "x",
      boundingBox: { normalized: [187, 59, 808, 188] },
    });
    expect(r).toEqual({ left: 0.187, top: 0.059, width: 0.621, height: 0.129 });
  });

  it("缺失 normalized -> 铺满 [0, 0, 1, 1]", () => {
    expect(layerRectNormalized({ url: "x" })).toEqual({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
    // 仅 absolute 也不算
    expect(
      layerRectNormalized({ url: "x", boundingBox: { absolute: [0, 0, 2048, 2048] } })
    ).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it("越界 (norm > 1000 或 < 0) -> clamp 到 [0, 1]", () => {
    const r = layerRectNormalized({
      url: "x",
      boundingBox: { normalized: [-100, 0, 1500, 1000] },
    });
    expect(r).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it("反向 (r<=l 或 b<=t) -> 铺满", () => {
    const r1 = layerRectNormalized({
      url: "x",
      boundingBox: { normalized: [800, 0, 200, 1000] }, // r<l
    });
    expect(r1).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    const r2 = layerRectNormalized({
      url: "x",
      boundingBox: { normalized: [0, 800, 1000, 200] }, // b<t
    });
    expect(r2).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    const r3 = layerRectNormalized({
      url: "x",
      boundingBox: { normalized: [500, 500, 500, 500] }, // r==l
    });
    expect(r3).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it("非 4 元素 / 空数组 -> 铺满", () => {
    expect(
      layerRectNormalized({ url: "x", boundingBox: { normalized: [0, 0, 1000] as unknown as number[] } })
    ).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    expect(
      layerRectNormalized({ url: "x", boundingBox: { normalized: [] } })
    ).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    expect(
      layerRectNormalized({ url: "x", boundingBox: { normalized: [0, 0, 1000, 1000, 500] as unknown as number[] } })
    ).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it("NaN / Infinity -> 铺满（而不是把 NaN 写进 style）", () => {
    expect(
      layerRectNormalized({ url: "x", boundingBox: { normalized: [NaN, 0, 500, 500] as unknown as number[] } })
    ).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    expect(
      layerRectNormalized({ url: "x", boundingBox: { normalized: [0, 0, Infinity, 500] as unknown as number[] } })
    ).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it("零面积 bbox -> 铺满", () => {
    expect(
      layerRectNormalized({ url: "x", boundingBox: { normalized: [100, 100, 100, 200] } })
    ).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });
});

describe("isNormalizedBboxValid — bbox 可用性判定", () => {
  it("合法 bbox → true", () => {
    expect(isNormalizedBboxValid([187, 59, 808, 188])).toBe(true);
    expect(isNormalizedBboxValid([0, 0, 1000, 1000])).toBe(true);
  });

  it("缺失 / 长度不对 / 非有限 → false", () => {
    expect(isNormalizedBboxValid(undefined)).toBe(false);
    expect(isNormalizedBboxValid([])).toBe(false);
    expect(isNormalizedBboxValid([0, 0, 1000] as unknown as number[])).toBe(false);
    expect(isNormalizedBboxValid([NaN, 0, 500, 500] as unknown as number[])).toBe(false);
  });

  it("反向 / 零面积 → false", () => {
    expect(isNormalizedBboxValid([800, 0, 200, 1000])).toBe(false);
    expect(isNormalizedBboxValid([0, 800, 1000, 200])).toBe(false);
    expect(isNormalizedBboxValid([100, 100, 100, 200])).toBe(false);
    expect(isNormalizedBboxValid([100, 100, 200, 100])).toBe(false);
  });
});

describe("getBboxHealth — 派生图层 bbox 健康度", () => {
  it("全部 bbox 正常 → ok=total, missing=[]", () => {
    const layers: GeneratedImage[] = [
      { url: "b.png", zIndex: 0 }, // 底图没 bbox 也算 ok
      {
        url: "l1.png",
        zIndex: 1,
        boundingBox: { normalized: [187, 59, 808, 188] },
      },
      {
        url: "l2.png",
        zIndex: 2,
        boundingBox: { normalized: [10, 20, 100, 200] },
      },
    ];
    const h = getBboxHealth(layers);
    expect(h).toEqual({ ok: 3, missing: [], total: 3 });
  });

  it("底图（zIndex=0）即使缺 bbox 也算 ok", () => {
    // 这是关键：5.0 Pro 实际响应里底图往往不带 bbox（应当铺满），
    // 不能误判为缺失。
    const layers: GeneratedImage[] = [
      { url: "b.png", zIndex: 0, size: "2048x2048" },
      {
        url: "l1.png",
        zIndex: 1,
        boundingBox: { normalized: [187, 59, 808, 188] },
      },
    ];
    const h = getBboxHealth(layers);
    expect(h).toEqual({ ok: 2, missing: [], total: 2 });
  });

  it("部分图层缺 bbox → missing 列出 indices, ok 不计（反向/零面积也算缺）", () => {
    const layers: GeneratedImage[] = [
      { url: "b.png", zIndex: 0 },
      { url: "l1.png", zIndex: 1, boundingBox: { normalized: [10, 20, 100, 200] } },
      { url: "l2.png", zIndex: 2 }, // 缺
      { url: "l3.png", zIndex: 3, boundingBox: { normalized: [0, 0, 0, 0] } }, // 零面积，渲染会回退铺满，不能算健康
    ];
    const h = getBboxHealth(layers);
    expect(h.ok).toBe(2); // 底图 + l1
    expect(h.missing).toEqual([2, 3]);
    expect(h.total).toBe(4);
  });

  it("normalized 含 NaN/Infinity → missing", () => {
    const layers: GeneratedImage[] = [
      { url: "b.png", zIndex: 0 },
      {
        url: "l1.png",
        zIndex: 1,
        boundingBox: { normalized: [NaN, 10, 100, 200] as unknown as number[] },
      },
      {
        url: "l2.png",
        zIndex: 2,
        boundingBox: { normalized: [10, Infinity, 100, 200] as unknown as number[] },
      },
    ];
    const h = getBboxHealth(layers);
    expect(h.ok).toBe(1); // 底图 1 个
    expect(h.missing).toEqual([1, 2]);
    expect(h.total).toBe(3);
  });

  it("全部缺失（且底图也缺 bbox 的异常情况）→ ok=0, missing=全部非底图", () => {
    // 极端情况：所有图层都没 bbox，底图也没 — 这时候合成视图应该整体降级。
    const layers: GeneratedImage[] = [
      { url: "b.png", zIndex: 0 }, // 底图仍按"ok"算（防御性）
      { url: "l1.png", zIndex: 1 },
      { url: "l2.png", zIndex: 2 },
    ];
    const h = getBboxHealth(layers);
    // 设计选择: 底图"有 bbox 缺失"也当 ok,因为底图的位置语义固定。
    // 但 ok=0 的判定应该用 visibleLayers 派生"非底图层"再来一遍。
    expect(h.ok).toBe(1);
    expect(h.missing).toEqual([1, 2]);
    expect(h.total).toBe(3);
  });
});

describe("pickMainLayer — 资产卡缩略图主体图层派生", () => {
  it("空数组 → null", () => {
    expect(pickMainLayer([])).toBeNull();
  });

  it("单层资产(仅底图) → 返该底图层", () => {
    const base: GeneratedImage = { url: "b.png", zIndex: 0 };
    expect(pickMainLayer([base])).toBe(base);
  });

  it("全图层都有 bbox → 选 bbox 面积最大的非底图层", () => {
    const layers: GeneratedImage[] = [
      { url: "b.png", zIndex: 0 }, // 底图
      { url: "small.png", zIndex: 1, boundingBox: { normalized: [600, 400, 700, 500] } }, // 10% × 10% = 0.01
      { url: "big.png", zIndex: 2, boundingBox: { normalized: [100, 100, 800, 800] } }, // 70% × 70% = 0.49
      { url: "mid.png", zIndex: 3, boundingBox: { normalized: [200, 200, 600, 500] } }, // 40% × 30% = 0.12
    ];
    const out = pickMainLayer(layers);
    expect(out?.url).toBe("big.png");
  });

  it("并列面积 → 取 zIndex 较大的(更上层的视觉上更突出)", () => {
    const layers: GeneratedImage[] = [
      { url: "b.png", zIndex: 0 },
      { url: "low.png", zIndex: 1, boundingBox: { normalized: [100, 100, 500, 500] } }, // 0.16
      { url: "high.png", zIndex: 5, boundingBox: { normalized: [100, 100, 500, 500] } }, // 0.16 同面积但 zIndex 高
    ];
    expect(pickMainLayer(layers)?.url).toBe("high.png");
  });

  it("非底图层全部缺 bbox → 退化返底图层", () => {
    const base: GeneratedImage = { url: "b.png", zIndex: 0 };
    const layers: GeneratedImage[] = [
      base,
      { url: "l1.png", zIndex: 1 }, // 缺 bbox
      { url: "l2.png", zIndex: 2 }, // 缺 bbox
    ];
    expect(pickMainLayer(layers)).toBe(base);
  });

  it("底图层缺 bbox 但非底图层有 → 仍按面积选非底图层", () => {
    const layers: GeneratedImage[] = [
      { url: "b.png", zIndex: 0 }, // 底图缺 bbox 也算存在
      { url: "main.png", zIndex: 1, boundingBox: { normalized: [200, 200, 800, 800] } },
    ];
    expect(pickMainLayer(layers)?.url).toBe("main.png");
  });

  it("bbox 含 NaN / Infinity → 跳过该候选", () => {
    const layers: GeneratedImage[] = [
      { url: "b.png", zIndex: 0 },
      { url: "bad.png", zIndex: 1, boundingBox: { normalized: [NaN, 0, 500, 500] as unknown as number[] } },
      { url: "good.png", zIndex: 2, boundingBox: { normalized: [0, 0, 500, 500] } },
    ];
    expect(pickMainLayer(layers)?.url).toBe("good.png");
  });

  it("反向 bbox(r<=l 或 b<=t) → 跳过该候选", () => {
    const layers: GeneratedImage[] = [
      { url: "b.png", zIndex: 0 },
      { url: "reversed.png", zIndex: 1, boundingBox: { normalized: [800, 0, 200, 1000] } },
      { url: "ok.png", zIndex: 2, boundingBox: { normalized: [0, 0, 500, 500] } },
    ];
    expect(pickMainLayer(layers)?.url).toBe("ok.png");
  });
});
