/**
 * 文本输入弹窗 Provider
 * - 替代 window.prompt：Tauri 没有原生带输入框的对话框
 * - 任何组件可以通过 usePrompt() 触发
 * - 一次只显示一个弹窗，串行 resolve
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export interface PromptOptions {
  title?: string;
  defaultValue?: string;
  placeholder?: string;
  okLabel?: string;
  cancelLabel?: string;
  /** 校验函数：返回 string = 错误信息（按钮禁用 + 提示）；返回 undefined = 通过 */
  validate?: (value: string) => string | undefined;
  /** 是否必填（默认 true）。false 时空字符串也允许提交 */
  required?: boolean;
}

interface PromptState extends Required<Omit<PromptOptions, "validate" | "defaultValue" | "placeholder">> {
  open: boolean;
  defaultValue: string;
  placeholder: string;
  validate?: (value: string) => string | undefined;
  resolve: (value: string | null) => void;
}

const EMPTY_STATE: PromptState = {
  open: false,
  title: "",
  defaultValue: "",
  placeholder: "",
  okLabel: "确定",
  cancelLabel: "取消",
  required: true,
  validate: undefined,
  resolve: () => {},
};

interface PromptContext {
  /**
   * 弹出输入框，等待用户确认或取消。
   * - 返回 string = 用户输入的值（可能为空字符串）
   * - 返回 null = 用户点了取消
   */
  prompt: (message: string, options?: PromptOptions) => Promise<string | null>;
}

const Ctx = createContext<PromptContext | null>(null);

export function usePrompt(): PromptContext["prompt"] {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePrompt must be used inside <PromptProvider>");
  return ctx.prompt;
}

export function PromptProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PromptState>(EMPTY_STATE);
  const [value, setValue] = useState("");
  const resolverRef = useRef<((v: string | null) => void) | null>(null);

  const prompt = useCallback<PromptContext["prompt"]>((message, options = {}) => {
    return new Promise<string | null>((resolve) => {
      // 串行化：先 cancel 之前的（让它 resolve(null)）
      if (resolverRef.current) resolverRef.current(null);
      resolverRef.current = resolve;
      setState({
        open: true,
        title: message,
        defaultValue: options.defaultValue ?? "",
        placeholder: options.placeholder ?? "",
        okLabel: options.okLabel ?? "确定",
        cancelLabel: options.cancelLabel ?? "取消",
        required: options.required ?? true,
        validate: options.validate,
        resolve,
      });
      setValue(options.defaultValue ?? "");
    });
  }, []);

  const close = (result: string | null) => {
    if (resolverRef.current) resolverRef.current(result);
    resolverRef.current = null;
    setState(EMPTY_STATE);
    setValue("");
  };

  const error = state.validate ? state.validate(value) : undefined;
  const isEmpty = value.trim().length === 0;
  const canSubmit = (state.required ? !isEmpty : true) && !error;

  return (
    <Ctx.Provider value={{ prompt }}>
      {children}
      {state.open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close(null);
          }}
        >
          <div className="panel max-w-sm w-full p-5">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-primary">{state.title}</h3>
              <button
                className="btn-icon"
                onClick={() => close(null)}
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              autoFocus
              type="text"
              value={value}
              placeholder={state.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) close(value);
                else if (e.key === "Escape") close(null);
              }}
              className="input w-full"
            />
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => close(null)}>
                {state.cancelLabel}
              </button>
              <button
                className="btn btn-primary"
                disabled={!canSubmit}
                onClick={() => close(value)}
              >
                {state.okLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
