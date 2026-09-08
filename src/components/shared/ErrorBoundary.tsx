/**
 * 全局 React 错误边界(M3.6 加)。
 * 任何组件 render / lifecycle throw 都会被这里接住,把错误显式渲染在 UI 上,
 * 避免白屏 + 让没开 devtools 的用户也能看到红字堆栈,方便反馈问题。
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 同步 componentStack(react ErrorInfo.componentStack 是 string)
    this.setState({ componentStack: info.componentStack ?? null });
    // 仍然往控制台打一份(开 devtools 时可见)
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] caught:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { error, componentStack } = this.state;
    return (
      <div className="flex h-full w-full items-start justify-center overflow-y-auto bg-bg-base p-8 text-text-primary">
        <div className="max-w-3xl w-full">
          <div className="flex items-center gap-2 mb-3 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <h2 className="text-base font-semibold">界面渲染出错了</h2>
          </div>
          <p className="text-xs text-text-muted mb-4">
            M3.6 加的 ErrorBoundary 兜底 — 下面这段红字复制给开发者 / 反馈 issue 用。
          </p>
          <div className="rounded border border-red-500/40 bg-red-500/5 p-3 mb-3">
            <div className="text-[11px] font-mono text-red-300 whitespace-pre-wrap break-words">
              {error.name}: {error.message}
            </div>
          </div>
          {error.stack && (
            <details className="rounded border border-border bg-bg-panel p-3 mb-3" open>
              <summary className="text-[11px] font-medium text-text-secondary cursor-pointer">
                错误堆栈 (Stack)
              </summary>
              <pre className="mt-2 text-[10px] font-mono text-text-secondary whitespace-pre-wrap break-all">
                {error.stack}
              </pre>
            </details>
          )}
          {componentStack && (
            <details className="rounded border border-border bg-bg-panel p-3">
              <summary className="text-[11px] font-medium text-text-secondary cursor-pointer">
                组件堆栈 (Component stack)
              </summary>
              <pre className="mt-2 text-[10px] font-mono text-text-secondary whitespace-pre-wrap break-all">
                {componentStack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
