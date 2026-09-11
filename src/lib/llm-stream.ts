/**
 * LLM 流式调用纯函数封装（W1 接口冻结版）
 *
 * ## 背景
 * `src/lib/hooks/useChatSubmit.ts` 当前 21KB，其中 `runLlmTurn` 单函数 15KB，
 * 闭包捕获 22 个 props + React state。本模块把它拆成"参数 + sink"两步，
 * 让 LLM 流式循环变成纯函数，所有副作用经 sink 回调。
 *
 * ## W1（本 commit）
 * **只冻结接口**。`runLlmStream` 当前实现为最小占位（throw "not yet
 * implemented"），让接口契约可独立 type-check；循环体下沉是下个 commit
 * 的事（避免一次大改破坏 LLM 流式）。
 *
 * ## 设计要点
 * - 不依赖 React state（这是从 useChatSubmit 抽离的根本目的）
 * - 不抛异常：失败走 `sink.onError`；本期占位阶段 throw 是预期的
 * - `LlmStreamArgs` 不持有 LLMConfig 整体，只拿需要的字段（apiKey / baseUrl），
 *   避免上层传一个会被改的配置对象
 *
 * ## 后续迁移路径
 * 1. W2: 把 `llm.streamChatCompletion` 的循环体下沉到 `runLlmStream` 内部
 * 2. W3: `useChatSubmit.runLlmTurn` 改为调 `runLlmStream` + sink 接 React state
 * 3. W4: 删除旧 `runLlmTurn`，props 从 22 个降到 ~8 个
 */
import { log } from "@/lib/logger";

/** OpenAI 兼容的 ChatMessage（窄化版,够 LLM 调用即可） */
export interface LlmStreamMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** OpenAI 兼容的 ToolDefinition（与 llm.ts 现有类型结构一致） */
export interface LlmStreamTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * 流式调用入参
 * - messages: 已构造好的对话历史（含 system / user / assistant）
 * - tools: 可选的工具定义列表
 * - model: 可选,覆盖默认模型
 * - apiKey: 直接传 apiKey,避免依赖具体 LLMConfig 形状
 * - baseUrl: 可选,OpenAI 兼容端点的 base URL（不带 /chat/completions）
 */
export interface LlmStreamArgs {
  messages: LlmStreamMessage[];
  tools?: LlmStreamTool[];
  model?: string;
  apiKey: string;
  baseUrl?: string;
}

/** sink.onDone 的 usage 信息 */
export interface LlmStreamUsage {
  inputTokens: number;
  outputTokens: number;
}

/** sink.onToolCall 的工具调用事件 */
export interface LlmStreamToolCall {
  id: string;
  name: string;
  args: unknown;
}

/**
 * 流式 sink:所有副作用经这里
 *
 * - onText: 每段 delta 文本
 * - onToolCall: 工具调用解析完成
 * - onDone: 流结束(正常完成)
 * - onError: 流中断(网络错 / 鉴权错 / 解析错),不抛异常
 */
export interface LlmStreamSink {
  onText?: (delta: string) => void;
  onToolCall?: (call: LlmStreamToolCall) => void;
  onDone?: (info: { finishReason: string; usage?: LlmStreamUsage }) => void;
  onError?: (err: Error) => void;
}

/**
 * 启动 LLM 流式调用,通过 sink 回调推流。
 * **失败走 sink.onError,不抛异常。**
 *
 * W1 占位实现:仅冻结接口,实际循环体留给后续 commit。
 * 调用方应通过 `typeof runLlmStream === "function"` 校验存在性。
 */
export async function runLlmStream(
  _args: LlmStreamArgs,
  sink: LlmStreamSink = {}
): Promise<void> {
  log.warn("llm-stream", "runLlmStream 占位实现,循环体将在下个 commit 下沉");
  const err = new Error(
    "runLlmStream 循环体尚未实现(W1 仅冻结接口);后续 commit 会从 useChatSubmit.runLlmTurn 下沉"
  );
  sink.onError?.(err);
}