import { describe, it, expect } from "vitest";
import { route } from "@/lib/agent-router";
import { MODEL_OPTIONS } from "@/lib/types";

const defaultModel = MODEL_OPTIONS[0]; // Seedream 5.0 Lite（默认）
const proModel = MODEL_OPTIONS.find((m) => m.id === "doubao-seedream-5-0-pro-260628")!;

describe("route — fallback 路径", () => {
  it("空输入走 fallback", () => {
    const r = route("", defaultModel, []);
    expect(r.triggerType).toBe("fallback");
    expect(r.prompt).toBe("");
  });

  it("无关键词无 / 前缀走 fallback", () => {
    const r = route("画一个猫", defaultModel, []);
    expect(r.triggerType).toBe("fallback");
    expect(r.prompt).toBe("画一个猫");
  });

  it("styleHints 非空时附加到 prompt 末尾", () => {
    const r = route("画一个猫", defaultModel, ["写实", "3:2"]);
    expect(r.prompt).toContain("[项目画风偏好] 写实、3:2");
  });

  it("未知 /cmd 也走 fallback（不污染 prompt）", () => {
    const r = route("/unknown-cmd 一个角色", defaultModel, []);
    expect(r.triggerType).toBe("fallback");
    expect(r.remainingInput).toBe("一个角色");
    expect(r.prompt).toBe("一个角色");
  });
});

describe("route — keyword 路径", () => {
  it("中文关键词触发", () => {
    const r = route("画一个三视图角色", defaultModel, []);
    expect(r.triggerType).toBe("keyword");
    expect(r.skillName).toBeDefined();
  });

  it("英文关键词触发", () => {
    const r = route("character sheet of warrior", defaultModel, []);
    expect(r.triggerType).toBe("keyword");
    expect(r.skillName).toBeDefined();
  });

  it("KV 海报触发对应 skill", () => {
    const r = route("做一个 KV 海报", defaultModel, []);
    expect(r.triggerType).toBe("keyword");
    expect(r.skill?.id).toBe("kv-poster");
  });
});

describe("route — explicit 路径", () => {
  it("/xxx 命中 Skill", () => {
    const r = route("/character-sheet 战士", defaultModel, []);
    expect(r.triggerType).toBe("explicit");
    expect(r.skill?.id).toBe("character-sheet");
    expect(r.remainingInput).toBe("战士");
  });

  it("/xxx 没命中走 fallback（剥掉前缀）", () => {
    const r = route("/notexists 战士", defaultModel, []);
    expect(r.triggerType).toBe("fallback");
    expect(r.remainingInput).toBe("战士");
  });
});

describe("route — P7：用户选择优先（不再被 Skill 覆盖）", () => {
  // P7 起：用户在 PromptBar 选 5.0 Pro，路由 Skill character-turnaround
  // （其 modelHint 是 5.0 Lite）时，应保持 5.0 Pro；用 suggestedModelName 提示差异。
  it("用户在 5.0 Pro 调 5.0 Lite skill → model 保持 Pro，suggestedModelName = Lite", () => {
    const r = route("/character-turnaround 战士", proModel, []);
    expect(r.triggerType).toBe("explicit");
    expect(r.skill?.id).toBe("character-turnaround");
    expect(r.model.id).toBe(proModel.id);
    expect(r.suggestedModelName).toBe("Seedream 5.0 Lite（默认）");
  });

  it("用户在 5.0 Lite 调 5.0 Lite skill → model 保持 Lite，无 suggestedModelName", () => {
    const r = route("/character-turnaround 战士", defaultModel, []);
    expect(r.model.id).toBe(defaultModel.id);
    expect(r.suggestedModelName).toBeUndefined();
  });

  it("fallback 路径不产生 suggestedModelName", () => {
    const r = route("随便画点啥", proModel, []);
    expect(r.triggerType).toBe("fallback");
    expect(r.model.id).toBe(proModel.id);
    expect(r.suggestedModelName).toBeUndefined();
  });
});

/**
 * Bug 3 回归：KEYWORD_MAP 之前只覆盖 6/13 Skill，导致
 * "信息图" / "图层拆分" / "局部编辑" 等自然语言输入落到 fallback。
 * 修复后必须命中对应 Skill。
 */
describe("route — 关键词命中（覆盖全部 13 个 builtin Skill）", () => {
  const cases: Array<{ input: string; expectedId: string }> = [
    // 基础生图
    { input: "画一个三视图角色",     expectedId: "character-turnaround" },
    { input: "做个九宫格表情",       expectedId: "expression-grid" },
    { input: "做一张角色设定卡",     expectedId: "character-sheet" },
    { input: "出一张气氛图",         expectedId: "scene-mood" },
    { input: "画一组 UI 图标",       expectedId: "ui-icons" },
    { input: "做一个 KV 海报",       expectedId: "kv-poster" },
    // 组图
    { input: "角色一致性套图",       expectedId: "character-consistency-set" },
    { input: "场景光影早午晚夜",     expectedId: "scene-mood-light-variants" },
    { input: "商品图主图电商",       expectedId: "product-shot-pack" },
    // 5.0 Pro 专属
    { input: "透明图标 icon pack",   expectedId: "icon-pack-transparent" },
    { input: "图层拆分",             expectedId: "layer-separation" },
    { input: "局部编辑改局部",       expectedId: "local-edit-bbox" },
    { input: "信息图海报",           expectedId: "infographic-poster" },
  ];

  for (const c of cases) {
    it(`"${c.input}" → ${c.expectedId}`, () => {
      const r = route(c.input, defaultModel, []);
      expect(r.triggerType).toBe("keyword");
      expect(r.skill?.id).toBe(c.expectedId);
    });
  }

  it("英文关键词 character consistency 命中 character-consistency-set", () => {
    const r = route("character consistency set", defaultModel, []);
    expect(r.triggerType).toBe("keyword");
    expect(r.skill?.id).toBe("character-consistency-set");
  });
});
