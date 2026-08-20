/**
 * Skill 加载与渲染
 * - Skill 格式：Agent Skills 标准（frontmatter + markdown body）
 * - 触发词：用户输入以 /xxx 开头 OR 包含关键词 → 命中
 * - 模板占位符：{{user_input}} 渲染为用户原话
 * - v0.1：6 个预置 Skill 通过 Vite import.meta.glob 内联打包（无需网络请求）
 */

import { log } from "@/lib/logger";

export interface Skill {
  /** Skill 标识（目录名） */
  id: string;
  /** 显示名（来自 frontmatter name） */
  name: string;
  /** 描述 */
  description: string;
  /** 触发词列表（含 /xxx 显式触发 + 关键词模糊触发） */
  triggers: string[];
  /** 推荐模型 id（来自 frontmatter model_hint） */
  modelHint?: string;
  /** 推荐尺寸（来自 frontmatter size） */
  size?: string;
  /** 推荐数量（来自 frontmatter group_count） */
  groupCount?: number;
  /** 是否必须参考图（来自 frontmatter ref_required） */
  refRequired: boolean;
  /** P6：所属分组（基础生图 / 组图 / 5.0 Pro 专属 / 高级） */
  group?: SkillGroup;
  /** 模板正文（已剥离 frontmatter） */
  template: string;
}

/** P6：Skill 分组（按能力维度分类，方便 picker 展示） */
export type SkillGroup =
  | "基础生图"
  | "组图"
  | "5.0 Pro 专属"
  | "高级";

/** 按 id 推断默认分组（frontmatter 未声明时用） */
export function inferSkillGroup(skill: Pick<Skill, "id" | "modelHint" | "groupCount">): SkillGroup {
  if (skill.groupCount && skill.groupCount > 1) return "组图";
  if (skill.modelHint === "doubao-seedream-5-0-pro-260628") return "5.0 Pro 专属";
  return "基础生图";
}

/**
 * 从 markdown 文本解析 frontmatter + 模板
 * - frontmatter 必须位于文件最顶部，以 `---` 包裹
 * - 简单 YAML 解析：仅支持 key: value 与 key: [a, b, c] 两种格式
 */
export function parseSkillMd(id: string, raw: string): Skill {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error(`Skill ${id} 缺少 frontmatter（--- 包裹的元数据）`);
  }
  const fmRaw = fmMatch[1];
  const template = fmMatch[2].trim();

  const meta: Record<string, string | string[]> = {};
  for (const line of fmRaw.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      meta[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      meta[key] = val.replace(/^["']|["']$/g, "");
    }
  }

  const triggers = Array.isArray(meta.triggers) ? meta.triggers : [];
  if (triggers.length === 0) {
    throw new Error(`Skill ${id} 缺少 triggers 字段`);
  }

  const skill: Skill = {
    id,
    name: (meta.name as string) ?? id,
    description: (meta.description as string) ?? "",
    triggers,
    modelHint: meta.model_hint as string | undefined,
    size: meta.size as string | undefined,
    groupCount: meta.group_count !== undefined ? Number(meta.group_count) : undefined,
    refRequired: meta.ref_required === "true",
    group: meta.group as SkillGroup | undefined,
    template,
  };
  // P6：未声明 group 时按规则推断
  if (!skill.group) {
    skill.group = inferSkillGroup(skill);
  }
  return skill;
}

/**
 * 把 Skill 模板里的 {{user_input}} 占位符替换为用户原话。
 * v0.1 暂只支持这一个占位符。
 */
export function renderSkill(skill: Skill, userInput: string, styleHints: string[] = []): string {
  let prompt = skill.template.replace(/\{\{\s*user_input\s*\}\}/g, userInput.trim());
  // 把项目级画风偏好拼到末尾（v0.1 简化：直接拼，不做 LLM 调度）
  if (styleHints.length > 0) {
    prompt += `\n\n[项目画风偏好] ${styleHints.join("、")}`;
  }
  return prompt;
}

// ---------------------------------------------------------------------------
// 内置 Skill 加载（Vite 内联打包）
// ---------------------------------------------------------------------------

// Vite 静态导入所有 .md 文件（EAGER：编译时内联进 bundle）
// 放在 src/ 目录内（不是 public/），否则 Vite 会警告"public 资源不能从 JS 引用"
const skillModules = import.meta.glob<string>(
  "../skills/builtin/*/SKILL.md",
  { eager: true, query: "?raw", import: "default" }
);

let cached: Skill[] | null = null;

/** 加载所有内置 Skill（首次调用解析，后续走缓存） */
export function loadBuiltinSkills(): Skill[] {
  if (cached) return cached;
  const out: Skill[] = [];
  for (const [path, raw] of Object.entries(skillModules)) {
    // path 形如 '../../public/skills/builtin/character-turnaround/SKILL.md'
    const m = path.match(/builtin\/([^/]+)\/SKILL\.md$/);
    if (!m) continue;
    try {
      out.push(parseSkillMd(m[1], raw));
    } catch (e) {
      log.warn("skill", `跳过 ${path}：`, e);
    }
  }
  // 排序：按 name 字典序
  out.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  cached = out;
  return out;
}

/** 按 id 查找 Skill */
export function findSkill(idOrName: string): Skill | undefined {
  return loadBuiltinSkills().find(
    (s) => s.id === idOrName || s.name === idOrName || s.triggers.includes(idOrName)
  );
}
