import { describe, it, expect } from "vitest";
import { resolveFormat, buildAssetPayload } from "@/lib/asset-payload";
import type { Usage, GeneratedImage } from "@/lib/types";

describe("resolveFormat — 响应 > 请求 > 模型兜底", () => {
  it("响应有 png 时返回 png（忽略请求值）", () => {
    expect(resolveFormat({ respFormat: "png", reqFormat: "jpeg", modelId: "" })).toBe("png");
    expect(resolveFormat({ respFormat: "png", reqFormat: undefined, modelId: "" })).toBe("png");
  });

  it("响应有 jpeg 时返回 jpeg（修复 4.5/4.0 路径不读响应的 bug）", () => {
    expect(resolveFormat({ respFormat: "jpeg", reqFormat: undefined, modelId: "" })).toBe("jpeg");
  });

  it("响应缺失时回退到请求值", () => {
    expect(resolveFormat({ respFormat: undefined, reqFormat: "png", modelId: "" })).toBe("png");
    expect(resolveFormat({ respFormat: undefined, reqFormat: "jpeg", modelId: "" })).toBe("jpeg");
  });

  it("响应和请求都缺 + 5.0 Lite → png（模型兜底）", () => {
    expect(
      resolveFormat({
        respFormat: undefined,
        reqFormat: undefined,
        modelId: "doubao-seedream-5-0-lite-260628",
      })
    ).toBe("png");
  });

  it("响应和请求都缺 + 5.0 Pro → png（模型兜底）", () => {
    expect(
      resolveFormat({
        respFormat: undefined,
        reqFormat: undefined,
        modelId: "doubao-seedream-5-0-pro-260628",
      })
    ).toBe("png");
  });

  it("响应和请求都缺 + 4.5 → undefined（4.5/4.0 不兜底）", () => {
    expect(
      resolveFormat({
        respFormat: undefined,
        reqFormat: undefined,
        modelId: "jimeng-4.5",
      })
    ).toBeUndefined();
  });

  it("响应是 'PNG'（大写）→ undefined（严格小写，避免入库污染）", () => {
    expect(
      resolveFormat({ respFormat: "PNG", reqFormat: "png", modelId: "" })
    ).toBe("png"); // 请求兜底，resp 失败
  });

  it("响应是 'webp' → 跳过，用请求/模型", () => {
    expect(
      resolveFormat({ respFormat: "webp", reqFormat: "png", modelId: "" })
    ).toBe("png");
    expect(
      resolveFormat({ respFormat: "webp", reqFormat: undefined, modelId: "jimeng-4.5" })
    ).toBeUndefined();
  });

  it("响应是空串 → 跳过 resp、用 req 兜底（严格 === 不匹配空串）", () => {
    expect(
      resolveFormat({ respFormat: "", reqFormat: "png", modelId: "" })
    ).toBe("png");
  });
});

describe("buildAssetPayload — 统一 payload 构造", () => {
  it("最小输入（只有 urls）→ 只输出 urls", () => {
    const p = buildAssetPayload({ urls: ["a"], isTransparent: false }, undefined);
    expect(p).toEqual({ urls: ["a"] });
  });

  it("完整输入 → 全部字段都写入", () => {
    const usage: Usage = { generatedImages: 1 };
    const p = buildAssetPayload(
      {
        urls: ["a", "b"],
        usage,
        isTransparent: true,
        parentAssetId: "parent-1",
        bbox: { x1: 0, y1: 0, x2: 100, y2: 100 },
        localPaths: ["/tmp/a.png", "/tmp/b.png"],
      },
      "png"
    );
    expect(p).toEqual({
      urls: ["a", "b"],
      usage,
      parentAssetId: "parent-1",
      bbox: { x1: 0, y1: 0, x2: 100, y2: 100 },
      transparent: true,
      outputFormat: "png",
      localPaths: ["/tmp/a.png", "/tmp/b.png"],
    });
  });

  it("format 为 undefined → payload 不含 outputFormat 字段", () => {
    const p = buildAssetPayload({ urls: ["a"], isTransparent: false }, undefined);
    expect("outputFormat" in p).toBe(false);
  });

  it("format 为 'png' → payload.outputFormat = 'png'", () => {
    const p = buildAssetPayload({ urls: ["a"], isTransparent: false }, "png");
    expect(p.outputFormat).toBe("png");
  });

  it("format 为 'jpeg' → payload.outputFormat = 'jpeg'", () => {
    const p = buildAssetPayload({ urls: ["a"], isTransparent: false }, "jpeg");
    expect(p.outputFormat).toBe("jpeg");
  });

  it("isTransparent=false → 不写 transparent 字段", () => {
    const p = buildAssetPayload({ urls: ["a"], isTransparent: false }, "png");
    expect("transparent" in p).toBe(false);
  });

  it("isTransparent=true → 写 transparent=true", () => {
    const p = buildAssetPayload({ urls: ["a"], isTransparent: true }, "png");
    expect(p.transparent).toBe(true);
  });

  it("空数组不写入（localPaths=[]、bbox undefined 不写）", () => {
    const p = buildAssetPayload(
      { urls: ["a"], isTransparent: false, localPaths: [] },
      "png"
    );
    expect("localPaths" in p).toBe(false);
  });

  it("图层拆分场景 → layers / layerLocalPaths 正确写入", () => {
    const p = buildAssetPayload(
      {
        urls: ["base"],
        layers: [
          { url: "l1.png", zIndex: 1 },
          { url: "base.png", zIndex: 0 },
        ],
        layerLocalPaths: ["/tmp/l1.png", "/tmp/base.png"],
        isTransparent: true,
      },
      "png"
    );
    expect(p.layers).toHaveLength(2);
    expect(p.layerLocalPaths).toEqual(["/tmp/l1.png", "/tmp/base.png"]);
    expect(p.transparent).toBe(true);
  });
});

/**
 * 文档级保证：图层信息入库后无损。
 *
 * 模拟 Tauri create_asset -> SQLite JSON 字符串 -> list_assets -> JSON.parse
 * 的整条链路（前端侧的部分），断言所有图层字段（含 boundingBox.normalized）
 * 都能被读回来——这是"信息存了可以完整还原原图"这一需求的 CI 证据。
 */
describe("图层拆分 payload 字段 round-trip（保证信息无损入库）", () => {
  it("完整 layers（zIndex/name/description/size/outputFormat/boundingBox.{absolute,normalized}）入库后字段不丢", () => {
    const layers: GeneratedImage[] = [
      {
        url: "b.png",
        zIndex: 0,
        name: "底图",
        size: "2048x2048",
        outputFormat: "png",
      },
      {
        url: "l1.png",
        zIndex: 1,
        name: "标题",
        size: "1273x265",
        outputFormat: "png",
        description: "黄色大号衬线字体",
        boundingBox: {
          absolute: [383, 120, 1655, 384],
          normalized: [187, 59, 808, 188],
        },
      },
    ];
    const p = buildAssetPayload(
      {
        urls: [],
        layers,
        isTransparent: true,
        layerLocalPaths: ["/tmp/b.png", "/tmp/l1.png"],
      },
      "png"
    );
    // 模拟 Tauri 链路：JSON 序列化（create_asset） -> JSON 反序列化（list_assets）
    const round = JSON.parse(JSON.stringify(p));
    expect(round.layers).toEqual(layers); // 完整字段
    expect(round.layers[1].boundingBox.normalized).toEqual([187, 59, 808, 188]);
    expect(round.layers[1].size).toBe("1273x265");
    expect(round.layers[1].description).toBe("黄色大号衬线字体");
    expect(round.layers[1].boundingBox.absolute).toEqual([383, 120, 1655, 384]);
    expect(round.transparent).toBe(true);
    expect(round.layerLocalPaths).toEqual(["/tmp/b.png", "/tmp/l1.png"]);
  });

  it("normalized 缺失时仍可 round-trip（老数据兜底）", () => {
    const layers: GeneratedImage[] = [
      {
        url: "b.png",
        zIndex: 0,
        size: "2048x2048",
        boundingBox: { absolute: [0, 0, 2048, 2048] }, // 没有 normalized
      },
    ];
    const p = buildAssetPayload(
      { urls: [], layers, isTransparent: false },
      "png"
    );
    const round = JSON.parse(JSON.stringify(p));
    expect(round.layers[0].boundingBox.absolute).toEqual([0, 0, 2048, 2048]);
    expect(round.layers[0].boundingBox.normalized).toBeUndefined();
    expect(round.layers[0].zIndex).toBe(0);
  });
});
