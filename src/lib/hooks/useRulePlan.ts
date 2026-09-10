import { useCallback } from "react";
import { agentEvents, type AgentEvent, type ChatMessage } from "@/lib/agent-event";
import { route } from "@/lib/agent-router";
import { persistInsert } from "@/lib/chat-history";
import type { ModelOption } from "@/lib/types";
import type { AgentContext } from "@/lib/agent-memory";
import type { StyleContract } from "@/lib/style-contract";

export interface UseRulePlanArgs {
  model: ModelOption;
  size: string;
  refs: string[];
  agentCtx: AgentContext | null;
  styleContract: StyleContract | null;
  styleContractId: string | undefined;
  groupCount: number;
  chatSessionId: string | null;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export type RunRulePlanFn = (
  userInput: string,
  events: AgentEvent[],
  _off: () => void
) => Promise<void>;

/**
 * 规则路由 + PlanCard 路径（无 LLM 时的降级方案）。
 *
 * 流程：
 *   1. `route(userInput, ...)` 拿到 prompt + model + skillLog + plan 字段
 *   2. emit `skill_matched` / `turn_end` 事件
 *   3. 在 chat 流插入一条 agent 消息（带 `pendingPlan`），UI 渲染为 PlanCard
 *   4. 持久化 plan + skillLog
 *
 * 用户点「开始生成」才会真正执行计划（见 usePlanActions.onConfirmPlan）。
 */
export function useRulePlan(args: UseRulePlanArgs): RunRulePlanFn {
  const {
    model,
    size,
    refs,
    agentCtx,
    styleContract,
    styleContractId,
    groupCount,
    chatSessionId,
    setMessages,
  } = args;

  return useCallback<RunRulePlanFn>(
    async (userInput, events, _off) => {
      const decision = route(
        userInput,
        model,
        agentCtx?.styleHints ?? [],
        styleContract && styleContract.checksum ? styleContract : undefined
      );
      agentEvents.emit({
        type: "skill_matched",
        skillName: decision.skillName ?? "(default)",
        trigger: decision.triggerType,
      });
      agentEvents.emit({
        type: "turn_end",
        assistantMessage: { id: "", role: "agent", content: "", createdAt: Date.now() },
      });

      const agentId = crypto.randomUUID();
      const planGroupCount = decision.groupCount ?? groupCount;
      // P7：plan 不再存 modelId/modelName（避免和 PromptBar 双源），执行时统一读 model state。
      // 兼容老数据：onConfirmPlan 里如果 plan.modelId 存在仍能用（fallback）。
      const plan: {
        prompt: string;
        size: string;
        image?: string[];
        maxImages?: number;
        suggestedModelName?: string;
        // P0：命中的 Skill id（写入资产 payload，便于按 Skill 维度筛选/统计）
        sourceSkillId?: string;
        // P1：项目级风格契约短哈希（写入资产 payload）
        styleContractId?: string;
      } = {
        prompt: decision.prompt,
        size: decision.size ?? size,
        image: refs.length > 0 ? [...refs] : undefined,
        maxImages: planGroupCount > 1 ? planGroupCount : undefined,
      };
      if (decision.suggestedModelName) {
        plan.suggestedModelName = decision.suggestedModelName;
      }
      if (decision.skill?.id) {
        plan.sourceSkillId = decision.skill.id;
      }
      if (styleContractId) {
        plan.styleContractId = styleContractId;
      }
      const skillLog = {
        matchedSkill: decision.skillName,
        triggerType: decision.triggerType,
        reasoning: decision.reasoning,
        modelUsed: decision.model.id,
        modelName: decision.model.name,
        costMs: 0,
        isDemo: false,
      };
      // 文案更短 + 加引导：把"去配置 LLM"做成可点击的"打开设置"按钮
      // P1 改进 7：原版整条都塞同一段长句，现在拆成"短结论" + "PlanCard 内的提示"
      const content =
        "已规划好生成计划，点下方「开始生成」即可。\n（未配置 Agent LLM，规则路由模式。）";
      setMessages((prev) => [
        ...prev,
        {
          id: agentId,
          role: "agent",
          content,
          events: [...events],
          skillLog,
          createdAt: Date.now(),
          pendingPlan: plan,
        } as ChatMessage & { pendingPlan?: typeof plan },
      ]);
      // 持久化（plan 信息也存）
      persistInsert(chatSessionId!, {
        id: agentId,
        role: "agent",
        content,
        events: [...events],
        skillLog,
        pendingPlan: plan,
      });
    },
    [model, agentCtx, styleContract, styleContractId, refs, groupCount, size, chatSessionId, setMessages]
  );
}
