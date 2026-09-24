/**
 * Skeleton — 通用骨架屏
 *
 * 设计原则：
 * - 全部走 token(--bg-elev / --bg-hover)，4 主题自适应
 * - 不写死颜色，用 color-mix 做 shimmer
 * - 提供 4 种预设：条 / 块 / 圆形 / 网格
 */
import type { CSSProperties } from "react";

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

/** 单条 placeholder（默认占满父容器，高 12px） */
export function Skeleton({ className = "", style }: SkeletonProps) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />;
}

/** 文本行 placeholder（默认 3 行） */
export function SkeletonLines({
  rows = 3,
  lastWidth = "70%",
}: {
  rows?: number;
  lastWidth?: string;
}) {
  const items = Array.from({ length: rows }, (_, i) => i);
  return (
    <div className="space-y-2" aria-hidden>
      {items.map((i) => (
        <div
          key={i}
          className="skeleton h-3"
          style={{
            width: i === rows - 1 ? lastWidth : "100%",
          }}
        />
      ))}
    </div>
  );
}

/** 卡片占位：1 个大块 + 2 行小字 */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`panel p-3 space-y-2 ${className}`}
      aria-hidden
    >
      <div className="skeleton aspect-square w-full rounded-md" />
      <div className="skeleton h-3 w-3/4 rounded" />
      <div className="skeleton h-2.5 w-1/2 rounded" />
    </div>
  );
}

/** 资产网格骨架（默认 2x4 = 8 张） */
export function SkeletonGrid({
  count = 8,
  columns = "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
}: {
  count?: number;
  columns?: string;
}) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <div className={`grid gap-2 ${columns}`} aria-hidden>
      {items.map((i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** 圆形头像 / icon 占位 */
export function SkeletonAvatar({ size = 32 }: { size?: number }) {
  return (
    <div
      className="skeleton rounded-full"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

/** 面板骨架（用于 ProjectDetail / SettingsPanel 等） */
export function SkeletonPanel({
  rows = 4,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  const items = Array.from({ length: rows }, (_, i) => i);
  return (
    <div
      className={`panel p-4 space-y-3 anim-fade-in ${className}`}
      aria-hidden
    >
      {items.map((i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonAvatar size={28} />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-2.5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
