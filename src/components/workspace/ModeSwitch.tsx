import { Image as ImageIcon, MessageSquare, Video, Wrench } from "lucide-react";

export type InputMode = "generate" | "chat" | "tools" | "video";

interface Props {
  mode: InputMode;
  onChange: (m: InputMode) => void;
  disabled?: boolean;
}

/**
 * 输入模式 / 视图 tab 切换：
 * - 对话：M2 Agent 路由（命中 Skill 后再生成）
 * - 生图：M1 直调即梦（基础生图 + 资产看板）
 * - 生视频：直接调 MiniMax H3（异步轮询，资产入库）
 * - 工具：高级能力工作台（批量组图 / 联网 / 去背 / 图层 / 局部编辑）
 */
export default function ModeSwitch({ mode, onChange, disabled }: Props) {
  const items: { id: InputMode; label: string; icon: typeof ImageIcon; title: string }[] = [
    {
      id: "chat",
      label: "对话",
      icon: MessageSquare,
      title: "和 Agent 对话（命中 Skill 后再生成）",
    },
    {
      id: "generate",
      label: "生图",
      icon: ImageIcon,
      title: "直接生图（不经过 Agent）",
    },
    {
      id: "video",
      label: "生视频",
      icon: Video,
      title: "直接生视频（MiniMax H3，不经过 Agent）",
    },
    {
      id: "tools",
      label: "工具",
      icon: Wrench,
      title: "高级能力：批量组图 / 联网 / 去背 / 图层 / 局部编辑",
    },
  ];
  return (
    <div className="inline-flex rounded-md border border-border bg-bg-panel p-0.5 text-xs">
      {items.map(({ id, label, icon: Icon, title }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          disabled={disabled}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
            mode === id
              ? "bg-bg-hover text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          title={title}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
