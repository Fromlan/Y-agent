import type { ToolProgress } from "./runTool";

/**
 * 进度条：在 ToolModal 底部展示当前阶段 + 文本 + 进度条（流式 partial 时）
 */
export function ProgressBar({ progress }: { progress: ToolProgress }) {
  const { phase, message, partialCount, totalCount } = progress;
  const showBar = typeof totalCount === "number" && totalCount > 0;
  const pct = showBar
    ? Math.min(100, Math.round(((partialCount ?? 0) / (totalCount as number)) * 100))
    : 0;

  const color =
    phase === "error"
      ? "var(--status-error)"
      : phase === "done"
      ? "var(--status-success, var(--accent))"
      : "var(--accent)";

  return (
    <div className="border-t border-border p-3 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{message}</span>
        {showBar && (
          <span className="text-text-muted font-mono">
            {partialCount}/{totalCount}
          </span>
        )}
      </div>
      <div className="h-1 rounded-full bg-bg-panel overflow-hidden">
        <div
          className="h-full transition-all"
          style={{
            width: showBar ? `${pct}%` : phase === "done" || phase === "error" ? "100%" : "30%",
            backgroundColor: color,
            transition:
              phase === "downloading" && !showBar
                ? "width 1.2s ease-in-out infinite"
                : "width 200ms ease-out",
          }}
        />
      </div>
    </div>
  );
}
