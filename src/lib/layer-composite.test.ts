import { describe, it, expect } from "vitest";
import {
  containRect,
  coverRect,
  layerCompositeCacheKey,
  layerImagesForComposite,
} from "@/lib/layer-composite";
import type { Asset } from "@/lib/types";

describe("containRect", () => {
  it("宽图在容器内居中并按比例缩放", () => {
    expect(containRect(200, 100, 200, 100)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
    expect(containRect(200, 100, 100, 200)).toEqual({
      x: 75,
      y: 0,
      width: 50,
      height: 100,
    });
  });

  it("空/非法尺寸不会产生 NaN", () => {
    expect(containRect(0, 100, 200, 100)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(containRect(100, 100, 0, 100)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("coverRect", () => {
  it("宽图在容器内铺满并裁掉多余部分", () => {
    expect(coverRect(200, 100, 100, 100)).toEqual({
      x: 0,
      y: -50,
      width: 200,
      height: 200,
    });
    expect(coverRect(200, 100, 200, 100)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
  });

  it("空/非法尺寸不会产生 NaN", () => {
    expect(coverRect(0, 100, 200, 100)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(coverRect(100, 100, 0, 100)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("layerCompositeCacheKey", () => {
  const base: Asset = {
    id: "a1",
    projectId: "p1",
    prompt: "",
    model: "",
    modelName: "",
    size: "2k",
    refCount: 0,
    costMs: 0,
    isLayerDecomposition: true,
    createdAt: 0,
    payload: {
      urls: [],
      layers: [
        { url: "base.png", zIndex: 0 },
        { url: "l1.png", zIndex: 1, boundingBox: { normalized: [10, 20, 300, 400] } },
      ],
    },
  };

  it("同一资产同一输出宽度生成相同 key", () => {
    const a: Asset = { ...base, payload: { ...base.payload, layers: [...base.payload.layers!] } };
    expect(layerCompositeCacheKey(a, 320)).toBe(layerCompositeCacheKey(base, 320));
  });

  it("图层源或 bbox 变化时 key 变化", () => {
    const changed = {
      ...base,
      payload: {
        ...base.payload,
        layers: [
          { url: "base.png", zIndex: 0 },
          { url: "l1.png", zIndex: 1, boundingBox: { normalized: [10, 20, 300, 500] } },
        ],
      },
    };
    expect(layerCompositeCacheKey(changed, 320)).not.toBe(layerCompositeCacheKey(base, 320));
  });

  it("不同输出宽度 key 不同", () => {
    expect(layerCompositeCacheKey(base, 320)).not.toBe(layerCompositeCacheKey(base, 640));
  });
});

describe("layerImagesForComposite — 历史 ToolsTab 数据兼容", () => {
  const legacyAsset: Asset = {
    id: "legacy1",
    projectId: "p1",
    prompt: "",
    model: "",
    modelName: "",
    size: "1k",
    refCount: 0,
    costMs: 0,
    isLayerDecomposition: true,
    createdAt: 0,
    payload: {
      urls: ["base.png", "layer1.png", "layer2.png"],
      localPaths: ["C:/cache/base.png", "C:/cache/l1.png", "C:/cache/l2.png"],
    },
  };

  it("payload.layers 缺失时按 urls 顺序补 zIndex/localPath", () => {
    const layers = layerImagesForComposite(legacyAsset);
    expect(layers).toHaveLength(3);
    expect(layers[0]).toMatchObject({ url: "base.png", zIndex: 0, localPath: "C:/cache/base.png", name: "底图" });
    expect(layers[1]).toMatchObject({ url: "layer1.png", zIndex: 1, localPath: "C:/cache/l1.png" });
    expect(layers[2]).toMatchObject({ url: "layer2.png", zIndex: 2, localPath: "C:/cache/l2.png" });
  });

  it("已有 payload.layers 时保持 flatAssetImages 行为", () => {
    const newAsset: Asset = {
      ...legacyAsset,
      payload: {
        urls: [],
        layers: [
          { url: "base.png", zIndex: 0, localPath: "C:/cache/base.png" },
          { url: "l1.png", zIndex: 1, boundingBox: { normalized: [0, 0, 500, 500] } },
        ],
      },
    };
    const layers = layerImagesForComposite(newAsset);
    expect(layers).toHaveLength(2);
    expect(layers[0].url).toBe("base.png");
    expect(layers[1].zIndex).toBe(1);
  });
});
