import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Bar 共享 UI 原子 —— 给 PromptBar（生图 / 对话）和 VideoPromptBar（生视频）共用
 * 目标：单行工具栏、紧凑控件、统一视觉骨架
 *
 * 设计约束：
 * - 所有高度约束走 token，不写死 px
 * - 所有颜色走 token，4 主题自适应
 * - ParamCell 高度 ~28px（与 .btn-icon 一致），整行工具栏目标 ≤ 40px
 */

// ---------------------------------------------------------------------------
// ParamCell · 横排 label + control
// ---------------------------------------------------------------------------

export interface ParamCellProps {
  /** 字段名（10-11px 灰色） */
  label?: ReactNode;
  /** 控件（input / select / checkbox 等） */
  children: ReactNode;
  /** 整组加 title，hover 显示提示 */
  title?: string;
  /** 整组禁用（控件本身 + 视觉灰） */
  disabled?: boolean;
  /** 视觉紧凑：去掉 label 上下内边距，控件独占高度 */
  bare?: boolean;
}

/**
 * 横排 label+control 单元。默认 28px 高，与 .btn-icon 对齐。
 * 取代旧的 `Field`（label 在上 ~64-80px 高），节省 50%+ 垂直空间。
 */
export function ParamCell({ label, children, title, disabled, bare }: ParamCellProps) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 h-7 ${
        disabled ? "opacity-50" : ""
      }`}
      title={title}
    >
      {label && (
        <span className="text-[11px] text-text-muted whitespace-nowrap select-none">
          {label}
        </span>
      )}
      <div className={`flex items-center ${bare ? "" : ""}`}>{children}</div>
    </div>
  );
}

/**
 * ParamCell 的纯控件版（不传 label 时用），用于工具栏最右的纯按钮/控件。
 */
export function ControlCell({
  children,
  title,
  disabled,
}: {
  children: ReactNode;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center h-7 ${disabled ? "opacity-50" : ""}`}
      title={title}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolbarDivider · 视觉子组分隔
// ---------------------------------------------------------------------------

/** 1px 细分隔线，1.5 间距，比字符 `|` 更干净 */
export function ToolbarDivider() {
  return <span aria-hidden className="inline-block w-px h-5 bg-border mx-1.5 flex-shrink-0" />;
}

// ---------------------------------------------------------------------------
// ScenarioChip · 场景指示
// ---------------------------------------------------------------------------

export type ScenarioTone = "muted" | "active" | "danger";

export interface ScenarioChipProps {
  /** 场景标签文案 */
  label: string;
  /** 圆点 + 边框色调（muted=默认 / active=已生效 / danger=冲突） */
  tone?: ScenarioTone;
  /** 可选尾注（如冲突时的补救提示） */
  hint?: string;
}

const TONE_DOT: Record<ScenarioTone, string> = {
  muted: "bg-text-muted",
  active: "bg-accent",
  danger: "bg-accent-danger",
};

/**
 * 紧凑场景指示器，替代旧的 11px 灰色文字。
 * 例：「文生视频」「图生视频（首/尾帧）」「多模态参考生视频」「场景冲突：…」
 */
export function ScenarioChip({ label, tone = "muted", hint }: ScenarioChipProps) {
  return (
    <div className="inline-flex items-center gap-1.5 text-[11px]">
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-border bg-bg-elev ${
          tone === "active"
            ? "text-accent"
            : tone === "danger"
            ? "text-accent-danger"
            : "text-text-secondary"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`} />
        <span>当前场景：{label}</span>
      </span>
      {hint && <span className="text-text-muted">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CompactButton · 防 wrap 的 32×32 素材按钮
// ---------------------------------------------------------------------------

export interface CompactButtonProps {
  title: string;
  onClick: () => void;
  /** 强调状态：有内容时高亮 */
  active?: boolean;
  children: ReactNode;
}

/**
 * 包装 .btn-icon，加 whitespace-nowrap 防止「首帧」「尾帧」这种
 * 2 字标签在窄按钮里被强制断行（旧的「首\n帧」bug）。
 */
export function CompactButton({ title, onClick, active, children }: CompactButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`btn-icon whitespace-nowrap ${
        active
          ? "border border-accent text-accent bg-accent/10"
          : ""
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// useAutoResizeTextarea · textarea 按内容自动撑高
// ---------------------------------------------------------------------------

/**
 * textarea 按内容自适应行高（1-6 行），超出后内部滚动。
 * 用 useLayoutEffect 在 paint 前同步调整高度，避免抖动。
 */
export function useAutoResizeTextarea(
  value: string,
  opts: { minRows?: number; maxRows?: number } = {}
) {
  const { minRows = 1, maxRows = 6 } = opts;
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 重置高度让 scrollHeight 准确反映内容
    el.style.height = "auto";
    // 14px text-sm × 1.4 line-height ≈ 20px
    const lineH = 20;
    const minH = lineH * minRows;
    const maxH = lineH * maxRows;
    const targetH = Math.min(Math.max(el.scrollHeight, minH), maxH);
    el.style.height = `${targetH}px`;
    el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
  }, [value, minRows, maxRows]);

  return ref;
}
