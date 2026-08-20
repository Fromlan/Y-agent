import { useEffect, useRef, useState, useMemo } from "react";
import { Wand2, Layers, ImagePlus, Sparkles } from "lucide-react";
import type { Skill, SkillGroup } from "@/lib/skill";
import { loadBuiltinSkills } from "@/lib/skill";

interface Props {
  /** 输入框当前文本（用于筛选） */
  query: string;
  /** 选中 Skill 后的回调（一般是插入到输入框） */
  onSelect: (skill: Skill) => void;
  /** 关闭 picker */
  onClose: () => void;
}

const GROUP_ORDER: SkillGroup[] = ["基础生图", "组图", "5.0 Pro 专属", "高级"];
const GROUP_ICON: Record<SkillGroup, typeof Wand2> = {
  基础生图: Wand2,
  组图: ImagePlus,
  "5.0 Pro 专属": Sparkles,
  高级: Layers,
};

/**
 * / 命令面板：键盘上下选 + Enter 确认 + Esc 关闭
 * 显示 Skill 列表（按 query 过滤 name / triggers + 按 group 分组）
 */
export default function SkillPicker({ query, onSelect, onClose }: Props) {
  const all = loadBuiltinSkills();
  const filtered = useMemo(
    () =>
      all.filter((s) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.triggers.some((t) => t.toLowerCase().includes(q))
        );
      }),
    [all, query]
  );
  // 按 group 排序：固定顺序的分组，分组内保留原顺序
  const grouped = useMemo(() => {
    const out: Array<{ group: SkillGroup; skills: Skill[] }> = [];
    for (const g of GROUP_ORDER) {
      const items = filtered.filter((s) => (s.group ?? "基础生图") === g);
      if (items.length > 0) out.push({ group: g, skills: items });
    }
    return out;
  }, [filtered]);
  const flat = useMemo(() => grouped.flatMap((g) => g.skills), [grouped]);
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // 每次 query 变化重置选中
  useEffect(() => {
    setIdx(0);
  }, [query]);

  // 键盘导航
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && flat.length > 0) {
        e.preventDefault();
        onSelect(flat[idx]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, flat, onSelect, onClose]);

  // 滚动到选中项
  useEffect(() => {
    // 找到第 idx 个 button（跨过 group header）
    const buttons = listRef.current?.querySelectorAll('[data-skill-item="true"]');
    const el = buttons?.[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  if (flat.length === 0) {
    return (
      <div className="absolute bottom-full left-0 mb-2 w-80 panel p-3 text-xs text-text-muted shadow-lg">
        没有匹配的 Skill
      </div>
    );
  }

  let runningIdx = 0;
  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 mb-2 w-96 max-h-96 overflow-y-auto panel shadow-lg"
    >
      <div className="px-3 py-1.5 text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
        Skill（按 ↑↓ 选择，Enter 确认，Esc 关闭）
      </div>
      {grouped.map(({ group, skills }) => {
        const Icon = GROUP_ICON[group];
        return (
          <div key={group}>
            <div className="px-3 py-1.5 text-[10px] text-text-muted bg-bg-base border-b border-border flex items-center gap-1.5 sticky top-0">
              <Icon className="w-3 h-3" />
              <span className="font-medium uppercase tracking-wider">{group}</span>
              <span className="text-text-muted/60">({skills.length})</span>
            </div>
            {skills.map((s) => {
              const i = runningIdx++;
              return (
                <button
                  key={s.id}
                  data-skill-item="true"
                  onClick={() => onSelect(s)}
                  onMouseEnter={() => setIdx(i)}
                  className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${
                    i === idx ? "bg-bg-hover" : "hover:bg-bg-hover/50"
                  }`}
                >
                  <Wand2 className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary font-medium truncate">
                      /{s.id}
                    </div>
                    <div className="text-xs text-text-muted truncate">
                      {s.name} — {s.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
