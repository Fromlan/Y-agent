import {
  FolderOpen,
  Image,
  Wand2,
  Settings,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { hasApiKey } from "@/lib/api-key";
import { useEffect, useState } from "react";

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
  const { currentProject } = useSession();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  useEffect(() => {
    hasApiKey()
      .then(setHasKey)
      .catch(() => setHasKey(false));
  }, []);
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
            整块都可点击，hover 时左边加 accent bar 提示"返回项目"。 */}
        {currentProject && (
          <div className="pt-3 mt-3 border-t border-border">
            <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider">
              当前项目
            </div>
            <button
              onClick={() => onRoute("project")}
              title={`返回项目 ${currentProject.name}`}
              className={`relative w-full flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-md text-sm
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
