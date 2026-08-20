/**
 * 生成流程的公共操作。
 * 三个入口（生图 / LLM 对话 / 规则降级）都共享这些步骤：
 *   1. 调 jimeng API
 *   2. 资产入库
 *   3. 自动学习 Agent Memory
 *
 * 抽到这里的目的是消除三处复制粘贴。
 */
import { generateImage } from "@/lib/jimeng";
import { createAsset } from "@/lib/assets";
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
  const payload = isLayer
    ? { urls: [], layers: resp.images, usage: resp.usage }
    : { urls: resp.images.map((i) => i.url), usage: resp.usage };
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
