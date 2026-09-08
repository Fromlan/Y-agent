/**
 * ConfirmDelete — 紧凑的内联删除确认
 *
 * 设计目标：
 * - 取代"再点一次 hover 2.5s + toast.warn"的反人类模式
 * - 单击 trash → 旁边出现「确认删除 / 取消」一对按钮，5s 内不点确认则自动复原
 * - 不弹模态、不打断看板浏览
 * - 用 confirmDialog 走系统弹窗做兜底（按 shift 点击可强制走模态）
 *
 * 与原模式对比（AssetCard / CharacterArchiveEditor 都已替换）：
 * - 原:  1 点 trash → 变红 + toast 警告 → 2 再点 trash 才真删 (2.5s 内有效)
 * - 新:  1 点 trash → 旁边出 确认/取消 按钮 → 1 点确认才真删 (5s 内有效)
 */
import { useEffect, useRef, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import { confirmDialog } from "@/lib/dialog";

interface Props {
  /** 删除回调（不再需要二次确认） */
  onDelete: () => void;
  /** 删除对象的简短描述，用于弹窗兜底文案。例：「资产」/「档案『红发法师』」 */
  itemName?: string;
  /** 兜底弹窗的扩展文案（可选） */
  extraWarning?: string;
  /** trash 按钮的额外 class（用于放在不同父容器里调位置） */
  className?: string;
  /** trash 按钮的 title tooltip */
  title?: string;
  /** 用大尺寸按钮（详情页/编辑器用），默认紧凑（卡片用） */
  size?: "compact" | "regular";
}

const RESET_MS = 5000;

export default function ConfirmDelete({
  onDelete,
  itemName = "资产",
  extraWarning,
  className = "",
  title = "删除",
  size = "compact",
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const arm = () => {
    if (confirming) return;
    setConfirming(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setConfirming(false), RESET_MS);
  };

  const cancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirming(false);
  };

  const confirm = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirming(false);
    onDelete();
  };

  const trashBtnCls =
    size === "regular"
      ? "text-[10px] text-text-muted hover:text-red-400 flex items-center gap-0.5"
      : "p-1 rounded text-white bg-black/60 hover:bg-red-500/80";

  const trashIcon = size === "regular" ? "w-3 h-3" : "w-3 h-3";

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          arm();
        }}
        onContextMenu={async (e) => {
          // 右键 = 强制走模态确认（防止误点）
          e.preventDefault();
          e.stopPropagation();
          const ok = await confirmDialog(
            `确认删除${itemName}？${extraWarning ? "\n\n" + extraWarning : ""}此操作不可恢复。`,
            { kind: "warning", okLabel: "删除" }
          );
          if (ok) onDelete();
        }}
        className={`${trashBtnCls} ${className}`}
        title={title + "（右键用弹窗确认）"}
      >
        <Trash2 className={trashIcon} />
        {size === "regular" && <span>删除</span>}
      </button>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={confirm}
        className={
          size === "regular"
            ? "text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 flex items-center gap-0.5"
            : "p-1 rounded text-white bg-red-500/80 hover:bg-red-500"
        }
        title={`确认删除${itemName}`}
        autoFocus
      >
        <Check className={trashIcon} />
        {size === "regular" && <span>确认</span>}
      </button>
      <button
        type="button"
        onClick={cancel}
        className={
          size === "regular"
            ? "text-[10px] px-2 py-0.5 rounded text-text-secondary hover:text-text-primary flex items-center gap-0.5"
            : "p-1 rounded text-white bg-black/60 hover:bg-black/80"
        }
        title="取消"
      >
        <X className={trashIcon} />
        {size === "regular" && <span>取消</span>}
      </button>
    </div>
  );
}
