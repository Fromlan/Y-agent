/**
 * LLM 客户端（OpenAI 兼容协议）
 * - 预设 Provider：DeepSeek、豆包 Lite、OpenAI
 * - 自定义：任意 OpenAI 兼容端点
 * - 支持 tool_calls 循环（v0.1 单轮工具调用：jimeng.generate_image）
 * - 流式响应：v0.1 暂用非流式（先求稳），流式留给 v0.2
 */

import { log } from "@/lib/logger";
import type { Asset } from "@/lib/types";

export interface LLMConfig {
  provider: "deepseek" | "doubao" | "openai" | "custom";
  apiKey: string;
  endpoint: string; // 完整 /v1/chat/completions URL
  model: string;
}

// 预设 Provider 默认值
export const LLM_PRESETS: Record<string, { endpoint: string; model: string; name: string }> = {
  deepseek: {
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-v4-flash",
  },
  doubao: {
    name: "豆包 Lite（火山方舟）",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    model: "doubao-lite-32k",
  },
  openai: {
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  },
};

// ----- OpenAI 兼容协议类型 -----

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  /** 助手消息带的工具调用 */
  tool_calls?: ToolCall[];
  /** tool 消息：对应哪个工具调用 */
  tool_call_id?: string;
  /** 用户消息带的图片（base64 dataURL） */
  images?: string[];
  /** 用户消息附带的本地参考图（转 base64） */
  attachments?: string[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON 字符串
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface LLMResponse {
  content: string | null;
  tool_calls?: ToolCall[];
  finish_reason: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 调 LLM（单轮）
 * - 不支持流式（v0.2 再说）
 * - 自动处理 HTTP 错误和 JSON 解析
 */
export async function llmChat(
  cfg: LLMConfig,
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): Promise<LLMResponse> {
  if (!cfg.apiKey) throw new Error("LLM API Key 未配置");
  if (!cfg.endpoint) throw new Error("LLM endpoint 未配置");
  if (!cfg.model) throw new Error("LLM model 未配置");

  // 转换 images → OpenAI 多模态格式（DeepSeek 不支持图片，留作后续 OpenAI/Anthropic 适配）
  const wireMessages = messages.map((m) => {
    if (m.role === "user" && m.images && m.images.length > 0) {
      // OpenAI 多模态格式
      const content: any[] = [{ type: "text", text: m.content ?? "" }];
      for (const url of m.images) {
        content.push({ type: "image_url", image_url: { url } });
      }
      return { role: m.role, content };
    }
    // 构造一个最小集合的对象，避免发出无效字段：
    // - content: 必须存在（assistant 不能是 null，否则 API 报
    //   "Invalid assistant message: content or tool_calls must be set"）。
    //   没内容但有 tool_calls 时给 ""；啥都没有时给 ""。
    // - tool_calls: 仅在非空时附带。空数组会让 DeepSeek 报 400。
    // - tool_call_id: 仅在存在时附带。
    const out: Record<string, unknown> = {
      role: m.role,
      content: m.content ?? "",
    };
    if (m.tool_calls && m.tool_calls.length > 0) {
      out.tool_calls = m.tool_calls;
    }
    if (m.tool_call_id) {
      out.tool_call_id = m.tool_call_id;
    }
    return out;
  });

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: wireMessages,
    temperature: 0.7,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let resp: Response;
  try {
    resp = await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: any) {
    const reason = e?.name === "AbortError" ? "请求超时（60s）" : (e?.message ?? String(e));
    throw new Error(`LLM 请求失败：${reason}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LLM HTTP ${resp.status}: ${text.slice(0, 500)}`);
  }

  const json = (await resp.json()) as {
    choices?: Array<{
      message?: {
        role?: string;
        content?: string | null;
        tool_calls?: ToolCall[];
      };
      finish_reason?: string;
    }>;
    usage?: LLMResponse["usage"];
  };

  const choice = json.choices?.[0];
  if (!choice?.message) {
    throw new Error("LLM 响应无 message 字段：" + JSON.stringify(json).slice(0, 500));
  }
  return {
    content: choice.message.content ?? null,
    tool_calls: choice.message.tool_calls,
    finish_reason: choice.finish_reason ?? "unknown",
    usage: json.usage,
  };
}

/**
 * 多轮对话循环：跑 LLM → 执行 tool_calls → 把结果作为 tool 消息追加 → 再次跑 LLM → 直到没有 tool_call
 * 最多 5 轮防爆栈
 *
 * P6：支持流式输出（onDelta 回调 + onTextDone 收尾）。
 * - onDelta(delta): 每次 LLM 推送一段新文字时触发
 * - onTextDone(text): 整段 LLM 响应结束时触发（含 tool_calls 之前的 final text）
 * - executeTool: 工具调用，emit tool_start / tool_end
 * - onToolStart(name, args) / onToolEnd(name, assets) / onToolError: 让 UI 实时反映工具状态
 */
export interface LLMChatLoopCallbacks {
  onDelta?: (delta: string) => void;
  onTextDone?: (text: string) => void;
  onToolStart?: (name: string, args: any) => void;
  onToolEnd?: (name: string, assets: Asset[]) => void;
  onToolError?: (name: string, err: string) => void;
}
export async function llmChatLoop(
  cfg: LLMConfig,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  executeTool: (name: string, args: any) => Promise<{ result: string; artifacts?: any[] }>,
  callbacks?: LLMChatLoopCallbacks
): Promise<{ messages: ChatMessage[]; finalContent: string }> {
  const working = [...messages];
  const MAX_TURNS = 5;
  let finalContent = "";
  for (let i = 0; i < MAX_TURNS; i++) {
    // 流式拉一次
    const stream = await llmChatStream(cfg, working, tools);
    let buf = "";
    let resp: LLMResponse;
    try {
      for await (const delta of stream) {
        if (delta.content) {
          buf += delta.content;
          callbacks?.onDelta?.(delta.content);
        }
      }
      // stream 完成后读 final 元数据（最后一段 stream chunk 会带 usage / finish_reason）
      const final = await stream.final;
      resp = {
        content: buf || null,
        tool_calls: final.tool_calls,
        finish_reason: final.finish_reason ?? "stop",
        usage: final.usage,
      };
      callbacks?.onTextDone?.(buf);
    } catch (e) {
      // 流式出错时回退到非流式（保持兼容）
      log.warn("llm", "stream failed, fallback to non-stream:", e);
      resp = await llmChat(cfg, working, tools);
      if (resp.content) {
        buf = resp.content;
        callbacks?.onTextDone?.(buf);
      }
    }
    if (resp.content) finalContent = resp.content;
    if (!resp.tool_calls || resp.tool_calls.length === 0) {
      // 正常结束
      working.push({ role: "assistant", content: resp.content });
      break;
    }
    if (i === MAX_TURNS - 1) {
      // 达到上限但模型仍要求调工具：给用户一个明确提示，避免静默空白。
      finalContent = finalContent || "已达到最大工具调用轮次，请重试或简化需求。";
      break;
    }
    // 把 assistant 消息（含 tool_calls）推入
    working.push({ role: "assistant", content: resp.content, tool_calls: resp.tool_calls });
    // 顺序执行每个 tool_call
    for (const tc of resp.tool_calls) {
      let args: any;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch (e: any) {
        // JSON 解析失败：回传错误给 LLM，让它重新格式化参数（不要静默用 {}）
        log.warn("llm", "tool args parse failed:", tc.function.arguments, e);
        working.push({
          role: "tool",
          tool_call_id: tc.id,
          content: `工具 ${tc.function.name} 的参数 JSON 解析失败：${e?.message ?? e}。请重新生成正确格式的参数。`,
        });
        callbacks?.onToolError?.(tc.function.name, `参数 JSON 解析失败：${e?.message ?? e}`);
        continue;
      }
      callbacks?.onToolStart?.(tc.function.name, args);
      try {
        const { result } = await executeTool(tc.function.name, args);
        working.push({ role: "tool", tool_call_id: tc.id, content: result });
        // 尝试从 result 里抽 assets（约定 JSON 里有 { assets: [...] }）
        try {
          const parsed = JSON.parse(result);
          if (Array.isArray(parsed?.assets)) {
            callbacks?.onToolEnd?.(tc.function.name, parsed.assets);
          }
        } catch {
          // result 不是 JSON，跳过
        }
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        log.warn("llm", "tool execution failed:", tc.function.name, e);
        working.push({
          role: "tool",
          tool_call_id: tc.id,
          content: `工具 ${tc.function.name} 执行失败：${msg}`,
        });
        callbacks?.onToolError?.(tc.function.name, msg);
      }
    }
    // 继续下一轮
  }
  return { messages: working, finalContent };
}

/**
 * P6：流式 LLM 调（OpenAI SSE 协议）
 * - 返回 AsyncIterable<{ content?: string }>，每个 chunk 包含一段新文字
 * - final Promise<LLMResponse> 等 stream 跑完后 resolve，携带 tool_calls / finish_reason / usage
 * - 用 EventSource 不行（POST 需带 body），用 fetch + ReadableStream 手工解析 SSE
 */
export interface StreamChunk {
  content?: string;
}
export interface StreamFinal {
  tool_calls?: ToolCall[];
  finish_reason?: string;
  usage?: LLMResponse["usage"];
}
export interface LLMStream {
  [Symbol.asyncIterator](): AsyncIterator<StreamChunk>;
  final: Promise<StreamFinal>;
}

export function llmChatStream(
  cfg: LLMConfig,
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): Promise<LLMStream> {
  if (!cfg.apiKey) throw new Error("LLM API Key 未配置");
  if (!cfg.endpoint) throw new Error("LLM endpoint 未配置");
  if (!cfg.model) throw new Error("LLM model 未配置");

  // 转换 messages（同 llmChat）
  const wireMessages = messages.map((m) => {
    if (m.role === "user" && m.images && m.images.length > 0) {
      const content: any[] = [{ type: "text", text: m.content ?? "" }];
      for (const url of m.images) {
        content.push({ type: "image_url", image_url: { url } });
      }
      return { role: m.role, content };
    }
    const out: Record<string, unknown> = {
      role: m.role,
      content: m.content ?? "",
    };
    if (m.tool_calls && m.tool_calls.length > 0) out.tool_calls = m.tool_calls;
    if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
    return out;
  });

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: wireMessages,
    temperature: 0.7,
    stream: true,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  // final 元数据（最后一个 chunk 解析后 resolve）
  let resolveFinal!: (v: StreamFinal) => void;
  const finalPromise = new Promise<StreamFinal>((res) => {
    resolveFinal = res;
  });

  // tool_calls 累积（OpenAI 流式 tool_calls 是分段发来的，需要按 index 合并）
  const toolCallAccum = new Map<number, { id: string; name: string; args: string }>();
  let finishReason: string | undefined;
  let usage: LLMResponse["usage"] | undefined;

  // 内部：解析一行 SSE 数据（"data: {...}" 或 "data: [DONE]"）
  const parseLine = (line: string): { content?: string; done?: boolean } | null => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return null;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") return { done: true };
    if (!payload) return null;
    try {
      const obj = JSON.parse(payload);
      const choice = obj.choices?.[0];
      if (!choice) return null;
      const delta = choice.delta ?? {};
      // 累积 tool_calls（按 index 分段）
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const acc = toolCallAccum.get(idx) ?? { id: "", name: "", args: "" };
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name = tc.function.name;
          if (tc.function?.arguments) acc.args += tc.function.arguments;
          toolCallAccum.set(idx, acc);
        }
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
      if (obj.usage) usage = obj.usage;
      return { content: delta.content };
    } catch {
      return null;
    }
  };

  return (async () => {
    const resp = await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).catch((e: any) => {
      clearTimeout(timeout);
      throw new Error(
        `LLM 请求失败：${e?.name === "AbortError" ? "请求超时（120s）" : e?.message ?? String(e)}`
      );
    });

    if (!resp.ok) {
      clearTimeout(timeout);
      const text = await resp.text();
      throw new Error(`LLM HTTP ${resp.status}: ${text.slice(0, 500)}`);
    }

    if (!resp.body) {
      clearTimeout(timeout);
      throw new Error("LLM 响应无 body（流式不支持）");
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    const queue: (StreamChunk | { done: true })[] = [];
    let resolveNext: (() => void) | null = null;
    const wakeNext = () => {
      const r = resolveNext;
      resolveNext = null;
      if (r) r();
    };
    let streamClosed = false;

    // 后台 pump：持续读 stream 往 queue 里塞
    void (async () => {
      try {
        let reading = true;
        while (reading) {
          const { value, done } = await reader.read();
          if (done) {
            reading = false;
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          // SSE 事件以 \n\n 分隔
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? ""; // 最后一个可能不完整
          for (const evt of parts) {
            for (const line of evt.split("\n")) {
              const parsed = parseLine(line);
              if (!parsed) continue;
              if (parsed.done) {
                // 收尾：把累积的 tool_calls 整理出来
                const tool_calls: ToolCall[] = [];
                for (const [idx, acc] of toolCallAccum) {
                  tool_calls[idx] = {
                    id: acc.id,
                    type: "function",
                    function: { name: acc.name, arguments: acc.args || "{}" },
                  };
                }
                resolveFinal({
                  tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
                  finish_reason: finishReason,
                  usage,
                });
                streamClosed = true;
                return;
              }
              if (parsed.content) {
                queue.push({ content: parsed.content });
                wakeNext();
              }
            }
          }
        }
        // body 读完但没收到 [DONE]：也收尾（少数 API 不发 [DONE]）
        if (!streamClosed) {
          const tool_calls: ToolCall[] = [];
          for (const [idx, acc] of toolCallAccum) {
            tool_calls[idx] = {
              id: acc.id,
              type: "function",
              function: { name: acc.name, arguments: acc.args || "{}" },
            };
          }
          resolveFinal({
            tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
            finish_reason: finishReason,
            usage,
          });
          streamClosed = true;
        }
      } catch (e) {
        log.warn("llm-stream", "pump error:", e);
        if (!streamClosed) {
          resolveFinal({});
          streamClosed = true;
        }
      } finally {
        clearTimeout(timeout);
        wakeNext();
      }
    })();

    const iter: AsyncIterator<StreamChunk> = {
      async next(): Promise<IteratorResult<StreamChunk>> {
        while (queue.length === 0) {
          if (streamClosed) return { value: undefined as any, done: true };
          await new Promise<void>((res) => {
            resolveNext = res;
          });
          resolveNext = null;
        }
        const item = queue.shift()!;
        if ("done" in item) return { value: undefined as any, done: true };
        return { value: item as StreamChunk, done: false };
      },
    };

    return {
      [Symbol.asyncIterator]() {
        return iter;
      },
      final: finalPromise,
    };
  })();
}
