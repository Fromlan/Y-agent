import { describe, it, expect } from "vitest";
import { loadBuiltinSkills } from "@/lib/skill";

// ============================================================================
// 守门员：每个内置 Skill 都有"## Seedream 提示词结构"段
// ============================================================================
// 配套：scripts/validate_skills.py（给 CI 用 + 用户机没装 TS 时兜底）
// 本测试给本地 vitest watch 用，无需 Python 依赖。
//
// 强制项（CI 阻塞）：
//   - 模板含"## Seedream 提示词结构"段
//
// 警告项（不阻塞）：
//   - ref_required=true 但模板没提到"参考图 / 上传"
//   - group_count>1 但模板没提到"多图 / 组图"
//   - 模板不含 {{user_input}} 占位符（已知有 5 个 skill 用其它占位符）
//
// 历史变更：
//   - P0 最初要求"反向限制"段；后因即梦 API 不需要 negative prompt，
//     P0.1 改为"## Seedream 提示词结构"段，约束在反面列表里
// ============================================================================

const REF_KEYWORDS = ["参考图", "上传", "reference", "Reference", "upload"];
const GROUP_KEYWORDS = [
  "多图",
  "组图",
  "group",
  "Group",
  "多张",
  "4 张",
  "3-4 张",
  "6-9",
  "9 宫格",
  "8 表情",
  "3 套",
  "3 张",
];

const SEEDREAM_SECTION_HEADER = "## Seedream 提示词结构";

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

describe("守门员：每个内置 Skill 必含 ## Seedream 提示词结构 段", () => {
  const skills = loadBuiltinSkills();

  it("至少 15 个内置 Skill", () => {
    expect(skills.length).toBeGreaterThanOrEqual(15);
  });

  // ★ 核心约束 ★
  it.each(
    loadBuiltinSkills().map((s) => [s.id, s])
  )("%s 必须含 '## Seedream 提示词结构' 段", (_id, skill) => {
    const hasSection = skill.template.includes(SEEDREAM_SECTION_HEADER);
    expect(
      hasSection,
      `${skill.id} 模板不含"## Seedream 提示词结构"段。` +
        `请在 SKILL.md 末尾加这一段，遵循 Seedream 官方指南 6 条原则：` +
        `(主体+行为+环境 / 1-3 风格词 / 明确应用场景 / 文字双引号 / 多图指代 / 多图输出触发词)`
    ).toBe(true);
  });

  it("ref_required=true 的 Skill 模板必须提到'参考图/上传'", () => {
    // 警告项：vitest 不阻塞，但提示出来便于发现
    const offenders = skills
      .filter((s) => s.refRequired)
      .filter((s) => !hasAnyKeyword(s.template, REF_KEYWORDS))
      .map((s) => s.id);
    if (offenders.length > 0) {
      // 用 console.warn 而不是 expect，便于 CI 通过（与 Python 版一致）
      console.warn(`[warn] ref_required=true 但模板没提到参考图: ${offenders.join(", ")}`);
    }
  });

  it("group_count>1 的 Skill 模板必须提到'多图/组图'", () => {
    const offenders = skills
      .filter((s) => (s.groupCount ?? 1) > 1)
      .filter((s) => !hasAnyKeyword(s.template, GROUP_KEYWORDS))
      .map((s) => s.id);
    if (offenders.length > 0) {
      console.warn(`[warn] group_count>1 但模板没提到多图: ${offenders.join(", ")}`);
    }
  });
});
