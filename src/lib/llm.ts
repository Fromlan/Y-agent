/**
 * LLM 客户端（OpenAI 兼容协议）
 * - 预设 Provider：DeepSeek、豆包 Lite、OpenAI
 * - 自定义：任意 OpenAI 兼容端点
 * - 支持 tool_calls 循环（v0.1 单轮工具调用：jimeng.generate_image）
 * - 流式响应：v0.1 暂用非流式（先求稳），流式留给 v0.2
 */

import { log } from "@/lib/logger";

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
 */
export async function llmChatLoop(
  cfg: LLMConfig,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  executeTool: (name: string, args: any) => Promise<{ result: string; artifacts?: any[] }>
): Promise<{ messages: ChatMessage[]; finalContent: string }> {
  const working = [...messages];
  const MAX_TURNS = 5;
  let finalContent = "";
  for (let i = 0; i < MAX_TURNS; i++) {
    const resp = await llmChat(cfg, working, tools);
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
        continue;
      }
      const { result } = await executeTool(tc.function.name, args);
      working.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    // 继续下一轮
  }
  return { messages: working, finalContent };
}
