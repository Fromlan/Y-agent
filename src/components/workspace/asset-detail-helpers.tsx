import { useState, useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/components/shared/Toast";

/**
 * MetaItem:资产详情中的元数据卡片(图标 + 标签 + 值,可选点击复制)
 * - 从 AssetDetailDialog 抽出来共享(2026-09-08 整体整理 commit 9)
 * - 不动行为 / UI / props 协议
 */
export function MetaItem({
  icon: Icon,
  label,
  value,
  copyable,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  copyable?: string;
}) {
  const toast = useToast();
  return (
    <div className="bg-bg-elev border border-border rounded-md p-2">
      <div className="flex items-center gap-1 text-[10px] text-text-muted mb-0.5">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
      <div
        className={`text-text-primary truncate ${copyable ? "cursor-pointer hover:text-accent" : ""}`}
        title={copyable ?? value}
        onClick={() => {
          if (!copyable) return;
          navigator.clipboard.writeText(copyable).then(
            () => toast.success(`已复制 ${label}`),
            () => toast.error("复制失败")
          );
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** 把 Unix ms 格式化为 "YYYY-MM-DD HH:mm:ss" */
export function formatDateTime(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 把 Unix ms 格式化为相对时间("X 秒前" / "X 天前" / 本地化日期) */
export function formatRelative(t: number): string {
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(t).toLocaleDateString("zh-CN");
}

/**
 * EditStage:局部编辑的画框舞台
 * - 显示原图 + 一个覆盖层
 * - 用户在覆盖层画矩形 → 记录图像素坐标 (bbox)
 * - 通过 onBboxChange callback 把 bbox 同步给父组件
 * - 从 AssetDetailDialog 抽出来共享(2026-09-08 整体整理 commit 9)
 */
export function EditStage({
  imageUrl,
  onBboxChange,
}: {
  imageUrl: string;
  onBboxChange: (
    bbox: { x1: number; y1: number; x2: number; y2: number } | null
  ) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [drawn, setDrawn] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  // bbox 变化时同步给父组件(包括清空)
  useEffect(() => {
    onBboxChange(drawn);
  }, [drawn, onBboxChange]);

  // 屏幕坐标 → 图像素坐标
  const screenToImage = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img || !naturalSize.w || !naturalSize.h) return null;
    const rect = img.getBoundingClientRect();
    // 点在图片外的部分直接丢弃
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null;
    }
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(naturalSize.w, Math.round(relX * naturalSize.w))),
      y: Math.max(0, Math.min(naturalSize.h, Math.round(relY * naturalSize.h))),
    };
  };

  const onDown = (e: React.MouseEvent) => {
    const pt = screenToImage(e.clientX, e.clientY);
    if (!pt) return;
    setDrag(pt);
    setDrawn({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const pt = screenToImage(e.clientX, e.clientY);
    if (!pt) return;
    setDrawn({ x1: drag.x, y1: drag.y, x2: pt.x, y2: pt.y });
  };
  const onUp = () => setDrag(null);

  return (
    <div
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      className="relative w-full max-w-[640px] aspect-[16/10] bg-bg-elev rounded-md overflow-hidden border border-border select-none cursor-crosshair"
      title="拖动鼠标在图上画一个矩形框"
    >
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        onLoad={(e) => {
          const t = e.currentTarget;
          setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight });
        }}
        className="w-full h-full object-contain pointer-events-none"
        draggable={false}
      />
      {drawn && (
        <div
          className="absolute border-2 border-accent bg-accent/15 pointer-events-none"
          style={{
            left: `${(Math.min(drawn.x1, drawn.x2) / Math.max(naturalSize.w, 1)) * 100}%`,
            top: `${(Math.min(drawn.y1, drawn.y2) / Math.max(naturalSize.h, 1)) * 100}%`,
            width: `${(Math.abs(drawn.x2 - drawn.x1) / Math.max(naturalSize.w, 1)) * 100}%`,
            height: `${(Math.abs(drawn.y2 - drawn.y1) / Math.max(naturalSize.h, 1)) * 100}%`,
          }}
        >
          <span className="absolute -top-6 left-0 bg-accent text-text-inverse text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
            bbox [{Math.min(drawn.x1, drawn.x2)}, {Math.min(drawn.y1, drawn.y2)}, {Math.max(drawn.x1, drawn.x2)}, {Math.max(drawn.y1, drawn.y2)}]
          </span>
        </div>
      )}
    </div>
  );
}
