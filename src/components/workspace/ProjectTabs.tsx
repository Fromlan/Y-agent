import { MessageSquare, Image as ImageIcon, Users, Wrench, Video } from "lucide-react";

export type ProjectTab = "chat" | "assets" | "characters" | "tools";

interface Props {
  active: ProjectTab;
  onChange: (t: ProjectTab) => void;
  /** 资产数(给 "资产" tab 旁加角标) */
  assetCount?: number;
}

/**
 * M-1 项目内二级 nav(4 个 tab):对话/资产/角色/工具
 * 替代原 ModeSwitch 中"工具/角色"两个 tab(它们被挪到这里)
 * 工具栏放在 header 下方,横排 icon + label,小屏可换行
 */
export default function ProjectTabs({ active, onChange, assetCount }: Props) {
  const items: {
    id: ProjectTab;
    label: string;
    icon: typeof MessageSquare;
  }[] = [
    { id: "chat", label: "对话", icon: MessageSquare },
    { id: "assets", label: "资产", icon: ImageIcon },
    { id: "characters", label: "角色", icon: Users },
    { id: "tools", label: "工具", icon: Wrench },
  ];
  return (
    <nav className="h-10 flex items-center gap-1 px-3 border-b border-border bg-bg-panel flex-shrink-0 overflow-x-auto">
      {items.map(({ id, label, icon: Icon }) => {
        const on = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`relative inline-flex items-center gap-1.5 px-3 h-7 rounded-md text-xs transition-colors flex-shrink-0 ${
              on
                ? "bg-bg-hover text-text-primary"
                : "text-text-muted hover:text-text-primary hover:bg-bg-hover"
            }`}
            aria-pressed={on}
            title={label}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
            {id === "assets" && assetCount !== undefined && assetCount > 0 && (
              <span className="ml-0.5 text-[10px] text-text-muted tabular-nums">
                {assetCount}
              </span>
            )}
            {on && (
              <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </button>
        );
      })}
      {/* 占位:生视频 tab 不在 nav 里,在输入区切换。给个提示 */}
      <div className="flex-1" />
      <span className="text-[10px] text-text-muted hidden md:inline">
        <Video className="w-3 h-3 inline mr-0.5 align-text-bottom" />
        生视频在输入区切换
      </span>
    </nav>
  );
}
