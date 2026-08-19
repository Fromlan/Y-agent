/**
 * 项目级 Agent Memory
 * - 存储：projects.agent_context (JSON 字符串)
 * - 自动学习：用户每次生成后，从 prompt 提取高频风格词
 * - 手动编辑：UI 提供查看/编辑/清除
 */

import { invoke } from "@tauri-apps/api/core";

export interface AgentContext {
  /** 画风偏好关键词（如"厚涂"、"写实"、"3:2"） */
  styleHints: string[];
  /** 最近用过的模型 id（最多 5 个） */
  recentModels: string[];
  /** v0.2 预留：角色一致性锁定 */
  characterLocks?: { name: string; desc: string; refAssetId?: string };
  /** 最后更新时间 */
  updatedAt: number;
}

const EMPTY: AgentContext = {
  styleHints: [],
  recentModels: [],
  updatedAt: 0,
};

const STYLE_KEYWORDS = [
  // 画风
  "厚涂", "薄涂", "平涂", "赛璐璐", "写实", "半写实", "卡通", "像素", "水墨", "水彩", "油画", "插画",
  "二次元", "美卡", "Q版", "q版", "扁平", "等距", "线稿",
  // 色调
  "暗色", "亮色", "冷色调", "暖色调", "高饱和", "低饱和", "莫兰迪", "赛博", "蒸汽朋克",
  // 比例 / 风格
  "厚涂", "3:2", "16:9", "横版", "竖版", "电影感",
  // 题材
  "仙侠", "古风", "科幻", "末日", "蒸汽朋克", "和风", "国风", "韩风",
];

export async function loadAgentContext(projectId: string): Promise<AgentContext> {
  try {
    const json = await invoke<string | null>("agent_context_get", { projectId });
    if (!json) return { ...EMPTY };
    const parsed = JSON.parse(json) as Partial<AgentContext>;
    return {
      styleHints: Array.isArray(parsed.styleHints) ? parsed.styleHints : [],
      recentModels: Array.isArray(parsed.recentModels) ? parsed.recentModels : [],
      characterLocks: parsed.characterLocks,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch (e) {
    console.warn("[agent-memory] load failed:", e);
    return { ...EMPTY };
  }
}

export async function saveAgentContext(projectId: string, ctx: AgentContext): Promise<void> {
  const next: AgentContext = { ...ctx, updatedAt: Date.now() };
  await invoke("agent_context_update", {
    projectId,
    json: JSON.stringify(next),
  });
}

/**
 * 从用户 prompt 里提取画风关键词，合并到现有 styleHints。
 * 规则：同义词去重，最多保留 8 个（按出现频次排）。
 */
export function extractStyleHints(prompt: string, existing: string[]): string[] {
  const counter = new Map<string, number>();
  for (const kw of STYLE_KEYWORDS) {
    if (prompt.includes(kw)) {
      counter.set(kw, (counter.get(kw) ?? 0) + 1);
    }
  }
  // 把 existing 也算 1 次（保留已学到的）
  for (const kw of existing) {
    if (!counter.has(kw)) counter.set(kw, 1);
  }
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k);
}

export function recordModel(ctx: AgentContext, modelId: string): AgentContext {
  const recent = [modelId, ...ctx.recentModels.filter((m) => m !== modelId)].slice(0, 5);
  return { ...ctx, recentModels: recent };
}

export function addStyleHints(ctx: AgentContext, prompt: string): AgentContext {
  return { ...ctx, styleHints: extractStyleHints(prompt, ctx.styleHints) };
}

export const EMPTY_CONTEXT: AgentContext = EMPTY;
