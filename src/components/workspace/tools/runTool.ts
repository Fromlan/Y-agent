/**
 * 工具 Tab 的共享执行 helper（带进度回调）。
 *
 * 行为：
 * - 模型支持 stream（5.0 Lite / 4.5 / 4.0）→ 走 jimeng_generate_stream
 *   - partial 回调 → onProgress('downloading', '已就绪 N/M 张', partialCount, totalCount)
 *   - onCompleted → 入库
 * - 模型不支持 stream（5.0 Pro）→ 走 jimeng_generate 同步
 *   - 阶段提示：requesting → downloading → persisting → done
 *
 * 任何阶段报错都走 onProgress('error', ...) 并 reject，UI 负责 catch + toast。
 */
import {
  generateImage,
  generateImageStream,
  type GenerateImageParams,
} from "@/lib/jimeng";
import { createAsset } from "@/lib/assets";
import { buildAssetPayload, resolveFormat } from "@/lib/asset-payload";
import { modelCapabilities, type Asset, type Usage } from "@/lib/types";
import { ensureHasTransparentPixel } from "@/lib/image-alpha-patch";

export interface RunToolParams {
  projectId: string;
  prompt: string;
  modelId: string;
  modelName: string;
  size: string;
  /** 参考图（dataURL / URL / localPath 都可） */
  image?: string[];
  /** 组图：sequential + maxImages */
  sequential?: "auto";
  maxImages?: number;
  /** 5.0 Pro 图层拆分 */
  layerDecomposition?: boolean;
  /** 5.0 Pro / 5.0 Lite 输出格式 */
  outputFormat?: "png" | "jpeg";
  /** 5.0 Lite 联网 */
  tools?: Array<"web_search">;
  /** 5.0 Pro / 4.0 极速 */
  optimizePromptMode?: "standard" | "fast";
  /** 5.0 Pro 背景透明 */
  background?: "transparent" | "opaque";

  // === 业务溯源（写进 payload） ===
  sourceAssetId?: string;
  bbox?: { x1: number; y1: number; x2: number; y2: number };
  isTransparent?: boolean;
}

export type ToolPhase = "requesting" | "downloading" | "persisting" | "done" | "error";

export interface ToolProgress {
  phase: ToolPhase;
  message: string;
  /** 已就绪图数（流式 partial 阶段） */
  partialCount?: number;
  /** 期望总图数（组图 maxImages） */
  totalCount?: number;
}

export async function runTool(
  params: RunToolParams,
  onProgress?: (p: ToolProgress) => void
): Promise<Asset> {
  const caps = modelCapabilities(params.modelId);
  if (caps.stream) {
    return await runToolStream(params, onProgress);
  }
  return await runToolSync(params, onProgress);
}

// ============================================================================
// 同步路径（5.0 Pro 等不支持 stream 的模型）
// ============================================================================

async function runToolSync(
  params: RunToolParams,
  onProgress?: (p: ToolProgress) => void
): Promise<Asset> {
  const t0 = Date.now();
  onProgress?.({ phase: "requesting", message: `调用 ${params.modelName}…` });
  const resp = await generateImage(await buildGenParams(params));

  onProgress?.({ phase: "persisting", message: "写入资产库…" });
  // 用空串占位缺失项，保持数组与 urls/layers 一一对应；空串在入库/兜底时视为缺失。
  const localPaths = resp.images.map((i) => i.localPath ?? "");
  const actualFormat = resolveFormat({
    respFormat: resp.output_format,
    reqFormat: params.outputFormat,
    modelId: params.modelId,
  });
  const costMs = Date.now() - t0;
  // 图层拆分（5.0 Pro）必须把完整 layers 存进 payload：
  // 每个 layer 都带 zIndex / name / size / boundingBox，合成视图才能按 bbox 定位。
  // 之前这里只存 urls，导致详情页 flatAssetImages 拿不到 zIndex/bbox，
  // 所有图层被当作"底图"铺满画布 → 视觉上"全部放大、叠在中心"。
  const isLayer = !!params.layerDecomposition;
  const payload = isLayer
    ? buildAssetPayload(
        {
          urls: [],
          layers: resp.images,
          usage: resp.usage,
          isTransparent: !!params.isTransparent,
          layerLocalPaths: localPaths,
          parentAssetId: params.sourceAssetId,
          bbox: params.bbox,
        },
        actualFormat
      )
    : buildAssetPayload(
        {
          urls: resp.images.map((i) => i.url),
          usage: resp.usage,
          isTransparent: !!params.isTransparent,
          localPaths,
          parentAssetId: params.sourceAssetId,
          bbox: params.bbox,
        },
        actualFormat
      );
  const asset = await createAsset({
    projectId: params.projectId,
    prompt: params.prompt,
    model: params.modelId,
    modelName: params.modelName,
    size: params.size,
    refCount: params.image?.length ?? 0,
    costMs,
    isLayerDecomposition: isLayer,
    payload,
  });

  onProgress?.({
    phase: "done",
    message: `已生成 ${resp.images.length} 张`,
    partialCount: resp.images.length,
    totalCount: resp.images.length,
  });
  return asset;
}

// ============================================================================
// 流式路径（5.0 Lite / 4.5 / 4.0）
// ============================================================================

async function runToolStream(
  params: RunToolParams,
  onProgress?: (p: ToolProgress) => void
): Promise<Asset> {
  const t0 = Date.now();
  const totalCount = params.maxImages ?? 1;
  const partials: { url: string; index: number; localPath?: string }[] = [];

  onProgress?.({
    phase: "requesting",
    message: `调用 ${params.modelName}（流式）…`,
    totalCount,
  });

  const genParams = await buildGenParams(params);

  return new Promise<Asset>((resolve, reject) => {
    generateImageStream(genParams, {
      onPartial: ({ url, index, localPath }) => {
        partials.push({ url, index, localPath });
        onProgress?.({
          phase: "downloading",
          message: `已生成 ${partials.length} / ${totalCount} 张`,
          partialCount: partials.length,
          totalCount,
        });
      },
      onPartialFailed: (info) => {
        onProgress?.({
          phase: "downloading",
          message: `第 ${(info.index ?? -1) + 1} 张失败：${info.message ?? info.code ?? "未知"}`,
        });
      },
      onCompleted: async (info) => {
        try {
          onProgress?.({ phase: "persisting", message: "写入资产库…" });
          const sorted = partials.sort((a, b) => a.index - b.index);
          // localPaths 必须与 sorted urls 同序，不能按 partial 到达顺序算。
          const localPaths = sorted.map((p) => p.localPath ?? "");
          const actualFormat = resolveFormat({
            respFormat: (info as { output_format?: string }).output_format,
            reqFormat: params.outputFormat,
            modelId: params.modelId,
          });
          const costMs = Date.now() - t0;
          const asset = await createAsset({
            projectId: params.projectId,
            prompt: params.prompt,
            model: params.modelId,
            modelName: params.modelName,
            size: params.size,
            refCount: params.image?.length ?? 0,
            costMs,
            isLayerDecomposition: !!params.layerDecomposition,
            payload: buildAssetPayload(
              {
                urls: sorted.map((p) => p.url),
                usage: info.usage as Usage | undefined,
                isTransparent: !!params.isTransparent,
                localPaths,
                parentAssetId: params.sourceAssetId,
                bbox: params.bbox,
              },
              actualFormat
            ),
          });
          onProgress?.({
            phase: "done",
            message: `已生成 ${partials.length} / ${totalCount} 张`,
            partialCount: partials.length,
            totalCount,
          });
          resolve(asset);
        } catch (e) {
          reject(e);
        }
      },
      onAborted: ({ reason }) => {
        onProgress?.({ phase: "error", message: `流中断：${reason}` });
        reject(new Error(reason));
      },
    }).catch((e) => reject(e));
  });
}

// ============================================================================
// 辅助
// ============================================================================

/**
 * 把 RunToolParams 装成 API 用的 GenerateImageParams。
 *
 * 5.0 Pro 的 `background: transparent` 要求入参 PNG 必须有至少 1 个透明像素，
 * Y-agent 走 `@/lib/image-alpha-patch.ensureHasTransparentPixel` 自动给入参图
 * 左上角 1 像素补透明再发。原图字节不动，详见该模块注释。
 */
async function buildGenParams(p: RunToolParams): Promise<GenerateImageParams> {
  let image = p.image;
  if (p.background === "transparent" && image && image.length > 0) {
    image = await Promise.all(image.map((u) => ensureHasTransparentPixel(u)));
  }
  return {
    model: p.modelId,
    prompt: p.prompt,
    image,
    size: p.size,
    sequential: p.sequential,
    maxImages: p.maxImages,
    outputFormat: p.outputFormat,
    tools: p.tools,
    optimizePromptMode: p.optimizePromptMode,
    background: p.background,
    layerDecomposition: p.layerDecomposition,
  };
}

/**
 * P4 兼容：取实际输出格式，优先 API 响应的 output_format，回退到请求值。
 *
 * 已经被 `@/lib/asset-payload` 的 `resolveFormat` 取代；本函数保留为 thin wrapper
 * 以兼容 `runTool.test.ts` 中已有的回归测试。生产代码请用 `resolveFormat`，
 * 它支持模型兜底（5.0 系列 = png）且作为唯一的权威实现。
 */
export function resolveActualFormat(
  respFormat: string | undefined,
  reqFormat: "png" | "jpeg" | undefined
): "png" | "jpeg" | undefined {
  return resolveFormat({ respFormat, reqFormat, modelId: "" });
}
