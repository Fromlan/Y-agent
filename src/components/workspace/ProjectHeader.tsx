import { ArrowLeft, Brain, Trash2 } from "lucide-react";

/**
 * ProjectHeader — ProjectDetail 顶部条(返回 / 项目名 / 资产数 / 记忆 / 清空对话)
 * (commit 13 抽自 ProjectDetail.tsx,纯结构性切片,不改行为/UI)
 *
 * 35 行 JSX,本身很小,抽组件 ROI 不高;但既然 12 步 refactor 链已把
 * ProjectDetail 从 67KB 缩到 33KB,这一步再压 35 行,顺手完成。
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
    <div className="min-h-12 py-2 flex items-center gap-3 px-4 border-b border-border bg-bg-panel flex-shrink-0 flex-wrap">
      <button onClick={onBack} className="btn-icon" title="返回项目库">
        <ArrowLeft className="w-4 h-4" />
      </button>
      <button
        onClick={onRename}
        className="flex-1 min-w-[200px] text-left group"
        title="点击重命名"
      >
        <div className="text-sm font-medium text-text-primary group-hover:text-accent truncate">
          {projectName}
        </div>
        <div className="text-[11px] text-text-muted">{assetCount} 个资产</div>
      </button>
      <button
        onClick={onOpenMemory}
        className="btn text-xs h-7 px-2.5"
        title="Agent 记忆（学到的画风偏好）"
      >
        <Brain className="w-3.5 h-3.5" />
        记忆
      </button>
      <button
        onClick={onClearHistory}
        className="btn text-xs h-7 px-2.5"
        title="清空对话历史"
      >
        <Trash2 className="w-3.5 h-3.5" />
        清空对话
      </button>
    </div>
  );
}
