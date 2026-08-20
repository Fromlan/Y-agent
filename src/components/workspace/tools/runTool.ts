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
import { modelCapabilities, type Asset, type AssetPayload, type Usage } from "@/lib/types";

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
  onProgress?.({ phase: "requesting", message: `调用 ${params.modelName}…` });
  const resp = await generateImage(buildGenParams(params));

  onProgress?.({ phase: "downloading", message: "下载到本地缓存…" });
  // 注意：Rust 端 jimeng_generate 已经 download_to_cache 了，这里只是 UI 反馈

  onProgress?.({ phase: "persisting", message: "写入资产库…" });
  const localPaths = resp.images
    .map((i) => i.localPath)
    .filter((p): p is string => !!p);
  const asset = await createAsset({
    projectId: params.projectId,
    prompt: params.prompt,
    model: params.modelId,
    modelName: params.modelName,
    size: params.size,
    refCount: params.image?.length ?? 0,
    costMs: 0,
    isLayerDecomposition: !!params.layerDecomposition,
    payload: buildPayload(params, resp.images.map((i) => i.url), resp.usage, localPaths),
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
  const totalCount = params.maxImages ?? 1;
  const partials: { url: string; index: number; localPath?: string }[] = [];

  onProgress?.({
    phase: "requesting",
    message: `调用 ${params.modelName}（流式）…`,
    totalCount,
  });

  return new Promise<Asset>((resolve, reject) => {
    generateImageStream(buildGenParams(params), {
      onPartial: ({ url, index, localPath }) => {
        partials.push({ url, index, localPath });
        onProgress?.({
          phase: "downloading",
          message: `已就绪 ${partials.length} / ${totalCount} 张`,
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
          const localPaths = partials
            .map((p) => p.localPath)
            .filter((p): p is string => !!p);
          const sorted = partials.sort((a, b) => a.index - b.index);
          const asset = await createAsset({
            projectId: params.projectId,
            prompt: params.prompt,
            model: params.modelId,
            modelName: params.modelName,
            size: params.size,
            refCount: params.image?.length ?? 0,
            costMs: 0,
            isLayerDecomposition: !!params.layerDecomposition,
            payload: buildPayload(
              params,
              sorted.map((p) => p.url),
              info.usage as Usage | undefined,
              localPaths
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

function buildGenParams(p: RunToolParams): GenerateImageParams {
  return {
    model: p.modelId,
    prompt: p.prompt,
    image: p.image,
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

function buildPayload(
  p: RunToolParams,
  urls: string[],
  usage: Usage | undefined,
  localPaths: string[]
): AssetPayload {
  return {
    urls,
    usage,
    ...(p.isTransparent ? { transparent: true } : {}),
    ...(p.outputFormat ? { outputFormat: p.outputFormat } : {}),
    ...(localPaths.length > 0 ? { localPaths } : {}),
    ...(p.sourceAssetId ? { parentAssetId: p.sourceAssetId } : {}),
    ...(p.bbox ? { bbox: p.bbox } : {}),
  };
}
