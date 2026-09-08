/**
 * CommandPalette — 全局 ⌘K 命令面板
 *
 * 2026-09-08 (M-2 UX 优化)
 *
 * 设计:
 * - 全局监听 Ctrl/Cmd+K 打开,Esc 关闭
 * - fuzzy 搜索:项目 / Skill / 角色档案 / 全局命令
 * - 上下箭头 + Enter 选中
 * - 选项目 → setCurrentProject + onRoute("project")
 * - 选 Skill → 写 pendingSkill + 切到项目
 * - 命令("新建项目", "打开设置") 直接执行
 *
 * 数据获取:打开时一次性拉项目 + 角色档案(轻量,无需实时)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, FolderOpen, Settings, Plus, Wand2, Users, Hash } from "lucide-react";
import type { Project, CharacterArchive } from "@/lib/types";
import { listProjects } from "@/lib/projects";
import { listCharacterArchives } from "@/lib/character-archive";
import { loadBuiltinSkills, type Skill } from "@/lib/skill";
import { useSession } from "@/lib/session";

type CmdItem =
  | { kind: "command"; id: string; label: string; icon: typeof Plus; perform: () => void }
  | { kind: "project"; id: string; label: string; project: Project; perform: () => void }
  | { kind: "skill"; id: string; label: string; skill: Skill; perform: () => void }
  | { kind: "archive"; id: string; label: string; archive: CharacterArchive; perform: () => void };

interface Props {
  onRoute: (r: "projects" | "project" | "assets" | "skills") => void;
  onOpenSettings: () => void;
  /** 选 Skill → 写 pendingSkill + 切到项目 */
  onUseSkill: (skillId: string) => void;
}

export default function CommandPalette({ onRoute, onOpenSettings, onUseSkill }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CmdItem[]>([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { currentProject, setCurrentProject } = useSession();

  // 全局快捷键 Ctrl/Cmd+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 打开时:加载数据 + focus 输入框
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIdx(0);
    inputRef.current?.focus();
    (async () => {
      try {
        const [projects, archives] = await Promise.all([
          listProjects().catch(() => [] as Project[]),
          currentProject
            ? listCharacterArchives(currentProject.id).catch(() => [] as CharacterArchive[])
            : Promise.resolve([] as CharacterArchive[]),
        ]);
        const skills = loadBuiltinSkills();
        const built: CmdItem[] = [];

        // 命令
        built.push({
          kind: "command",
          id: "cmd:new-project",
          label: "新建项目",
          icon: Plus,
          perform: () => {
            setCurrentProject(null);
            onRoute("projects");
          },
        });
        built.push({
          kind: "command",
          id: "cmd:asset-center",
          label: "打开资产中心",
          icon: FolderOpen,
          perform: () => onRoute("assets"),
        });
        built.push({
          kind: "command",
          id: "cmd:skills",
          label: "打开 Skill 中心",
          icon: Wand2,
          perform: () => onRoute("skills"),
        });
        built.push({
          kind: "command",
          id: "cmd:settings",
          label: "打开设置",
          icon: Settings,
          perform: onOpenSettings,
        });
        if (currentProject) {
          built.push({
            kind: "command",
            id: "cmd:back-to-project",
            label: `返回项目「${currentProject.name}」`,
            icon: FolderOpen,
            perform: () => onRoute("project"),
          });
        }

        // 项目
        for (const p of projects) {
          built.push({
            kind: "project",
            id: `p:${p.id}`,
            label: p.name,
            project: p,
            perform: () => {
              setCurrentProject(p);
              onRoute("project");
            },
          });
        }

        // 角色档案
        for (const a of archives) {
          built.push({
            kind: "archive",
            id: `a:${a.id}`,
            label: `${a.name} (角色档案 · ${a.scope})`,
            archive: a,
            perform: () => {
              // 写 pending archive + 切到角色工坊
              try {
                localStorage.setItem(
                  "y-agent.pendingArchive",
                  JSON.stringify({ id: a.id, ts: Date.now() })
                );
              } catch {
                // ignore
              }
              if (!currentProject) {
                console.warn("CommandPalette: 请先进入一个项目");
                return;
              }
              onRoute("project");
            },
          });
        }

        // Skill
        for (const s of skills) {
          built.push({
            kind: "skill",
            id: `s:${s.id}`,
            label: `${s.name} (/${s.id})`,
            skill: s,
            perform: () => {
              if (currentProject) {
                onUseSkill(s.id);
              } else {
                console.warn("CommandPalette: 请先进入项目再用 Skill");
              }
            },
          });
        }

        setItems(built);
      } catch (e) {
        // ignore
      }
    })();
  }, [open, currentProject, onRoute, onOpenSettings, onUseSkill, setCurrentProject]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.label.toLowerCase().includes(q));
  }, [items, query]);

  // 键盘导航
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" && filtered.length > 0) {
        e.preventDefault();
        const it = filtered[Math.min(idx, filtered.length - 1)];
        if (it) {
          it.perform();
          setOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, idx]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="panel w-[560px] max-w-[95vw] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIdx(0);
            }}
            placeholder="搜项目 / Skill / 角色档案 / 命令..."
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-text-muted"
          />
          <kbd className="text-[10px] text-text-muted bg-bg-base px-1.5 py-0.5 rounded">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-text-muted">没有匹配项</div>
          ) : (
            <ul className="py-1">
              {filtered.map((it, i) => {
                const active = i === idx;
                const Icon =
                  it.kind === "command"
                    ? it.icon
                    : it.kind === "project"
                    ? FolderOpen
                    : it.kind === "skill"
                    ? Wand2
                    : Users;
                return (
                  <li key={it.id}>
                    <button
                      onMouseEnter={() => setIdx(i)}
                      onClick={() => {
                        it.perform();
                        setOpen(false);
                      }}
                      className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs ${
                        active
                          ? "bg-accent/15 text-accent"
                          : "text-text-secondary hover:bg-bg-hover"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.kind === "project" && (
                        <span className="text-[10px] text-text-muted tabular-nums">
                          {it.project.assetCount} 资产
                        </span>
                      )}
                      {it.kind === "skill" && (
                        <span className="text-[10px] text-text-muted font-mono">
                          /{it.skill.id}
                        </span>
                      )}
                      {it.kind === "archive" && (
                        <span className="text-[10px] text-text-muted">{it.archive.scope}</span>
                      )}
                      {it.kind === "command" && <Hash className="w-3 h-3 text-text-muted" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-muted flex items-center gap-3">
          <span>
            <kbd className="bg-bg-base px-1 rounded">↑↓</kbd> 移动
          </span>
          <span>
            <kbd className="bg-bg-base px-1 rounded">↵</kbd> 选中
          </span>
          <span className="ml-auto">⌘K 开关</span>
        </div>
      </div>
    </div>
  );
}
