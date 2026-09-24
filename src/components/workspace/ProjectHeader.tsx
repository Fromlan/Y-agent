import { ArrowLeft, Brain, Trash2 } from "lucide-react";

/**
 * ProjectHeader — ProjectDetail 顶部条(返回 / 项目名 / 资产数 / 记忆 / 清空对话)
 *
 * F3：高度 48 → 56px；标题 text-base font-semibold；
 * 按钮组加 anim-press + hover bg-bg-elev/80；底部 1px subtle shadow。
 */
export default function ProjectHeader({
  projectName,
  assetCount,
  onBack,
  onRename,
  onOpenMemory,
  onClearHistory,
}: {
  projectName: string;
  assetCount: number;
  onBack: () => void;
  onRename: () => void;
  onOpenMemory: () => void;
  onClearHistory: () => void;
}) {
  return (
    <div
      className="min-h-14 py-2.5 flex items-center gap-3 px-4 border-b border-border bg-bg-panel flex-shrink-0 flex-wrap
        shadow-[0_1px_0_0_var(--border)]"
    >
      <button
        onClick={onBack}
        className="btn-icon anim-press"
        title="返回项目库"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      <button
        onClick={onRename}
        className="flex-1 min-w-[200px] text-left group"
        title="点击重命名"
      >
        <div className="text-base font-semibold text-text-primary group-hover:text-accent truncate transition-colors">
          {projectName}
        </div>
        <div className="text-[11px] text-text-muted tabular-nums mt-0.5">
          {assetCount} 个资产
        </div>
      </button>
      <button
        onClick={onOpenMemory}
        className="btn text-xs h-8 px-3 anim-press transition-colors"
        title="Agent 记忆（学到的画风偏好）"
      >
        <Brain className="w-3.5 h-3.5" />
        记忆
      </button>
      <button
        onClick={onClearHistory}
        className="btn text-xs h-8 px-3 anim-press transition-colors"
        title="清空对话历史"
      >
        <Trash2 className="w-3.5 h-3.5" />
        清空对话
      </button>
    </div>
  );
}
