import { createContext, useCallback, useContext, useMemo, useState, useRef, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, XCircle } from "lucide-react";

type Level = "success" | "error" | "warn" | "info";

interface Toast {
  id: number;
  level: Level;
  text: string;
}

interface ToastContextValue {
  success: (text: string) => void;
  error: (text: string) => void;
  warn: (text: string) => void;
  info: (text: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((level: Level, text: string) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, level, text }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  // M3.6 修:用 useMemo 锁住 value,避免所有 useToast() 消费者每次 render 都拿到
  // 新对象导致依赖它的 useEffect / useCallback 反复触发,造成 "Maximum update depth exceeded" 白屏。
  const value = useMemo<ToastContextValue>(
    () => ({
      success: (t) => push("success", t),
      error: (t) => push("error", t),
      warn: (t) => push("warn", t),
      info: (t) => push("info", t),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            className="panel px-3 py-2 flex items-center gap-2 text-sm pointer-events-auto
              animate-in fade-in slide-in-from-right-2"
          >
            {iconFor(t.level)}
            <span>{t.text}</span>
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
