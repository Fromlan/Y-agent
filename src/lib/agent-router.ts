/**
 * Agent 路由器（v0.1 规则版）
 *
 * 规则：
 *   1. explicit 触发：用户输入以 /xxx 开头
 *      - 去掉 / 前缀作为命令
 *      - 匹配 Skill.triggers 里的某项（也允许 /xxx 直接命中）
 *   2. keyword 触发：扫描用户输入的中文/英文关键词，匹配 6 类
 *      - 三视图 / 角色设定 / 九宫格 / 表情 / UI 图标 / KV 海报 / 气氛图
 *   3. fallback：啥都没命中 → 走当前用户选中的模型 + 原 prompt
 *
 * 输出 RouteDecision：包含最终 prompt + 推荐模型 + 命中原因（给 UI 显示）
 */

import { findSkill, renderSkill, type Skill } from "@/lib/skill";
import { MODEL_OPTIONS, type ModelOption } from "@/lib/types";

export type TriggerType = "explicit" | "keyword" | "fallback";

export interface RouteDecision {
  skillName?: string;
  skill?: Skill;
  model: ModelOption;
  prompt: string;
  triggerType: TriggerType;
  reasoning: string;
  /** 若 explicit 触发，从输入里剥掉 /xxx 前缀（用于 UI 回显） */
  remainingInput?: string;
  /** Skill 模板推荐的尺寸/组图数量，供规则降级计划使用 */
  size?: string;
  groupCount?: number;
  /** P7：当 Skill 推荐模型 ≠ 用户当前模型时，填入推荐模型名（仅展示提示，不影响执行） */
  suggestedModelName?: string;
}

// 关键词词典：6 类 Skill 的中英触发词
const KEYWORD_MAP: { skillId: string; keywords: string[] }[] = [
  {
    skillId: "character-turnaround",
    keywords: ["三视图", "turnaround", "character sheet", "character_sheet"],
  },
  {
    skillId: "expression-grid",
    keywords: ["九宫格", "表情包", "8 表情", "expression grid", "expression"],
  },
  {
    skillId: "character-sheet",
    keywords: ["角色设定", "设定卡", "character card", "角色卡"],
  },
  {
    skillId: "scene-mood",
    keywords: ["气氛图", "场景气氛", "mood board", "关卡气氛", "远景"],
  },
  {
    skillId: "ui-icons",
    keywords: ["UI 图标", "HUD", "icon set", "图标组", "icon pack"],
  },
  {
    skillId: "kv-poster",
    keywords: ["KV 海报", "主视觉", "key visual", "store banner", "商店图"],
  },
];

const EXPLICIT_PREFIX_RE = /^\/([^\s/]+)\s*([\s\S]*)$/;

export function route(
  input: string,
  currentModel: ModelOption,
  styleHints: string[] = []
): RouteDecision {
  const text = input.trim();
  if (!text) {
    return {
      model: currentModel,
      prompt: "",
      triggerType: "fallback",
      reasoning: "输入为空",
    };
  }

  // 1) explicit 触发：以 /xxx 开头
  const m = text.match(EXPLICIT_PREFIX_RE);
  if (m) {
    const cmd = m[1];
    const rest = m[2]?.trim() ?? "";
    const skill = findSkill(cmd) ?? findSkill(`/${cmd}`);
    if (skill) {
      const model = pickModel(skill, currentModel);
      const rendered = renderSkill(skill, rest || "未指定角色", styleHints);
      const suggested = skillModelSuggestion(skill, currentModel);
      return {
        skillName: skill.name,
        skill,
        model,
        prompt: rendered,
        triggerType: "explicit",
        reasoning: `显式触发 /${cmd} → 命中 Skill「${skill.name}」`,
        remainingInput: rest,
        size: skill.size,
        groupCount: skill.groupCount,
        ...(suggested ? { suggestedModelName: suggested } : {}),
      };
    }
    // /xxx 没匹配到 Skill：当作 fallback（仍然剥掉前缀，避免污染 prompt）
    return {
      model: currentModel,
      prompt: rest || text,
      triggerType: "fallback",
      reasoning: `未识别 /${cmd}（无匹配 Skill），走默认生图`,
      remainingInput: rest,
    };
  }

  // 2) keyword 触发
  const lower = text.toLowerCase();
  for (const { skillId, keywords } of KEYWORD_MAP) {
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) {
      const skill = findSkill(skillId);
      if (skill) {
        const model = pickModel(skill, currentModel);
        const rendered = renderSkill(skill, text, styleHints);
        const suggested = skillModelSuggestion(skill, currentModel);
        return {
          skillName: skill.name,
          skill,
          model,
          prompt: rendered,
          triggerType: "keyword",
          reasoning: `检测到关键词「${keywords.find((k) => lower.includes(k.toLowerCase()))}」→ 命中 Skill「${skill.name}」`,
          size: skill.size,
          groupCount: skill.groupCount,
          ...(suggested ? { suggestedModelName: suggested } : {}),
        };
      }
    }
  }

  // 3) fallback
  const fallbackPrompt = styleHints.length > 0
    ? `${text}\n\n[项目画风偏好] ${styleHints.join("、")}`
    : text;
  return {
    model: currentModel,
    prompt: fallbackPrompt,
    triggerType: "fallback",
    reasoning: "未命中 Skill，走当前模型默认生图",
  };
}

/** P7：根据 Skill 推荐选模型，以用户当前模型为最高优先级
 *  - 用户当前模型 = 权威，不再被 Skill 推荐覆盖
 *  - 若 Skill 有不同推荐，会通过 `skillModelSuggestion` 单独提供给 UI 展示
 *  - 若用户当前模型与推荐一致，直接返回
 *  - 若 Skill 无 modelHint，保持用户当前模型
 */
function pickModel(skill: Skill, current: ModelOption): ModelOption {
  if (!skill.modelHint) return current;
  const hit = MODEL_OPTIONS.find((m) => m.id === skill.modelHint);
  if (!hit) return current;
  if (current.id === hit.id) return current;
  // P7：用户选择优先
  return current;
}

/** P7：当 Skill 有推荐模型但与用户当前不一致时，返回 Skill 推荐的模型名（仅用于 UI 展示） */
function skillModelSuggestion(skill: Skill, current: ModelOption): string | undefined {
  if (!skill.modelHint) return undefined;
  const hit = MODEL_OPTIONS.find((m) => m.id === skill.modelHint);
  if (!hit) return undefined;
  if (current.id === hit.id) return undefined;
  return hit.name;
}
