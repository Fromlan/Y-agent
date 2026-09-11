import { describe, it, expect } from "vitest";
import {
  addStyleHints,
  recordModel,
  extractStyleHints,
  EMPTY_CONTEXT,
  normalizeUsageStats,
  recordUsage,
  clearUsageStats,
  type AgentContext,

} from "@/lib/agent-memory";

describe("addStyleHints", () => {
  it("从 prompt 提取画风关键词并合并到现有 hints", () => {
    const ctx: AgentContext = { ...EMPTY_CONTEXT, styleHints: ["写实"] };
    const out = addStyleHints(ctx, "一个厚涂赛璐璐风格的仙侠角色");
    expect(out.styleHints).toContain("厚涂");
    expect(out.styleHints).toContain("赛璐璐");
    expect(out.styleHints).toContain("仙侠");
    expect(out.styleHints).toContain("写实");
  });

  it("没有命中任何关键词时保留现有 hints", () => {
    const ctx: AgentContext = { ...EMPTY_CONTEXT, styleHints: ["写实"] };
    const out = addStyleHints(ctx, "一个简单的猫咪");
    expect(out.styleHints).toEqual(["写实"]);
  });

  it("同义词去重", () => {
    const ctx: AgentContext = { ...EMPTY_CONTEXT, styleHints: [] };
    const out = addStyleHints(ctx, "厚涂厚涂厚涂");
    expect(out.styleHints.filter((k) => k === "厚涂")).toHaveLength(1);
  });

  it("最多保留 8 个 hints", () => {
    const ctx: AgentContext = { ...EMPTY_CONTEXT, styleHints: [] };
    const out = addStyleHints(
      ctx,
      "厚涂 薄涂 平涂 赛璐璐 写实 半写实 卡通 像素 水墨 水彩 油画 插画"
    );
    expect(out.styleHints.length).toBeLessThanOrEqual(8);
  });
});

describe("recordModel", () => {
  it("把模型推到首位，去重已有项", () => {
    const ctx: AgentContext = {
      ...EMPTY_CONTEXT,
      recentModels: ["a", "b", "c"],
    };
    const out = recordModel(ctx, "b");
    expect(out.recentModels).toEqual(["b", "a", "c"]);
  });

  it("新模型直接插到首位", () => {
    const ctx: AgentContext = { ...EMPTY_CONTEXT, recentModels: ["a"] };
    const out = recordModel(ctx, "b");
    expect(out.recentModels).toEqual(["b", "a"]);
  });

  it("最多保留 5 个", () => {
    const ctx: AgentContext = {
      ...EMPTY_CONTEXT,
      recentModels: ["a", "b", "c", "d", "e"],
    };
    const out = recordModel(ctx, "f");
    expect(out.recentModels).toHaveLength(5);
    expect(out.recentModels[0]).toBe("f");
  });

  it("原 context 不被修改（immutable）", () => {
    const ctx: AgentContext = { ...EMPTY_CONTEXT, recentModels: ["a"] };
    recordModel(ctx, "b");
    expect(ctx.recentModels).toEqual(["a"]);
  });
});

describe("extractStyleHints", () => {
  it("大小写不敏感（中文无大小写）", () => {
    const out = extractStyleHints("Q版 厚涂", []);
    expect(out).toContain("Q版");
    expect(out).toContain("厚涂");
  });

  it("已存在的 hints 算 1 次频次（避免被新频次覆盖）", () => {
    const out = extractStyleHints("厚涂 厚涂", ["写实"]);
    const outMap = new Map(out.map((k) => [k, k]));
    expect(outMap.has("写实")).toBe(true);
    expect(outMap.has("厚涂")).toBe(true);
  });
});

describe("normalizeUsageStats", () => {
  it("undefined → 空统计", () => {
    expect(normalizeUsageStats(undefined)).toEqual({
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCostCny: 0,
      last30Days: [],
    });
  });

  it("null → 空统计", () => {
    expect(normalizeUsageStats(null)).toEqual({
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCostCny: 0,
      last30Days: [],
    });
  });

  it("缺失字段走默认值", () => {
    const out = normalizeUsageStats({ totalInputTokens: 100 });
    expect(out.totalInputTokens).toBe(100);
    expect(out.totalOutputTokens).toBe(0);
    expect(out.estimatedCostCny).toBe(0);
    expect(out.last30Days).toEqual([]);
  });

  it("缺类型字段走默认值", () => {
    const out = normalizeUsageStats({ totalInputTokens: "wrong" as any });
    expect(out.totalInputTokens).toBe(0);
  });

  it("last30Days 非法条目被过滤", () => {
    const out = normalizeUsageStats({
      last30Days: [
        { date: "2026-09-10", calls: 1, tokens: 100 },
        null as any,
        { date: 42, calls: "x", tokens: "y" } as any,
        { date: "2026-09-11", calls: 2, tokens: 200 },
      ],
    });
    expect(out.last30Days).toHaveLength(2);
    expect(out.last30Days[0].date).toBe("2026-09-10");
    expect(out.last30Days[1].date).toBe("2026-09-11");
  });

  it("last30Days 超过 30 条自动截断", () => {
    const arr = Array.from({ length: 50 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      calls: 1,
      tokens: 10,
    }));
    const out = normalizeUsageStats({ last30Days: arr });
    expect(out.last30Days).toHaveLength(30);
  });
});

describe("recordUsage", () => {
  it("第一次累计建当日条目", () => {
    const ctx: AgentContext = { ...EMPTY_CONTEXT };
    const out = recordUsage(
      ctx,
      { inputTokens: 100, outputTokens: 50, date: "2026-09-11" }
    );
    expect(out.usageStats!.totalInputTokens).toBe(100);
    expect(out.usageStats!.totalOutputTokens).toBe(50);
    expect(out.usageStats!.last30Days).toHaveLength(1);
    expect(out.usageStats!.last30Days[0]).toEqual({
      date: "2026-09-11",
      calls: 1,
      tokens: 150,
    });
  });

  it("同日多次累计合并到同一条目", () => {
    let ctx: AgentContext = { ...EMPTY_CONTEXT };
    ctx = recordUsage(ctx, {
      inputTokens: 100,
      outputTokens: 50,
      date: "2026-09-11",
    });
    ctx = recordUsage(ctx, {
      inputTokens: 200,
      outputTokens: 80,
      date: "2026-09-11",
    });
    expect(ctx.usageStats!.totalInputTokens).toBe(300);
    expect(ctx.usageStats!.totalOutputTokens).toBe(130);
    expect(ctx.usageStats!.last30Days).toHaveLength(1);
    expect(ctx.usageStats!.last30Days[0].calls).toBe(2);
    expect(ctx.usageStats!.last30Days[0].tokens).toBe(430);
  });

  it("按日期升序排", () => {
    let ctx: AgentContext = { ...EMPTY_CONTEXT };
    ctx = recordUsage(ctx, { inputTokens: 1, outputTokens: 1, date: "2026-09-13" });
    ctx = recordUsage(ctx, { inputTokens: 1, outputTokens: 1, date: "2026-09-11" });
    ctx = recordUsage(ctx, { inputTokens: 1, outputTokens: 1, date: "2026-09-12" });
    expect(ctx.usageStats!.last30Days.map((d) => d.date)).toEqual([
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("估算费用按 costPerKToken 默认 0.001", () => {
    let ctx: AgentContext = { ...EMPTY_CONTEXT };
    ctx = recordUsage(
      ctx,
      { inputTokens: 500, outputTokens: 500, date: "2026-09-11" }
    );
    // 1000 tokens * 0.001 / 1000 = 0.001 元
    expect(ctx.usageStats!.estimatedCostCny).toBeCloseTo(0.001);
  });

  it("估算费用接受自定义单价", () => {
    let ctx: AgentContext = { ...EMPTY_CONTEXT };
    ctx = recordUsage(
      ctx,
      { inputTokens: 1000, outputTokens: 0, date: "2026-09-11" },
      0.05 // 50 元 / 1k tokens(自定义模型)
    );
    expect(ctx.usageStats!.estimatedCostCny).toBeCloseTo(0.05);
  });

  it("不可变(原 ctx 不变)", () => {
    const ctx: AgentContext = { ...EMPTY_CONTEXT };
    const out = recordUsage(ctx, {
      inputTokens: 100,
      outputTokens: 0,
      date: "2026-09-11",
    });
    expect(ctx.usageStats).toBeUndefined();
    expect(out).not.toBe(ctx);
  });

  it("缺 usageStats 时按空统计处理", () => {
    const ctx: AgentContext = {
      ...EMPTY_CONTEXT,
      usageStats: undefined,
    };
    const out = recordUsage(ctx, {
      inputTokens: 10,
      outputTokens: 5,
      date: "2026-09-11",
    });
    expect(out.usageStats!.totalInputTokens).toBe(10);
  });
});

describe("clearUsageStats", () => {
  it("清空累计用量,其他字段保留", () => {
    const ctx: AgentContext = {
      ...EMPTY_CONTEXT,
      styleHints: ["写实"],
      recentModels: ["doubao-x"],
      usageStats: {
        totalInputTokens: 100,
        totalOutputTokens: 50,
        estimatedCostCny: 0.01,
        last30Days: [{ date: "2026-09-11", calls: 1, tokens: 150 }],
      },
    };
    const out = clearUsageStats(ctx);
    expect(out.usageStats!.totalInputTokens).toBe(0);
    expect(out.usageStats!.last30Days).toEqual([]);
    expect(out.styleHints).toEqual(["写实"]);
    expect(out.recentModels).toEqual(["doubao-x"]);
  });
});