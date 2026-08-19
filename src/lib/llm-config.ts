/**
 * Agent LLM 配置读写
 * - 存储：kv 表 key="agent_llm" (JSON 字符串)
 * - API Key 通过 Rust 端加密？不，LLM Key 我们直接明文存本地（jimeng Key 加密是因为量大；LLM Key 调频低）
 * - v0.1：明文存储，未来可改 tauri-plugin-stronghold
 */

import { invoke } from "@tauri-apps/api/core";
import { log } from "@/lib/logger";
import type { LLMConfig } from "@/lib/llm";
import { LLM_PRESETS } from "@/lib/llm";

export async function loadLlmConfig(): Promise<LLMConfig | null> {
  try {
    const json = await invoke<string | null>("agent_llm_get");
    if (!json) return null;
    return JSON.parse(json) as LLMConfig;
  } catch (e) {
    log.warn("llm-config", "load failed:", e);
    return null;
  }
}

export async function saveLlmConfig(cfg: LLMConfig | null): Promise<void> {
  if (cfg === null) {
    await invoke("agent_llm_clear");
    return;
  }
  await invoke("agent_llm_update", { json: JSON.stringify(cfg) });
}

export function presetConfig(provider: keyof typeof LLM_PRESETS, apiKey: string): LLMConfig {
  const p = LLM_PRESETS[provider];
  return {
    provider: provider as LLMConfig["provider"],
    apiKey,
    endpoint: p.endpoint,
    model: p.model,
  };
}
