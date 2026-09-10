import type { Asset } from "@/lib/types";
import type { ToolProgress } from "./runTool";
import { Sparkles } from "lucide-react";

export interface FormProps {
  projectId: string;
  /** 表单的 submit 包装：把闭包里的 runTool 逻辑 + onProgress 传给父组件的 runAndClose */
  onRun: (
    fn: (onProgress: (p: ToolProgress) => void) => Promise<Asset>
  ) => void;
  busy: boolean;
}

export interface ImageFormProps extends FormProps {
  assets: Asset[];
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[11px] text-text-muted mb-1 block">{label}</label>
      {children}
    </div>
  );
}

export function Submit({
  onClick,
  disabled,
  hint,
}: {
  onClick: () => void;
  disabled: boolean;
  hint?: string;
}) {
  return (
    <div className="pt-2 flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={disabled}
        className="btn btn-primary flex items-center gap-1"
      >
        <Sparkles className="w-3.5 h-3.5" /> 生成
      </button>
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </div>
  );
}
