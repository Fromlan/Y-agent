/**
 * EmptyState — 统一空态组件
 *
 * 替代散落的"还没有 xxx"提示，强制一个更具视觉重心的版式：
 * - 顶部 illustration（CSS-only，三层 staggered 矩形 + 中心点缀）
 * - 主标题（text-base font-semibold）
 * - 副标题（text-xs text-text-secondary，最多 2 行）
 * - 可选 CTA 按钮（accent 强调）
 *
 * 走 token，4 主题自适应；无新依赖。
 */
import type { ReactNode } from "react";
import { ImageIcon } from "lucide-react";

interface EmptyStateProps {
  /** 可选 icon 替代默认的 CSS illustration（"image" / "folder" / "search" / "wand"） */
  variant?: "image" | "folder" | "search" | "wand" | "sparkles" | "users";
  title: string;
  subtitle?: string;
  /** 主 CTA */
  action?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
    primary?: boolean;
  };
  /** 副 CTA（不强调） */
  secondary?: {
    label: string;
    onClick: () => void;
  };
  /** 是否高对比（重要空态，如全空应用） */
  emphasis?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function EmptyState({
  variant = "image",
  title,
  subtitle,
  action,
  secondary,
  emphasis = false,
  className = "",
  style,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 py-10 anim-fade-up ${className}`}
      style={style}
    >
      <Illustration variant={variant} emphasis={emphasis} />
      <h2
        className={`font-semibold mt-5 ${
          emphasis ? "text-lg" : "text-base"
        } text-text-primary`}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-xs text-text-muted mt-1.5 leading-relaxed max-w-sm">
          {subtitle}
        </p>
      )}
      {(action || secondary) && (
        <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className={`btn ${action.primary ? "btn-primary" : ""} anim-press`}
            >
              {action.icon}
              {action.label}
            </button>
          )}
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="btn text-text-secondary hover:text-text-primary"
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * CSS-only 空态 illustration
 * 三层错位圆角矩形 + 中心点缀，全部走 token；
 * 不引入 SVG / 图片资源，4 主题肉眼一致。
 */
function Illustration({
  variant,
  emphasis,
}: {
  variant: EmptyStateProps["variant"];
  emphasis?: boolean;
}) {
  const size = emphasis ? 112 : 88;
  // 不同 variant 用不同中心点缀
  const Center = () => {
    if (variant === "search") {
      return (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-muted"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    }
    if (variant === "folder") {
      return (
        <ImageIcon className="w-5 h-5 text-text-muted" aria-hidden />
      );
    }
    if (variant === "wand") {
      return (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent"
        >
          <path d="m15 4 6 6" />
          <path d="M19 14v6" />
          <path d="M22 17h-6" />
          <path d="M9 4 3 10l3 3 6-6Z" />
        </svg>
      );
    }
    if (variant === "users") {
      return (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    }
    if (variant === "sparkles") {
      return (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent"
        >
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        </svg>
      );
    }
    return <ImageIcon className="w-5 h-5 text-text-muted" aria-hidden />;
  };

  return (
    <div
      className="relative anim-fade-up"
      style={{
        width: size,
        height: size,
      }}
      aria-hidden
    >
      {/* 底层最大矩形 */}
      <div
        className="absolute rounded-md border border-border bg-bg-elev"
        style={{
          inset: 0,
          transform: "rotate(-6deg)",
          opacity: 0.55,
        }}
      />
      {/* 中间矩形 */}
      <div
        className="absolute rounded-md border border-border bg-bg-panel"
        style={{
          inset: "12% 8%",
          transform: "rotate(4deg)",
          opacity: 0.85,
        }}
      />
      {/* 顶层小矩形 + 中心点缀 */}
      <div
        className="absolute rounded-md border border-border-strong bg-bg-panel elev-md"
        style={{
          inset: "24% 18%",
          transform: "rotate(-2deg)",
        }}
      >
        <div className="w-full h-full flex items-center justify-center">
          <Center />
        </div>
      </div>
    </div>
  );
}
