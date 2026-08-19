import { useEffect, useRef, useState } from "react";
import { Wand2 } from "lucide-react";
import type { Skill } from "@/lib/skill";
import { loadBuiltinSkills } from "@/lib/skill";

interface Props {
  /** 输入框当前文本（用于筛选） */
  query: string;
  /** 选中 Skill 后的回调（一般是插入到输入框） */
  onSelect: (skill: Skill) => void;
  /** 关闭 picker */
  onClose: () => void;
}

/**
 * / 命令面板：键盘上下选 + Enter 确认 + Esc 关闭
 * 显示 Skill 列表（按 query 过滤 name / triggers）
 */
export default function SkillPicker({ query, onSelect, onClose }: Props) {
  const all = loadBuiltinSkills();
  const filtered = all.filter((s) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.triggers.some((t) => t.toLowerCase().includes(q))
    );
  });
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
        setIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered.length > 0) {
        e.preventDefault();
        onSelect(filtered[idx]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, filtered, onSelect, onClose]);

  // 滚动到选中项
  useEffect(() => {
    const el = listRef.current?.children[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full left-0 mb-2 w-80 panel p-3 text-xs text-text-muted shadow-lg">
        没有匹配的 Skill
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 mb-2 w-96 max-h-80 overflow-y-auto panel shadow-lg"
    >
      <div className="px-3 py-1.5 text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
        Skill（按 ↑↓ 选择，Enter 确认，Esc 关闭）
      </div>
      {filtered.map((s, i) => (
        <button
          key={s.id}
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
      ))}
    </div>
  );
}
