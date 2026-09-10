import { useCallback } from "react";
import { useToast } from "@/components/shared/Toast";
import { explainError } from "@/lib/jimeng";
import { log } from "@/lib/logger";
import { agentEvents, type AgentEvent, type ChatMessage } from "@/lib/agent-event";
import { executePlanStream, learnFromGeneration } from "@/lib/agent-flow";
import { persistUpdate, persistDelete } from "@/lib/chat-history";
import { MODEL_OPTIONS, type ModelOption } from "@/lib/types";
import type { AgentContext } from "@/lib/agent-memory";

export interface UsePlanActionsArgs {
  model: ModelOption;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  agentCtx: AgentContext | null;
  setAgentCtx: (c: AgentContext) => void;
  currentProjectId: string;
  generating: boolean;
  setGenerating: (v: boolean) => void;
  reload: (opts?: { silent?: boolean }) => Promise<void>;
  toast: ReturnType<typeof useToast>;
}

export interface UsePlanActionsAPI {
  /** 用户点「开始生成」—— 执行 PlanCard 里的计划 */
  onConfirmPlan: (msgId: string) => Promise<void>;
  /** 用户点「取消」—— 直接删掉 plan 消息 */
  onCancelPlan: (msgId: string) => void;
}

/**
 * PlanCard 的两个动作回调。
 *
 * - onConfirmPlan: 读 `msg.pendingPlan` → executePlanStream → 入库 → 自动学习 → 持久化
 *   整段逻辑从 useChatSubmit 1:1 搬过来，行为零改动。
 * - onCancelPlan: 直接从 messages 里 filter + persistDelete，0.2KB trivial。
 */
export function usePlanActions(args: UsePlanActionsArgs): UsePlanActionsAPI {
  const {
    model,
    messages,
    setMessages,
    agentCtx,
    setAgentCtx,
    currentProjectId,
    generating,
    setGenerating,
    reload,
    toast,
  } = args;

  const onConfirmPlan = useCallback(
    async (msgId: string) => {
      if (generating) return;
      const msg = messages.find((m) => m.id === msgId);
      if (!msg?.pendingPlan) return;
      const plan = msg.pendingPlan;
      setGenerating(true);
      const events: AgentEvent[] = [];
      const off = agentEvents.on((e) => events.push(e));
      // P7：模型以 PromptBar state 为准（plan 不再存 modelId）。
      // 兼容老数据：plan.modelId 若存在仍允许使用，避免老 chat 历史出 bug。
      const useModelId = plan.modelId ?? model.id;
      const useModelOpt: ModelOption =
        MODEL_OPTIONS.find((m) => m.id === useModelId) ?? model;
      const useModelName = useModelOpt.name;
      // P7：能力位预检——maxImages 与 groupGeneration 不匹配时降级 + toast
      let useMaxImages = plan.maxImages;
      if (useMaxImages && useMaxImages > 1 && !useModelOpt.capabilities.groupGeneration) {
        toast.warn(
          `${useModelName} 不支持 ${useMaxImages} 张组图，已自动改为 1 张。要 N 张变体请在 PromptBar 切到 5.0 Lite。`
        );
        useMaxImages = 1;
      }
      try {
        agentEvents.emit({
          type: "tool_start",
          toolName: "jimeng.generate_image",
          model: useModelId,
          args: { prompt: plan.prompt, size: plan.size, maxImages: useMaxImages },
        });
        // P7：规则降级也走 executePlanStream（5.0 Pro 自动 fallback 到非流式）。
        // 组图场景：partial 资产独立入库；主资产是 onCompleted 返回的（首张 partial 复用）。
        const result = await executePlanStream(
          {
            prompt: plan.prompt,
            modelId: useModelId,
            modelName: useModelName,
            size: plan.size,
            ...(plan.image ? { images: plan.image } : {}),
            ...(useMaxImages && useMaxImages > 1 ? { maxImages: useMaxImages } : {}),
            // P0：透传 sourceSkillId 让入库资产可追溯到 Skill
            ...(plan.sourceSkillId ? { sourceSkillId: plan.sourceSkillId } : {}),
            // P1：透传 styleContractId 让入库资产可被契约变更追踪
            ...(plan.styleContractId ? { styleContractId: plan.styleContractId } : {}),
          },
          currentProjectId,
          {
            onPartialFailed: (info) => {
              toast.warn(
                `第 ${(info.index ?? -1) + 1} 张生成失败：${info.message ?? info.code ?? "未知"}`
              );
            },
          }
        );
        const { asset, costMs, isDemo } = result;
        agentEvents.emit({
          type: "tool_end",
          toolName: "jimeng.generate_image",
          costMs,
          assets: [asset],
          isDemo,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  content: "✅ 已生成。",
                  pendingPlan: undefined,
                  assets: [asset],
                  skillLog: m.skillLog
                    ? { ...m.skillLog, costMs, isDemo, modelUsed: useModelId, modelName: useModelName }
                    : undefined,
                  events: [
                    ...events,
                    {
                      type: "turn_end",
                      assistantMessage: { id: msgId, role: "agent", content: "", createdAt: Date.now() },
                    },
                  ],
                }
              : m
          )
        );
        // 持久化：把 plan 清掉 + asset_id 存上
        persistUpdate(msgId, {
          content: "✅ 已生成。",
          pendingPlan: null,
          assetIds: [asset.id],
          skillLog: msg.skillLog
            ? { ...msg.skillLog, costMs, isDemo, modelUsed: useModelId, modelName: useModelName }
            : undefined,
        });
        // 自动学习
        const userMsgs = messages.filter((m) => m.role === "user");
        const lastUserText = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : "";
        if (agentCtx && lastUserText) {
          await learnFromGeneration(agentCtx, lastUserText, useModelId, currentProjectId, setAgentCtx);
        }
        reload({ silent: true });
      } catch (e: any) {
        const raw = e?.message ?? String(e);
        const friendly = await explainError(raw).catch(() => raw);
        log.error("project-detail", "onConfirmPlan failed:", e);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, content: m.content, error: friendly, pendingPlan: undefined, events: [...events] }
              : m
          )
        );
      } finally {
        off();
        setGenerating(false);
      }
    },
    [
      generating,
      setGenerating,
      messages,
      setMessages,
      model,
      toast,
      currentProjectId,
      agentCtx,
      setAgentCtx,
      reload,
    ]
  );

  /** 规则降级：用户点了"取消" */
  const onCancelPlan = useCallback(
    (msgId: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      persistDelete(msgId);
    },
    [setMessages]
  );

  return { onConfirmPlan, onCancelPlan };
}
