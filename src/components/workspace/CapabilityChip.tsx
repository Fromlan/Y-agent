/**
 * CapabilityChip — 能力位开关的紧凑 chip 形式
 *
 * F4：hover lift -1px + shadow-sm / active 边框变 accent
 */
import type { ReactNode } from "react";

export interface CapabilityChipProps {
  /** chip 上的图标 */
  icon: ReactNode;
  /** 短标签(1-3 字) */
  label: string;
  /** 完整 title(tooltip) */
  title: string;
  /** 当前激活 */
  active?: boolean;
  /** 不可用(灰掉) */
  disabled?: boolean;
  onClick: () => void;
  /** 右侧附加内容(例:数量数字 / 选中值) */
  suffix?: ReactNode;
}

export function CapabilityChip({
  icon,
  label,
  title,
  active,
  disabled,
  onClick,
  suffix,
}: CapabilityChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`group inline-flex items-center gap-1 px-1.5 h-6 rounded text-[11px] transition-all duration-150
        ${
          active
            ? "bg-accent/15 text-accent border border-accent/40 shadow-sm"
            : "text-text-secondary hover:text-text-primary border border-border hover:border-border-strong hover:-translate-y-px hover:shadow-sm"
        }
        ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <span className="w-3 h-3 inline-flex items-center justify-center">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
      {suffix && <span className="text-[10px] opacity-80">{suffix}</span>}
    </button>
  );
}

/** 数量选择的 button-group(替代 number input) */
export function QuantityGroup({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  // 固定 1 / 2 / 4 / 8,加 max
  const presets = [1, 2, 4, 8].filter((n) => n <= max);
  if (max > 8 && !presets.includes(max)) presets.push(max);
  return (
    <div className="inline-flex items-center gap-0.5 panel p-0.5 inset-top-highlight">
      {presets.map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`min-w-[24px] h-5 px-1 rounded text-[11px] tabular-nums transition-all duration-150 ${
              active
                ? "bg-accent text-text-inverse shadow-sm"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-hover/60"
            }`}
            title={n === 1 ? "单图" : `生成 ${n} 张`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
