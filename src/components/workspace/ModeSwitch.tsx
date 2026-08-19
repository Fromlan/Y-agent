import { Image as ImageIcon, MessageSquare } from "lucide-react";

export type InputMode = "generate" | "chat";

interface Props {
  mode: InputMode;
  onChange: (m: InputMode) => void;
  disabled?: boolean;
}

/**
 * 输入模式开关：生图 (M1 直调) / 对话 (Agent 路由)
 * - 默认 = 对话
 * - 切换不影响已有的聊天流
 */
export default function ModeSwitch({ mode, onChange, disabled }: Props) {
  return (
    <div className="inline-flex rounded-md border border-border bg-bg-panel p-0.5 text-xs">
      <button
        onClick={() => onChange("generate")}
        disabled={disabled}
        className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
          mode === "generate"
            ? "bg-bg-hover text-text-primary"
            : "text-text-muted hover:text-text-secondary"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        title="直接生图（不经过 Agent）"
      >
        <ImageIcon className="w-3.5 h-3.5" />
        生图
      </button>
      <button
        onClick={() => onChange("chat")}
        disabled={disabled}
        className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
          mode === "chat"
            ? "bg-bg-hover text-text-primary"
            : "text-text-muted hover:text-text-secondary"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        title="和 Agent 对话（命中 Skill 后再生成）"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        对话
      </button>
    </div>
  );
}
