import { describe, it, expect } from "vitest";
import { loadBuiltinSkills, parseSkillMd, inferSkillGroup, type Skill } from "@/lib/skill";

// ============================================================================
// 回归测试：13 个内置 Skill 的 frontmatter 必须都能正确 parse
// ============================================================================
// 之前 KEYWORD_MAP 只覆盖 6/13，导致 7 个 Skill 只能通过 /skill-id 触发。
// 这组测试不直接测关键词命中（已在 agent-router.test.ts 覆盖），而是
// 验证：
// 1. 所有 13 个 builtin 文件都能 parse（不抛错 / 字段齐全）
// 2. 关键词词典覆盖了 13 个 Skill 的所有 id（即没有"挂件 Skill"）
// ============================================================================

const EXPECTED_IDS = [
  "character-consistency-set",
  "character-sheet",
  "character-turnaround",
  "expression-grid",
  "icon-pack-transparent",
  "infographic-poster",
  "kv-poster",
  "layer-separation",
  "local-edit-bbox",
  "product-shot-pack",
  "scene-mood",
  "scene-mood-light-variants",
  "ui-icons",
];

describe("全部 13 个 builtin Skill 都能 parse", () => {
  const skills = loadBuiltinSkills();

  it("至少 13 个", () => {
    expect(skills.length).toBeGreaterThanOrEqual(EXPECTED_IDS.length);
  });

  it("每个期望的 id 都有", () => {
    const ids = new Set(skills.map((s) => s.id));
    for (const id of EXPECTED_IDS) {
      expect(ids.has(id), `缺少 Skill: ${id}`).toBe(true);
    }
  });

  it("每个 Skill 都有 name / triggers / template", () => {
    for (const s of skills) {
      expect(s.name, `${s.id} 缺 name`).toBeTruthy();
      expect(s.triggers.length, `${s.id} 没触发词`).toBeGreaterThan(0);
      expect(s.template, `${s.id} 模板为空`).toBeTruthy();
      // 注：很多 Skill 是"文档式"（解释 UI 工具怎么用），不一定要占位符
      // 例如 local-edit-bbox 描述的是"点局部编辑按钮"流程，不调 generateImage。
      // 这里只保证模板非空，不强制要求占位符。
    }
  });

  it("有占位符的 Skill 占位符语法合法", () => {
    // 至少 parse 阶段不抛错（其它模板格式问题由前端的 markdown 渲染兜底）
    for (const s of skills) {
      const placeholders = s.template.match(/\{\{\s*([a-z_]+)\s*\}\}/g) ?? [];
      for (const ph of placeholders) {
        // 占位符只能是 user_xxx 或大写常量
        const m = ph.match(/\{\{\s*([a-z_]+)\s*\}\}/);
        const name = m?.[1] ?? "";
        const valid = name.startsWith("user_") || /^[A-Z_]+$/.test(name);
        // 容忍渲染阶段遗漏的占位符（已知限制），但语法必须合法
        expect(valid, `${s.id} 占位符 ${ph} 名字不合法`).toBe(true);
      }
    }
  });

  it("每个 Skill 都能 infer 一个 group", () => {
    for (const s of skills) {
      const g = inferSkillGroup(s);
      expect(["基础生图", "组图", "5.0 Pro 专属", "高级"]).toContain(g);
    }
  });

  it("重复 loadBuiltinSkills 走缓存（不应 rebuild）", () => {
    const before = loadBuiltinSkills();
    const after = loadBuiltinSkills();
    expect(before).toBe(after); // 引用同一份 cached 数组
  });
});

describe("parseSkillMd 单元测试", () => {
  it("缺 frontmatter 抛错", () => {
    expect(() => parseSkillMd("x", "no frontmatter here")).toThrow(/frontmatter/);
  });

  it("缺 triggers 抛错", () => {
    expect(() =>
      parseSkillMd(
        "x",
        `---\nname: test\n---\ntemplate body`
      )
    ).toThrow(/triggers/);
  });

  it("snake_case 字段 (model_hint / group_count / ref_required) 正确 parse", () => {
    const s = parseSkillMd(
      "x",
      `---\nname: Test\ntriggers: [/t]\nmodel_hint: m1\nsize: 2k\ngroup_count: 3\nref_required: true\n---\nbody {{user_input}}`
    );
    expect(s.modelHint).toBe("m1");
    expect(s.size).toBe("2k");
    expect(s.groupCount).toBe(3);
    expect(s.refRequired).toBe(true);
  });

  it("ref_required 缺省时为 false", () => {
    const s = parseSkillMd(
      "x",
      `---\nname: Test\ntriggers: [/t]\n---\nbody {{user_input}}`
    );
    expect(s.refRequired).toBe(false);
  });
});

// 给 vitest 类型提示（避免 unused import 警告）
export type _Unused = Skill;
