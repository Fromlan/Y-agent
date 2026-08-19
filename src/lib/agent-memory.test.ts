import { describe, it, expect } from "vitest";
import {
  addStyleHints,
  recordModel,
  extractStyleHints,
  EMPTY_CONTEXT,
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
