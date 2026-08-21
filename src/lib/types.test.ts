import { describe, it, expect } from "vitest";
import { flatAssetImages, assetMainImage } from "@/lib/types";
import type { Asset } from "@/lib/types";

describe("flatAssetImages / assetMainImage — 图层本地路径合并", () => {
  const asset: Asset = {
    id: "a1",
    projectId: "p1",
    prompt: "test",
    model: "pro",
    modelName: "Pro",
    size: "2k",
    refCount: 0,
    costMs: 1,
    isLayerDecomposition: true,
    createdAt: 1,
    payload: {
      urls: [],
      layers: [
        { url: "https://example.com/base.png", zIndex: 0, name: "底图" },
        { url: "https://example.com/l1.png", zIndex: 1, name: "图层1" },
      ],
      layerLocalPaths: ["C:/cache/base.png", "C:/cache/l1.png"],
    },
  };

  it("flatAssetImages 把 layerLocalPaths 合并到对应 layer.localPath", () => {
    const images = flatAssetImages(asset);
    expect(images).toHaveLength(2);
    expect(images[0].localPath).toBe("C:/cache/base.png");
    expect(images[1].localPath).toBe("C:/cache/l1.png");
    expect(images[0].url).toBe("https://example.com/base.png");
  });

  it("flatAssetImages 在 layers 乱序时仍按 zIndex 排序并同步路径", () => {
    const shuffled: Asset = {
      ...asset,
      payload: {
        urls: [],
        layers: [
          { url: "https://example.com/l1.png", zIndex: 1, name: "图层1" },
          { url: "https://example.com/base.png", zIndex: 0, name: "底图" },
        ],
        layerLocalPaths: ["C:/cache/l1.png", "C:/cache/base.png"],
      },
    };
    const images = flatAssetImages(shuffled);
    expect(images.map((i) => i.zIndex)).toEqual([0, 1]);
    expect(images.map((i) => i.localPath)).toEqual([
      "C:/cache/base.png",
      "C:/cache/l1.png",
    ]);
  });

  it("assetMainImage 图层拆分优先用 layerLocalPaths 的底图路径", () => {
    expect(assetMainImage(asset)).toBe("C:/cache/base.png");
  });

  it("layer.localPath 存在时不再被 layerLocalPaths 覆盖", () => {
    const withInline = {
      ...asset,
      payload: {
        ...asset.payload,
        layers: [
          { url: "https://example.com/base.png", zIndex: 0, localPath: "C:/inline/base.png" },
          { url: "https://example.com/l1.png", zIndex: 1 },
        ],
        layerLocalPaths: ["C:/cache/base.png", "C:/cache/l1.png"],
      },
    };
    const images = flatAssetImages(withInline);
    expect(images[0].localPath).toBe("C:/inline/base.png");
  });
});
