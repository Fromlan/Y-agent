import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Bug 1 回归测试
// ============================================================================
// 之前 `runToolSync` 和 `runToolStream` 都把 costMs 写死为 0，导致 ToolsTab
// 生成的资产 hover 浮层显示 "0ms"。修复后两条路径都要正确测量。
//
// 这里通过 vi.mock 替换 `@/lib/assets` 和 `@tauri-apps/api/core`，
// 让 runTool 走完全本地流程，最后断言 createAsset 收到的 costMs > 0。
// ============================================================================

// 用来收集 createAsset 调用参数
const createAssetCalls: Array<{ costMs: number; [k: string]: unknown }> = [];
const generatedImages: Array<Record<string, unknown>> = [];

// 模拟 generateImage：普通模式单图返回 url + localPath；
// 图层拆分模式返回带 zIndex/name/size/boundingBox 的完整 layers。
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

import { runTool } from "@/components/workspace/tools/runTool";

beforeEach(() => {
  createAssetCalls.length = 0;
  generatedImages.length = 0;
});

describe("Bug 1 回归 — runTool 测量 costMs（不再写死 0）", () => {
  it("runToolSync（5.0 Pro 等无 stream 的模型）:costMs > 0", async () => {
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

  it("runToolStream（5.0 Lite 流式）:costMs > 0", async () => {
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

  it("costMs 至少反映同步等待时间(>= 25ms)", async () => {
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
    // 防御：测得值不应超过实际等待时间太多
    expect(createAssetCalls[0].costMs).toBeLessThanOrEqual(elapsed + 5);
  });
});

describe("Bug 2 回归 — runToolSync 图层拆分必须保存完整 layers（不能只存 urls）", () => {
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

