import { createContext, useCallback, useContext, useMemo, useState, useRef, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, XCircle, X } from "lucide-react";

type Level = "success" | "error" | "warn" | "info";

interface Toast {
  id: number;
  level: Level;
  text: string;
  /** A-2: 错误级别自动不自动消失(error 默认 persist) */
  persistent?: boolean;
  /** A-2: 操作按钮(例:重试) */
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  success: (text: string) => void;
  error: (text: string, opts?: { action?: { label: string; onClick: () => void }; persistent?: boolean }) => void;
  warn: (text: string) => void;
  info: (text: string) => void;
  /** A-2: 显式 dismiss 某条 */
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const DEFAULT_DURATION_MS = 3500;
const ERROR_PERSISTENT = true; // A-2: error 默认持久

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (level: Level, text: string, opts?: { action?: { label: string; onClick: () => void }; persistent?: boolean }) => {
      const id = ++idRef.current;
      const persistent =
        opts?.persistent ?? (level === "error" ? ERROR_PERSISTENT : false);
      setItems((prev) => [...prev, { id, level, text, persistent, action: opts?.action }]);
      if (!persistent) {
        const timer = setTimeout(() => {
          timersRef.current.delete(id);
          setItems((prev) => prev.filter((x) => x.id !== id));
        }, DEFAULT_DURATION_MS);
        timersRef.current.set(id, timer);
      }
    },
    [],
  );

  // M3.6 修:用 useMemo 锁住 value,避免所有 useToast() 消费者每次 render 都拿到
  // 新对象导致依赖它的 useEffect / useCallback 反复触发,造成 "Maximum update depth exceeded" 白屏。
  const value = useMemo<ToastContextValue>(
    () => ({
      success: (t) => push("success", t),
      error: (t, opts) => push("error", t, opts),
      warn: (t) => push("warn", t),
      info: (t) => push("info", t),
      dismiss,
    }),
    [push, dismiss],
  );

  // 卸载时清所有 timer
  // (Provider 不会卸载,这里只是防御性)
  // useEffect(() => () => {
  //   timersRef.current.forEach(clearTimeout);
  //   timersRef.current.clear();
  // }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none max-w-[420px]">
        {items.map((t) => (
          <div
            key={t.id}
            className="panel px-3 py-2 flex items-center gap-2 text-sm pointer-events-auto
              animate-in fade-in slide-in-from-right-2"
            style={{
              borderColor:
                t.level === "error"
                  ? "color-mix(in srgb, var(--status-danger) 35%, transparent)"
                  : undefined,
            }}
          >
            {iconFor(t.level)}
            <span className="flex-1 break-words">{t.text}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className="text-[11px] font-medium text-accent hover:underline flex-shrink-0"
              >
                {t.action.label}
              </button>
            )}
            {t.persistent && (
              <button
                onClick={() => dismiss(t.id)}
                className="text-text-muted hover:text-text-primary flex-shrink-0"
                title="关闭"
                aria-label="关闭"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function iconFor(level: Level) {
  const cls = "w-4 h-4 flex-shrink-0";
  switch (level) {
    case "success":
      return <CheckCircle2 className={`${cls} text-accent-success`} />;
    case "error":
      return <XCircle className={`${cls} text-accent-danger`} />;
    case "warn":
      return <AlertCircle className={`${cls} text-accent-warn`} />;
    case "info":
      return <Info className={`${cls} text-accent`} />;
  }
}
