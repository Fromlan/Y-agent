import {
  MessageSquare,
  Image as ImageIcon,
  Layers,
  Users,
  Wrench,
  Video,
} from "lucide-react";

export type ProjectTab =
  | "chat"
  | "generate"
  | "video"
  | "assets"
  | "characters"
  | "tools";

interface Props {
  active: ProjectTab;
  onChange: (t: ProjectTab) => void;
  /** 资产数(给 "资产" tab 旁加角标) */
  assetCount?: number;
}

/**
 * 项目内主导航(6 项,统一入口)。
 *
 * 替代原来的双层导航(ProjectTabs + ModeSwitch):
 * - 对话:Agent 对话模式
 * - 生图:直调即梦(底部显示 PromptBar 生成按钮)
 * - 生视频:直接调 MiniMax H3(底部显示 VideoPromptBar)
 * - 资产:仅资产库,无输入区
 * - 工具:高级能力工作台
 * - 角色:M3 角色工坊
 */
export default function ProjectTabs({ active, onChange, assetCount }: Props) {
  const items: {
    id: ProjectTab;
    label: string;
    icon: typeof MessageSquare;
  }[] = [
    { id: "chat", label: "对话", icon: MessageSquare },
    { id: "generate", label: "生图", icon: ImageIcon },
    { id: "video", label: "生视频", icon: Video },
    { id: "assets", label: "资产", icon: Layers },
    { id: "characters", label: "角色", icon: Users },
    { id: "tools", label: "工具", icon: Wrench },
  ];
  return (
    <nav
      className="h-10 flex items-center gap-1 px-3 border-b border-border bg-bg-panel flex-shrink-0 overflow-x-auto"
      role="tablist"
      aria-label="项目内 tab"
    >
      {items.map(({ id, label, icon: Icon }) => {
        const on = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            role="tab"
            aria-selected={on}
            className={`relative inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs
              transition-colors duration-150 flex-shrink-0
              ${
                on
                  ? "text-text-primary"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-hover/40"
              }
            `}
            title={label}
          >
            <Icon
              className={`w-3.5 h-3.5 transition-colors ${
                on ? "text-accent" : ""
              }`}
            />
            <span>{label}</span>
            {id === "assets" && assetCount !== undefined && assetCount > 0 && (
              <span className="ml-0.5 text-[10px] text-text-muted tabular-nums">
                {assetCount}
              </span>
            )}
            {/* active 底部 2px accent 滑入指示条 */}
            {on && (
              <span
                className="absolute left-2 right-2 -bottom-[5px] h-0.5 rounded-full bg-accent anim-fade-in"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
