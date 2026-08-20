import { describe, it, expect } from "vitest";
import { pickVisibleLayers, parseBaseSize, layerRectPercent, layerRectNormalized } from "@/lib/layer-view";
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
});
