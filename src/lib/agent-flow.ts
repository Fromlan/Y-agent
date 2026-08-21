/**
 * 生成流程的公共操作。
 * 三个入口（生图 / LLM 对话 / 规则降级）都共享这些步骤：
 *   1. 调 jimeng API
 *   2. 资产入库
 *   3. 自动学习 Agent Memory
 *
 * 抽到这里的目的是消除三处复制粘贴。
 */
import { generateImage, generateImageStream } from "@/lib/jimeng";
import { createAsset } from "@/lib/assets";
import { buildAssetPayload, resolveFormat } from "@/lib/asset-payload";
import { addStyleHints, recordModel, saveAgentContext, type AgentContext } from "@/lib/agent-memory";
import { assetIds as dbAssetIds, persistUpdate } from "@/lib/chat-history";
import type { Asset, ModelOption } from "@/lib/types";

/** 一次生成任务的可计算参数 */
export interface PlanArgs {
  prompt: string;
  modelId: string;
  modelName: string;
  size: string;
  /** 参考图（dataURL） */
  images?: string[];
  /** >1 时触发组图 */
  maxImages?: number;
  /** P0：可选能力位（透传到 jimeng API） */
  outputFormat?: "png" | "jpeg";
  tools?: Array<"web_search">;
  optimizePromptMode?: "standard" | "fast";
  background?: "transparent" | "opaque";
  layerDecomposition?: boolean;
}

export interface PlanResult {
  asset: Asset;
  costMs: number;
  isDemo: boolean;
}

export interface PlanStreamCallbacks {
  /** 单张图 partial 成功 + 已入库后触发（用户能立刻看到图） */
  onPartialAsset?: (asset: Asset, index: number) => void;
  /** 单图生成失败（组图场景下 1 张失败） */
  onPartialFailed?: (info: { index?: number; code?: string; message?: string }) => void;
}

/** 流式版本的 executePlan。逐张 partial 入库；completed 时合并为一张"主资产"返回。 */
export async function executePlanStream(
  plan: PlanArgs,
  projectId: string,
  callbacks: PlanStreamCallbacks = {}
): Promise<PlanResult> {
  const t0 = Date.now();
  // 5.0 Pro 不支持流式 — 退回非流式
  if (plan.modelId === "doubao-seedream-5-0-pro-260628") {
    return executePlan(plan, projectId);
  }

  // 用 Map 按 index 去重：Rust 端会对同一张图先发“localPath 为空”的事件，
  // 下载完成后再发一次带 localPath 的事件。若直接 push 数组会导致重复入库/重复 url。
  const partials = new Map<number, { url: string; localPath?: string }>();
  // 记录每个 partial 对应的已入库 Asset，单图完成时可直接复用，避免“partial + 主资产”两条重复记录。
  const partialAssets = new Map<number, Promise<Asset>>();
  const failedIndices: number[] = [];

  return await new Promise<PlanResult>((resolve, reject) => {
    generateImageStream(
      {
        model: plan.modelId,
        prompt: plan.prompt,
        image: plan.images,
        size: plan.size,
        sequential: plan.maxImages && plan.maxImages > 1 ? "auto" : undefined,
        maxImages: plan.maxImages && plan.maxImages > 1 ? plan.maxImages : undefined,
        outputFormat: plan.outputFormat,
        tools: plan.tools,
        optimizePromptMode: plan.optimizePromptMode,
        background: plan.background,
        layerDecomposition: plan.layerDecomposition,
      },
      {
        onPartial: ({ index, url, localPath, outputFormat }) => {
          const existing = partials.get(index);
          if (existing) {
            // 同一张图的第二次事件只补 localPath，不重复创建资产
            if (localPath) existing.localPath = localPath;
            return;
          }
          partials.set(index, { url, localPath });
          // partial 成功即入库（让用户早点看到图）
          const isTransparent = plan.background === "transparent";
          // Rust 端从入参推算 outputFormat 后透传过来（5.0 系列 = Some，4.5/4.0 = None）。
          // 配合 reqFormat + 模型兜底，5.0 Lite 默认场景 partial 资产也能正确写入
          // outputFormat 字段，详情页"格式"显示 PNG（而不是 "—"）。
          const partialFormat = resolveFormat({
            respFormat: outputFormat,
            reqFormat: plan.outputFormat,
            modelId: plan.modelId,
          });
          const assetPromise = createAsset({
            projectId,
            prompt: plan.prompt,
            model: plan.modelId,
            modelName: plan.modelName,
            size: plan.size,
            refCount: plan.images?.length ?? 0,
            costMs: 0, // 流式 partial 阶段还没法算最终耗时
            isLayerDecomposition: !!plan.layerDecomposition,
            payload: buildAssetPayload(
              {
                urls: [url],
                isTransparent,
              },
              partialFormat
            ),
          });
          partialAssets.set(index, assetPromise);
          assetPromise
            .then((asset) => callbacks.onPartialAsset?.(asset, index))
            .catch((e) => console.error("partial asset save failed", e));
        },
        onPartialFailed: (info) => {
          failedIndices.push(info.index ?? -1);
          callbacks.onPartialFailed?.(info);
        },
        onCompleted: (info) => {
          const costMs = Date.now() - t0;
          const sortedEntries = Array.from(partials.entries()).sort(
            (a, b) => a[0] - b[0]
          );
          if (sortedEntries.length === 0) {
            reject(new Error("流式生图未产出任何图"));
            return;
          }
          // 单图流式：partial 资产已经入库，直接复用它作为结果，
          // 不再创建第二条“主资产”，避免资产库和 chat 里同一张图出现两次。
          if (sortedEntries.length === 1) {
            const onlyIndex = sortedEntries[0][0];
            const onlyAssetPromise = partialAssets.get(onlyIndex);
            if (!onlyAssetPromise) {
              reject(new Error("流式生图未产出任何图"));
              return;
            }
            onlyAssetPromise
              .then((asset) => resolve({ asset, costMs, isDemo: false }))
              .catch((e) => reject(e));
            return;
          }

          const isLayer = !!plan.layerDecomposition;
          const sortedPartials = sortedEntries.map(([, p]) => p);
          const isTransparent = plan.background === "transparent";
          // 流式 completed 阶段拿到 API 顶层 output_format，是权威值
          const actualFormat = resolveFormat({
            respFormat: (info as { output_format?: string }).output_format,
            reqFormat: plan.outputFormat,
            modelId: plan.modelId,
          });
          createAsset({
            projectId,
            prompt: plan.prompt,
            model: plan.modelId,
            modelName: plan.modelName,
            size: plan.size,
            refCount: plan.images?.length ?? 0,
            costMs,
            isLayerDecomposition: isLayer,
            payload: buildAssetPayload(
              {
                urls: sortedPartials.map((p) => p.url),
                localPaths: sortedPartials.map((p) => p.localPath ?? ""),
                usage: info.usage,
                isTransparent,
              },
              actualFormat
            ),
          })
            .then((asset) =>
              resolve({
                asset,
                costMs,
                isDemo: false,
              })
            )
            .catch((e) => reject(e));
        },
        onAborted: ({ reason }) => {
          // 流中断：把已经入库的 partials 留下，告诉上层流断了
          // 用一个特殊 error message 让前端能识别
          const err = new Error(
            `流式生图中断：${reason}（已完成 ${partials.size} 张，失败 ${failedIndices.length} 张）`
          );
          (err as Error & { partials?: number }).partials = partials.size;
          reject(err);
        },
      }
    ).catch((e) => reject(e));
  });
}

/**
 * 执行一个生成计划：调 jimeng + 资产入库。
 * 失败抛错（外层负责 explainError + toast）。
 */
export async function executePlan(
  plan: PlanArgs,
  projectId: string
): Promise<PlanResult> {
  const t0 = Date.now();
  const resp = await generateImage({
    model: plan.modelId,
    prompt: plan.prompt,
    image: plan.images,
    size: plan.size,
    sequential: plan.maxImages && plan.maxImages > 1 ? "auto" : undefined,
    maxImages: plan.maxImages && plan.maxImages > 1 ? plan.maxImages : undefined,
    outputFormat: plan.outputFormat,
    tools: plan.tools,
    optimizePromptMode: plan.optimizePromptMode,
    background: plan.background,
    layerDecomposition: plan.layerDecomposition,
  });
  const costMs = Date.now() - t0;
  const isLayer = !!plan.layerDecomposition;
  // P4：记录透明背景 + 实际输出格式，便于资产卡角标显示
  const isTransparent = plan.background === "transparent";
  // 从响应里取实际 output_format（5.0 Pro / Lite 顶层字段），fallback 到请求值
  const actualFormat = resolveFormat({
    respFormat: (resp as { output_format?: string }).output_format,
    reqFormat: plan.outputFormat,
    modelId: plan.modelId,
  });
  // P5：把每张图的 localPath 持久化（Rust 端已下载到本地缓存）。
  // 用空串占位缺失项，保持数组与 urls/layers 一一对应；空串在入库/兜底时视为缺失。
  const localPaths = resp.images.map((i) => i.localPath ?? "");
  // 图层拆分场景：urls 留空（实际图存在 layers），localPath 与 layers 平行存到 layerLocalPaths
  // 之前图层拆分场景的 `localPaths` 字段实际上从未被读（flatAssetImages 在图层拆分场景
  // 只读 layer.localPath / layer.url，不读 payload.localPaths），改用 layerLocalPaths
  // 是更语义化的写法，且与 AssetPayload 类型设计一致。
  const payload = isLayer
    ? buildAssetPayload(
        {
          urls: [],
          layers: resp.images,
          usage: resp.usage,
          isTransparent,
          layerLocalPaths: localPaths,
        },
        actualFormat
      )
    : buildAssetPayload(
        {
          urls: resp.images.map((i) => i.url),
          usage: resp.usage,
          isTransparent,
          localPaths,
        },
        actualFormat
      );
  const asset = await createAsset({
    projectId,
    prompt: plan.prompt,
    model: plan.modelId,
    modelName: plan.modelName,
    size: plan.size,
    refCount: plan.images?.length ?? 0,
    costMs,
    isLayerDecomposition: isLayer,
    payload,
  });
  return { asset, costMs, isDemo: resp.isDemo };
}

/**
 * 根据一次生成自动学习 Agent Memory（画风 + 最近模型）。
 * - 更新 ctx，setter 落 state
 * - 异步持久化
 * - 返回新 ctx 供调用方使用
 */
export async function learnFromGeneration(
  ctx: AgentContext | null,
  userInput: string,
  modelId: string,
  projectId: string,
  setCtx: (c: AgentContext) => void
): Promise<AgentContext | null> {
  if (!ctx) return null;
  const next = addStyleHints(ctx, userInput);
  const withModel = recordModel(next, modelId);
  setCtx(withModel);
  // 持久化失败不影响 UI（已经 set state 了）
  try {
    await saveAgentContext(projectId, withModel);
  } catch {
    // saveAgentContext 错误已由 chat-history 同等机制覆盖；
    // 这里静默即可——下次启动会重新加载内存中的 ctx
  }
  return withModel;
}

/**
 * 把一次成功的生成结果写回 agent message。
 * 用途：LLM 路径结束 / 规则 plan 确认 → 把 toolAssets 持久化到消息 + 清空 pendingPlan。
 */
export function persistGenerationResult(
  messageId: string,
  args: {
    finalContent: string;
    events: unknown[];
    skillLog: object | null;
    assets: Asset[];
  }
): void {
  persistUpdate(messageId, {
    content: args.finalContent,
    events: args.events as never,
    skillLog: args.skillLog ?? undefined,
    assetIds: args.assets.length > 0 ? dbAssetIds(args.assets) : null,
  });
}

/** 按 modelId 查 modelName（找不到就用 raw id） */
export function modelNameOf(modelId: string, fallback: ModelOption): string {
  return fallback.id === modelId ? fallback.name : modelId;
}
