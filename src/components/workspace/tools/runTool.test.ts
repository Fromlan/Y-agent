import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// P0 回归:runTool 测量 costMs(不再写死 0) + 图层拆分保存完整 layers
// ============================================================================
// 之前 runTool.costMs.test.ts 是一个独立文件,位置紧贴 runTool 让人误以为它是
// production code 的子模块。合并到 runTool.test.ts 后,所有 runTool 行为回归
// 集中维护,跑 1 次 `pnpm test` 就能看到全部相关测试。
//
// 这里通过 vi.mock 替换 `@/lib/jimeng` 和 `@/lib/assets`,让 runTool 走完全本地
// 流程,最后断言 createAsset 收到的 costMs > 0 / 图层拆分带 layers。
// ============================================================================

// 收集 createAsset 调用参数
const createAssetCalls: Array<{ costMs: number; [k: string]: unknown }> = [];
const generatedImages: Array<Record<string, unknown>> = [];

// 模拟 generateImage:普通模式单图返回 url + localPath;图层拆分模式返回带
// zIndex/name/size/boundingBox 的完整 layers。
vi.mock("@/lib/jimeng", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jimeng")>("@/lib/jimeng");
  return {
    ...actual,
    generateImage: vi.fn(async (params?: { layerDecomposition?: boolean }) => {
      // 模拟 Rust 端 download_to_cache
      await new Promise((r) => setTimeout(r, 30));
      if (params?.layerDecomposition) {
        const layerImages = [
          {
            url: "https://example.com/base.png",
            zIndex: 0,
            size: "832x1248",
            localPath: "C:/cache/base.png",
            output_format: "png",
          },
          {
            url: "https://example.com/layer1.png",
            zIndex: 1,
            name: "主体",
            size: "485x1062",
            localPath: "C:/cache/layer1.png",
            output_format: "png",
            boundingBox: {
              absolute: [191, 148, 676, 1210],
              normalized: [230, 119, 811, 969],
            },
          },
        ];
        generatedImages.push(...layerImages);
        return {
          images: layerImages,
          isDemo: false,
          usage: { generatedImages: 2 },
          output_format: "png",
        };
      }
      generatedImages.push({ url: "https://example.com/result.png", localPath: "C:/cache/result.png", output_format: "png" });
      return {
        images: [...generatedImages],
        isDemo: false,
        usage: { generatedImages: 1 },
        output_format: "png",
      };
    }),
    generateImageStream: vi.fn(
      async (
        _params: unknown,
        handlers: {
          onCompleted: (info: { usage?: unknown }) => void;
          onPartial?: (e: { url: string; index: number; localPath?: string }) => void;
        }
      ) => {
        await new Promise((r) => setTimeout(r, 20));
        handlers.onPartial?.({ url: "https://example.com/partial.png", index: 0, localPath: "C:/cache/partial.png" });
        await new Promise((r) => setTimeout(r, 20));
        handlers.onCompleted({ usage: { generatedImages: 1 } });
        return "rid-test";
      }
    ),
  };
});

vi.mock("@/lib/assets", () => ({
  createAsset: vi.fn(async (params: { costMs: number; [k: string]: unknown }) => {
    createAssetCalls.push({ ...params });
    return {
      id: "asset-test",
      projectId: params.projectId as string,
      prompt: params.prompt as string,
      model: params.model as string,
      modelName: params.modelName as string,
      size: params.size as string,
      refCount: 0,
      costMs: params.costMs,
      isLayerDecomposition: false,
      payload: params.payload,
      createdAt: Date.now(),
    };
  }),
}));

vi.mock("@/lib/image-alpha-patch", () => ({
  ensureHasTransparentPixel: vi.fn(async (s: string) => s),
}));

import { runTool, resolveActualFormat } from "@/components/workspace/tools/runTool";
import { resolveFormat } from "@/lib/asset-payload";

beforeEach(() => {
  createAssetCalls.length = 0;
  generatedImages.length = 0;
});

/**
 * runTool.ts 内的 resolveActualFormat 现在是 asset-payload.resolveFormat 的
 * thin wrapper（不传 modelId，所以不做模型兜底）。本文件保留为该 wrapper 的
 * 回归测试，并补充 resolveFormat 在 ToolsTab 典型场景下的行为。
 */
describe("resolveActualFormat — thin wrapper over resolveFormat", () => {
  it("响应里有 png 时返回 png（忽略请求值）", () => {
    expect(resolveActualFormat("png", undefined)).toBe("png");
    expect(resolveActualFormat("png", "jpeg")).toBe("png");
  });

  it("响应里有 jpeg 时返回 jpeg（修复 4.5/4.0 路径不读响应的 bug）", () => {
    // 4.5/4.0 不支持自定义，请求里没带，但响应会返 jpeg
    expect(resolveActualFormat("jpeg", undefined)).toBe("jpeg");
  });

  it("响应缺失时回退到请求值", () => {
    expect(resolveActualFormat(undefined, "png")).toBe("png");
    expect(resolveActualFormat(undefined, "jpeg")).toBe("jpeg");
  });

  it("响应和请求都没值时返回 undefined（不写库）", () => {
    expect(resolveActualFormat(undefined, undefined)).toBeUndefined();
  });

  it("未知字符串一律当 undefined（防 webp 等格式污染数据）", () => {
    expect(resolveActualFormat("webp", undefined)).toBeUndefined();
    expect(resolveActualFormat("PNG", undefined)).toBeUndefined(); // 大小写敏感
  });

  it("空串走严格 ===，跳过 resp 用 req 兜底（与旧 ?? 行为不同，更可预测）", () => {
    // 旧实现: "" ?? "png" = ""，最终 undefined
    // 新实现: "" !== "png"/"jpeg"，跳过 resp；"png" === "png"，返回 "png"
    // 行为差异：wrapper 现在更激进地用请求值兜底，避免外部传空串时漏写
    expect(resolveActualFormat("", "png")).toBe("png");
  });
});

describe("resolveFormat 在 ToolsTab 典型场景下", () => {
  it("5.0 Pro 同步：响应有 png → 用响应", () => {
    expect(
      resolveFormat({
        respFormat: "png",
        reqFormat: undefined,
        modelId: "doubao-seedream-5-0-pro-260628",
      })
    ).toBe("png");
  });

  it("5.0 Lite 流式 completed：响应缺失 + 请求缺失 → 模型兜底 png", () => {
    expect(
      resolveFormat({
        respFormat: undefined,
        reqFormat: undefined,
        modelId: "doubao-seedream-5-0-lite-260628",
      })
    ).toBe("png");
  });

  it("4.5 流式：响应缺失 + 请求缺失 → 保持 undefined（不兜底）", () => {
    expect(
      resolveFormat({
        respFormat: undefined,
        reqFormat: undefined,
        modelId: "jimeng-4.5",
      })
    ).toBeUndefined();
  });
});

// ============================================================================
// P0 回归：runTool 测量 costMs（不再写死 0） + 图层拆分保存完整 layers
// ============================================================================
// 合并自原 runTool.costMs.test.ts——该文件已删除。文件位置紧贴 production
// code 会让 reviewer 误以为它是子模块，集中到 runTool.test.ts 后所有 runTool
// 行为回归 1 次 `pnpm test` 就能看到全貌。

describe("runTool 测量 costMs（不再写死 0）", () => {
  it("runToolSync（5.0 Pro 等无 stream 的模型）：costMs > 0", async () => {
    await runTool({
      projectId: "p1",
      prompt: "测试 prompt",
      modelId: "doubao-seedream-5-0-pro-260628",
      modelName: "Seedream 5.0 Pro",
      size: "2k",
    });
    expect(createAssetCalls).toHaveLength(1);
    expect(createAssetCalls[0].costMs).toBeGreaterThan(0);
  });

  it("runToolStream（5.0 Lite 流式）：costMs > 0", async () => {
    await runTool({
      projectId: "p1",
      prompt: "测试 prompt",
      modelId: "doubao-seedream-5-0-lite-260128",
      modelName: "Seedream 5.0 Lite",
      size: "2k",
      maxImages: 1,
    });
    expect(createAssetCalls).toHaveLength(1);
    expect(createAssetCalls[0].costMs).toBeGreaterThan(0);
  });

  it("costMs 至少反映同步等待时间（>= 20ms）", async () => {
    const t0 = Date.now();
    await runTool({
      projectId: "p1",
      prompt: "测试 prompt",
      modelId: "doubao-seedream-5-0-pro-260628",
      modelName: "Seedream 5.0 Pro",
      size: "2k",
    });
    const elapsed = Date.now() - t0;
    expect(createAssetCalls[0].costMs).toBeGreaterThanOrEqual(20);
    expect(createAssetCalls[0].costMs).toBeLessThanOrEqual(elapsed + 5);
  });
});

describe("runToolSync 图层拆分必须保存完整 layers（不能只存 urls）", () => {
  it("layerDecomposition=true 时 payload 带 layers/boundingBox，而不是 urls 平铺", async () => {
    await runTool({
      projectId: "p1",
      prompt: "将图像拆分为底图与可编辑图层",
      modelId: "doubao-seedream-5-0-pro-260628",
      modelName: "Seedream 5.0 Pro",
      size: "2k",
      layerDecomposition: true,
    });
    expect(createAssetCalls).toHaveLength(1);
    const call = createAssetCalls[0];
    expect(call.isLayerDecomposition).toBe(true);
    const payload = call.payload as {
      urls: string[];
      layers: Array<{ zIndex?: number; boundingBox?: { normalized?: number[] } }>;
      layerLocalPaths?: string[];
    };
    // 关键回归点：之前这里只存 urls，导致详情页拿不到 zIndex/bbox，
    // 合成视图把所有图层当底图铺满。
    expect(payload.urls).toEqual([]);
    expect(payload.layers).toHaveLength(2);
    expect(payload.layers?.[0]?.zIndex).toBe(0);
    expect(payload.layers?.[1]?.zIndex).toBe(1);
    expect(payload.layers?.[1]?.boundingBox?.normalized).toEqual([230, 119, 811, 969]);
    expect(payload.layerLocalPaths).toHaveLength(2);
  });

  it("layerDecomposition=false 时仍走普通 urls/localPaths", async () => {
    await runTool({
      projectId: "p1",
      prompt: "测试 prompt",
      modelId: "doubao-seedream-5-0-pro-260628",
      modelName: "Seedream 5.0 Pro",
      size: "2k",
    });
    const payload = createAssetCalls[0].payload as {
      urls: string[];
      layers?: unknown[];
      localPaths?: string[];
    };
    expect(payload.urls.length).toBeGreaterThan(0);
    expect(payload.layers).toBeUndefined();
    expect(payload.localPaths).toHaveLength(1);
  });
});
