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
        return {
          skillName: skill.name,
          skill,
          model,
          prompt: rendered,
          triggerType: "keyword",
          reasoning: `检测到关键词「${keywords.find((k) => lower.includes(k.toLowerCase()))}」→ 命中 Skill「${skill.name}」`,
          size: skill.size,
          groupCount: skill.groupCount,
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

/** 根据 Skill 推荐选模型；若用户当前模型支持，仍尊重用户选择 */
function pickModel(skill: Skill, current: ModelOption): ModelOption {
  if (!skill.modelHint) return current;
  const hit = MODEL_OPTIONS.find((m) => m.id === skill.modelHint);
  if (!hit) return current;
  // 若用户当前模型不是 Lite/Pro 之类可选项，保持推荐
  // 若用户当前模型与推荐一致，直接返回
  if (current.id === hit.id) return current;
  return hit;
}
