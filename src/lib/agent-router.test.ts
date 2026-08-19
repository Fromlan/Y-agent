import { describe, it, expect } from "vitest";
import { route } from "@/lib/agent-router";
import { MODEL_OPTIONS } from "@/lib/types";

const defaultModel = MODEL_OPTIONS[0]; // Seedream 5.0 Lite（默认）

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
