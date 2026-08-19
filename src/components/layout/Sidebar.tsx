import {
  Sparkles,
  FolderOpen,
  Image,
  Wand2,
  Settings,
} from "lucide-react";
import { useSession } from "@/lib/session";

export type Route = "projects" | "project" | "assets" | "skills";

interface Props {
  route: Route;
  onRoute: (r: Route) => void;
  onOpenSettings: () => void;
}

interface NavItem {
  id: Route;
  label: string;
  icon: typeof Sparkles;
  soon?: boolean;
}

const NAV: NavItem[] = [
  { id: "projects", label: "项目库", icon: FolderOpen },
  { id: "assets", label: "资产中心", icon: Image, soon: true },
  { id: "skills", label: "Skill", icon: Wand2, soon: true },
];

export default function Sidebar({ route, onRoute, onOpenSettings }: Props) {
  const { currentProject } = useSession();
  return (
    <aside className="w-56 flex-shrink-0 flex flex-col border-r border-border bg-bg-panel">
      <div className="h-12 flex items-center px-4 border-b border-border">
        <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center mr-2">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-text-primary">Y-agent</span>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon, soon }) => (
          <button
            key={id}
            disabled={soon}
            onClick={() => !soon && onRoute(id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm
              transition-colors
              ${route === id
                ? "bg-bg-hover text-text-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"}
              ${soon ? "opacity-40 cursor-not-allowed" : ""}
            `}
          >
            <Icon className="w-4 h-4" />
            <span className="flex-1 text-left">{label}</span>
            {soon && <span className="text-[10px] text-text-muted">即将</span>}
          </button>
        ))}

        {/* 当前项目：进入项目后高亮显示在导航底部 */}
        {currentProject && (
          <div className="pt-3 mt-3 border-t border-border">
            <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider">
              当前项目
            </div>
            <button
              onClick={() => onRoute("project")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm
                transition-colors
                ${route === "project"
                  ? "bg-bg-hover text-text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"}
              `}
            >
              <div className="w-4 h-4 rounded bg-accent/30 flex-shrink-0" />
              <span className="flex-1 text-left truncate">{currentProject.name}</span>
            </button>
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
