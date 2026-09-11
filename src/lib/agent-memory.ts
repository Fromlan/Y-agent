/**
 * 项目级 Agent Memory
 * - 存储：projects.agent_context (JSON 字符串)
 * - 自动学习：用户每次生成后，从 prompt 提取高频风格词
 * - 手动编辑：UI 提供查看/编辑/清除
 * - v0.2.2: 用量统计 (usageStats) —— 本期仅前端 + JSON 序列化层，Rust 端
 *   schema 迁移留给 schema-version sprint。
 */

import { invoke } from "@tauri-apps/api/core";
import { log } from "@/lib/logger";

/** 一天内的用量统计 */
export interface UsageDayStat {
  /** ISO 日期 `YYYY-MM-DD` */
  date: string;
  /** 当天 LLM 调用次数 */
  calls: number;
  /** 当天 token 总数（input + output） */
  tokens: number;
}

/** 累计用量统计（写入 AgentContext.usageStats） */
export interface UsageStats {
  /** 累计 input tokens */
  totalInputTokens: number;
  /** 累计 output tokens */
  totalOutputTokens: number;
  /**
   * 估算费用（RMB）
   * 按 0.001 元 / 1k tokens 粗算（实际按模型 / 平台差异较大,这里只给量级）。
   * 真实计费以平台账单为准。
   */
  estimatedCostCny: number;
  /** 最近 30 天每日用量（按日期升序） */
  last30Days: UsageDayStat[];
}

/** 空用量统计（首次加载 / 用户清空） */
export const EMPTY_USAGE_STATS: UsageStats = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  estimatedCostCny: 0,
  last30Days: [],
};

export interface AgentContext {
  /** 画风偏好关键词（如"厚涂"、"写实"、"3:2"） */
  styleHints: string[];
  /** 最近用过的模型 id（最多 5 个） */
  recentModels: string[];
  /** v0.2 预留：角色一致性锁定 */
  characterLocks?: { name: string; desc: string; refAssetId?: string };
  /** 最后更新时间 */
  updatedAt: number;
  /** v0.2.2: 累计用量统计（可选,旧数据缺失时按 0 处理） */
  usageStats?: UsageStats;
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
  "3:2", "16:9", "横版", "竖版", "电影感",
  // 题材
  "仙侠", "古风", "科幻", "末日", "和风", "国风", "韩风",
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
      // 旧数据缺失 usageStats 时按空值处理
      usageStats: normalizeUsageStats(parsed.usageStats),
    };
  } catch (e) {
    log.warn("agent-memory", "load failed:", e);
    return { ...EMPTY };
  }
}

/**
 * 把任意输入归一化为合法 UsageStats:
 * - undefined → EMPTY_USAGE_STATS
 * - 缺字段 → 该字段走默认值
 * - 类型错（数组变字符串等）→ 该字段走默认值,但保留其他字段
 */
export function normalizeUsageStats(input: unknown): UsageStats {
  if (!input || typeof input !== "object") return { ...EMPTY_USAGE_STATS };
  const raw = input as Partial<UsageStats>;
  const last30 = Array.isArray(raw.last30Days)
    ? raw.last30Days
        .filter(
          (d): d is UsageDayStat =>
            !!d &&
            typeof d === "object" &&
            typeof (d as UsageDayStat).date === "string" &&
            typeof (d as UsageDayStat).calls === "number" &&
            typeof (d as UsageDayStat).tokens === "number"
        )
        .slice(-30) // 防御性截断
    : [];
  return {
    totalInputTokens:
      typeof raw.totalInputTokens === "number" ? raw.totalInputTokens : 0,
    totalOutputTokens:
      typeof raw.totalOutputTokens === "number" ? raw.totalOutputTokens : 0,
    estimatedCostCny:
      typeof raw.estimatedCostCny === "number" ? raw.estimatedCostCny : 0,
    last30Days: last30,
  };
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

/**
 * 累计一次 LLM 调用的用量。
 * - date: `YYYY-MM-DD`，不传则用今天（用户本地时区用 toLocaleDateString 拿）
 * - unitsPerThousand: 1k tokens 的费用元（默认 0.001）
 *
 * 行为：
 * - last30Days 自动 upsert 当日条目
 * - 超出 30 天的旧条目自动丢弃（窗口按"今天 - 30 天"截断）
 * - 不可变：返回新对象
 */
export function recordUsage(
  ctx: AgentContext,
  usage: { inputTokens: number; outputTokens: number; date?: string },
  costPerKToken: number = 0.001
): AgentContext {
  const today = usage.date ?? new Date().toISOString().slice(0, 10);
  const stats = normalizeUsageStats(ctx.usageStats);
  const totalTokens = usage.inputTokens + usage.outputTokens;
  const addedCost = (totalTokens / 1000) * costPerKToken;

  // upsert 当日条目
  const dayMap = new Map<string, UsageDayStat>();
  for (const d of stats.last30Days) dayMap.set(d.date, d);
  const prev = dayMap.get(today) ?? { date: today, calls: 0, tokens: 0 };
  dayMap.set(today, {
    date: today,
    calls: prev.calls + 1,
    tokens: prev.tokens + totalTokens,
  });

  // 排序 + 截 30 天窗口
  const last30Days = [...dayMap.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-30);

  const nextStats: UsageStats = {
    totalInputTokens: stats.totalInputTokens + usage.inputTokens,
    totalOutputTokens: stats.totalOutputTokens + usage.outputTokens,
    estimatedCostCny: stats.estimatedCostCny + addedCost,
    last30Days,
  };

  return { ...ctx, usageStats: nextStats };
}

/**
 * 清空用量统计（UI 上提供"重置"按钮时调）
 */
export function clearUsageStats(ctx: AgentContext): AgentContext {
  return { ...ctx, usageStats: { ...EMPTY_USAGE_STATS } };
}

export const EMPTY_CONTEXT: AgentContext = EMPTY;