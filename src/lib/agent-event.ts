/**
 * Agent 事件流
 * 参考 earendil-works/pi 的 agent-core 事件模型：
 *   turn_start → skill_matched → tool_start → tool_progress → tool_end → turn_end
 * v0.1：仅在浏览器内 emit（不跨进程），通过 EventEmitter 暴露给 UI
 */

import type { Asset } from "@/lib/types";

export type AgentEvent =
  | { type: "turn_start"; userInput: string }
  | { type: "skill_matched"; skillName: string; trigger: "explicit" | "keyword" | "fallback" }
  | { type: "tool_start"; toolName: "jimeng.generate_image"; model: string; args: unknown }
  | { type: "tool_progress"; progress: number } // 0~1
  | { type: "tool_end"; costMs: number; assets: Asset[]; isDemo: boolean }
  | { type: "turn_end"; assistantMessage: ChatMessage }
  | { type: "error"; message: string };

export interface PendingPlan {
  prompt: string;
  modelId: string;
  modelName: string;
  size: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  attachments?: string[];
  skillLog?: {
    matchedSkill?: string;
    triggerType: "explicit" | "keyword" | "fallback";
    reasoning: string;
    modelUsed: string;
    modelName: string;
    costMs: number;
    isDemo: boolean;
  };
  assets?: Asset[];
  events?: AgentEvent[];
  error?: string;
  /** 规则路由降级模式下的「待确认计划」。点确认后由父组件执行生成 */
  pendingPlan?: PendingPlan;
  createdAt: number;
}

type Listener = (e: AgentEvent) => void;

class EventBus {
  private listeners = new Set<Listener>();
  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e: AgentEvent) {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch (err) {
        console.error("[agent-event] listener error", err);
      }
    }
  }
}

export const agentEvents = new EventBus();
