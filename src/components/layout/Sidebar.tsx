import {
  FolderOpen,
  Image,
  Wand2,
  Settings,
  ChevronDown,
  FolderPlus,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { hasApiKey } from "@/lib/api-key";
import { useEffect, useRef, useState } from "react";
import { listProjects } from "@/lib/projects";
import type { Project } from "@/lib/types";

export type Route = "projects" | "project" | "assets" | "skills";

interface Props {
  route: Route;
  onRoute: (r: Route) => void;
  onOpenSettings: () => void;
}

interface NavItem {
  id: Route;
  label: string;
  icon: typeof FolderOpen;
}

const NAV: NavItem[] = [
  { id: "projects", label: "项目库", icon: FolderOpen },
  { id: "assets", label: "资产中心", icon: Image },
  { id: "skills", label: "Skill", icon: Wand2 },
];

export default function Sidebar({ route, onRoute, onOpenSettings }: Props) {
  const { currentProject, setCurrentProject } = useSession();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    hasApiKey()
      .then(setHasKey)
      .catch(() => setHasKey(false));
  }, []);

  // M-3: 当前项目下拉 — 列出最近 5 个 + "项目库…" 入口
  useEffect(() => {
    if (!projectMenuOpen) return;
    listProjects()
      .then((list) => {
        // 最近 5 个（按 updatedAt 倒序）+ 当前项目
        setAllProjects(
          list
            .filter((p) => p.id !== currentProject?.id)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 5)
        );
      })
      .catch(() => setAllProjects([]));
  }, [projectMenuOpen, currentProject?.id]);

  // 点外部关闭
  useEffect(() => {
    if (!projectMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProjectMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [projectMenuOpen]);

  const onSwitchProject = (p: Project) => {
    setCurrentProject(p);
    setProjectMenuOpen(false);
  };

  const onOpenProjectLibrary = () => {
    setCurrentProject(null);
    onRoute("projects");
    setProjectMenuOpen(false);
  };
  return (
    <aside className="w-56 flex-shrink-0 flex flex-col border-r border-border bg-bg-panel">
      <div className="h-12 flex items-center px-4 border-b border-border">
        <img
          src="/logo.svg"
          alt="Y-agent"
          className="w-7 h-7 mr-2"
        />
        <span className="font-semibold text-text-primary">Y-agent</span>
        {/* API Key 状态点（U-决议 A.2）：绿 = 已配置，红 = 未配置 */}
        <span
          className="ml-auto"
          title={hasKey ? "API Key 已配置" : "API Key 未配置"}
        >
          <span
            className={`block w-2 h-2 rounded-full ${
              hasKey === null
                ? "bg-text-muted/50"
                : hasKey
                ? "bg-accent-success"
                : "bg-status-danger"
            }`}
          />
        </span>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onRoute(id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm
              transition-colors
              ${route === id
                ? "bg-bg-hover text-text-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"}
            `}
          >
            <Icon className="w-4 h-4" />
            <span className="flex-1 text-left">{label}</span>
          </button>
        ))}

        {/* 当前项目：进入项目后高亮显示在导航底部。
            M-3: 点击展开下拉(最近 5 个 + 项目库入口),不用先"项目库"再点 */}
        {currentProject && (
          <div className="pt-3 mt-3 border-t border-border" ref={menuRef}>
            <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider">
              当前项目
            </div>
            <button
              onClick={() => {
                if (projectMenuOpen) {
                  setProjectMenuOpen(false);
                } else {
                  setProjectMenuOpen(true);
                  onRoute("project");
                }
              }}
              title={`返回项目 ${currentProject.name}（点击展开切换）`}
              className={`relative w-full flex items-center gap-2.5 pl-4 pr-2 py-2 rounded-md text-sm
                transition-colors
                ${route === "project"
                  ? "bg-bg-hover text-text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"}
              `}
            >
              {route === "project" && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
              )}
              <div className="w-4 h-4 rounded bg-accent/30 flex-shrink-0" />
              <span className="flex-1 text-left truncate">{currentProject.name}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-text-muted transition-transform flex-shrink-0 ${
                  projectMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {projectMenuOpen && (
              <div className="mt-1 mx-1 panel border border-border rounded shadow-lg overflow-hidden">
                {allProjects.length > 0 ? (
                  <ul className="max-h-60 overflow-y-auto">
                    {allProjects.map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => onSwitchProject(p)}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover flex items-center gap-2"
                          title={p.name}
                        >
                          <div className="w-3 h-3 rounded bg-accent/20 flex-shrink-0" />
                          <span className="flex-1 truncate text-text-primary">{p.name}</span>
                          <span className="text-[10px] text-text-muted tabular-nums">
                            {p.assetCount}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-3 py-2 text-[10px] text-text-muted">没有其他项目</div>
                )}
                <div className="border-t border-border">
                  <button
                    onClick={onOpenProjectLibrary}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover flex items-center gap-2 text-text-secondary"
                  >
                    <FolderPlus className="w-3 h-3" />
                    <span>项目库…</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="p-2 border-t border-border">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm
            text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>设置</span>
        </button>
      </div>
    </aside>
  );
}
