/**
 * Agent 事件流
 * 参考 earendil-works/pi 的 agent-core 事件模型：
 *   turn_start → skill_matched → tool_start → tool_progress → tool_end → turn_end
 *   + text_delta（流式 LLM 文字增量） / text_done（最终文本）
 * v0.1：仅在浏览器内 emit（不跨进程），通过 EventEmitter 暴露给 UI
 */

import type { Asset } from "@/lib/types";
import { log } from "@/lib/logger";

export type AgentEvent =
  | { type: "turn_start"; userInput: string }
  | { type: "skill_matched"; skillName: string; trigger: "explicit" | "keyword" | "fallback" }
  | { type: "tool_start"; toolName: string; model?: string; args: unknown }
  | { type: "tool_progress"; toolName: string; progress: number } // 0~1
  | { type: "tool_end"; toolName: string; costMs: number; assets: Asset[]; isDemo: boolean }
  | { type: "turn_end"; assistantMessage: ChatMessage }
  | { type: "error"; message: string }
  /** P6：流式 LLM 文字增量（每个 SSE chunk 触发一次） */
  | { type: "text_delta"; delta: string }
  /** P6：流式 LLM 文字结束（最后一个 chunk 后） */
  | { type: "text_done"; fullText: string }
  /** P6：LLM 请求开始（UI 可显示"思考中…"） */
  | { type: "llm_request_start" }
  /** P6：LLM 请求结束（成功或失败都会触发） */
  | { type: "llm_request_end" };

export interface PendingPlan {
  prompt: string;
  /** P7：执行时用 PromptBar 选定的模型。留作兼容老数据：onConfirmPlan 时如果 plan.modelId 存在仍用之。 */
  modelId?: string;
  modelName?: string;
  size: string;
  /** 规则计划生成时需要携带的参考图（dataURL） */
  image?: string[];
  /** 组图数量（>1 时生成时传 sequential/maxImages） */
  maxImages?: number;
  /** P7：Skill 推荐但与 PromptBar 不同时的提示（仅展示，不影响执行） */
  suggestedModelName?: string;
  /** P0：命中的 Skill id（写入 AssetPayload.sourceSkillId，便于按 Skill 维度筛选资产） */
  sourceSkillId?: string;
  /** P1：项目级风格契约短哈希（写入 AssetPayload.styleContractId） */
  styleContractId?: string;
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
  /** 持久化到 DB 的资产 id 列表；listMessages 反查后会填充 assets */
  assetIds?: string[];
  events?: AgentEvent[];
  error?: string;
  /** 规则路由降级模式下的「待确认计划」。点确认后由父组件执行生成 */
  pendingPlan?: PendingPlan;
  createdAt: number;
  /** P6：工具调用列表（内联显示在 chat 里） */
  toolCalls?: ToolCallRecord[];
  /** P6：是否正在流式输出（最后一帧文字后面显示光标） */
  streaming?: boolean;
  /** P6：是否正在等 LLM 响应（显示"思考中…"） */
  pending?: boolean;
}

/** P6：单次工具调用的展示快照（由 agent 事件累积而成） */
export interface ToolCallRecord {
  /** 全局唯一 id（用于 React key） */
  id: string;
  toolName: string;
  args: unknown;
  status: "running" | "done" | "failed";
  /** 执行结果（toString 的简短摘要 + 资产 id 列表） */
  result?: string;
  assets?: Asset[];
  costMs?: number;
  isDemo?: boolean;
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
        log.error("agent-event", "listener error", err);
      }
    }
  }
}

export const agentEvents = new EventBus();
