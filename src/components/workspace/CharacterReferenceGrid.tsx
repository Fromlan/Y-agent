/**
 * M3 角色档案参考图网格
 *
 * 职责：
 * - 渲染 6 格网格（上限），每格显示缩略图 + 删除按钮
 * - "添加参考图"按钮 → 打开 AssetPicker 选单张图 → attach IPC
 * - 占位支持 HTML5 drop（dataTransfer.text = asset id）—— 后续可在 AssetCard 加 draggable
 * - 参考图被删除 / 资产不存在时灰态显示 + tooltip 提示
 */
import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import type { Asset, CharacterArchive } from "@/lib/types";
import { assetMainImage } from "@/lib/types";
import { CHARACTER_ARCHIVE_LIMITS, attachReferenceImage, detachReferenceImage } from "@/lib/character-archive";
import { useToast } from "@/components/shared/Toast";
import AssetPicker from "@/components/workspace/tools/AssetPicker";
import SafeImage from "@/components/shared/SafeImage";

interface Props {
  archive: CharacterArchive;
  /** 项目下所有资产（picker 用） */
  assets: Asset[];
  /** 资产更新回调：上传新 ref 后通知上层 reload */
  onChanged: () => void;
}

export default function CharacterReferenceGrid({
  archive,
  assets,
  onChanged,
}: Props) {
  const toast = useToast();
  const [showPicker, setShowPicker] = useState(false);
  const [dropHover, setDropHover] = useState(false);

  // 把 archive.referenceImageAssetIds 映射到 Asset 对象（找不到标灰）
  const refs = archive.referenceImageAssetIds.map((assetId) => {
    const a = assets.find((x) => x.id === assetId) ?? null;
    return { assetId, asset: a };
  });
  const remainingSlots = CHARACTER_ARCHIVE_LIMITS.MAX_REFERENCE_IMAGES - refs.length;

  const onPick = async (asset: Asset) => {
    if (refs.length >= CHARACTER_ARCHIVE_LIMITS.MAX_REFERENCE_IMAGES) {
      toast.error(`参考图最多 ${CHARACTER_ARCHIVE_LIMITS.MAX_REFERENCE_IMAGES} 张`);
      setShowPicker(false);
      return;
    }
    if (refs.some((r) => r.assetId === asset.id)) {
      toast.info("该图已在档案里");
      setShowPicker(false);
      return;
    }
    try {
      const n = await attachReferenceImage(archive.id, asset.id);
      toast.success(`已添加（${n}/${CHARACTER_ARCHIVE_LIMITS.MAX_REFERENCE_IMAGES}）`);
      setShowPicker(false);
      onChanged();
    } catch (e: any) {
      toast.error(`添加失败：${e?.message ?? e}`);
    }
  };

  const onRemove = async (assetId: string) => {
    try {
      const n = await detachReferenceImage(archive.id, assetId);
      toast.success(`已移除（剩余 ${n} 张）`);
      onChanged();
    } catch (e: any) {
      toast.error(`移除失败：${e?.message ?? e}`);
    }
  };

  // HTML5 drop 占位：dataTransfer.text 写 asset id
  // 完整功能要等 AssetCard 配 draggable=true + onDragStart
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropHover(true);
  };
  const onDragLeave = () => setDropHover(false);
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropHover(false);
    const assetId = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("asset-id");
    if (!assetId) {
      toast.info("拖放格式未识别，请用「添加参考图」按钮");
      return;
    }
    if (refs.some((r) => r.assetId === assetId)) {
      toast.info("该图已在档案里");
      return;
    }
    if (refs.length >= CHARACTER_ARCHIVE_LIMITS.MAX_REFERENCE_IMAGES) {
      toast.error(`参考图最多 ${CHARACTER_ARCHIVE_LIMITS.MAX_REFERENCE_IMAGES} 张`);
      return;
    }
    try {
      const n = await attachReferenceImage(archive.id, assetId);
      toast.success(`已添加（${n}/${CHARACTER_ARCHIVE_LIMITS.MAX_REFERENCE_IMAGES}）`);
      onChanged();
    } catch (e: any) {
      toast.error(`添加失败：${e?.message ?? e}`);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-medium text-text-secondary">
          参考图（资产库）
          <span className="ml-1 text-text-muted">
            {refs.length}/{CHARACTER_ARCHIVE_LIMITS.MAX_REFERENCE_IMAGES}
          </span>
        </label>
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          disabled={remainingSlots <= 0}
          className="text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded text-accent hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ImagePlus className="w-3 h-3" />
          添加参考图
        </button>
      </div>
      <div
        className={`grid grid-cols-3 gap-1.5 p-1.5 rounded border ${
          dropHover
            ? "border-accent bg-accent/5"
            : "border-border bg-bg-panel/50"
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {refs.map(({ assetId, asset }, idx) => {
          const main = asset ? assetMainImage(asset) : null;
          return (
            <div
              key={assetId}
              className="relative aspect-square bg-bg-elev rounded overflow-hidden group"
              title={
                asset
                  ? `参考图 #${idx + 1}\n${asset.prompt.slice(0, 80)}`
                  : `参考图 #${idx + 1}（资产已删除）`
              }
            >
              {main ? (
                <SafeImage
                  src={main}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-text-muted text-[10px]">
                  已删除
                </div>
              )}
              {/* 左上角：序号 */}
              <span className="absolute top-0.5 left-0.5 text-[9px] px-1 rounded bg-black/60 text-white">
                #{idx + 1}
              </span>
              {/* 右上角：删除 */}
              <button
                type="button"
                onClick={() => onRemove(assetId)}
                className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                title="从档案移除（不会删除资产本身）"
              >
                <X className="w-3 h-3" />
              </button>
              {/* 资产已删除时整体灰态 */}
              {!asset && (
                <div className="absolute inset-0 bg-red-500/20 pointer-events-none" />
              )}
            </div>
          );
        })}
        {/* 空槽位占位（用户感知上限） */}
        {Array.from({ length: remainingSlots }).map((_, idx) => (
          <div
            key={`empty-${idx}`}
            className="aspect-square rounded border border-dashed border-border/50 bg-transparent"
          />
        ))}
      </div>
      <p className="text-[10px] text-text-muted mt-1">
        从「资产」tab 拖入图片即可;或点「添加参考图」从列表里选。
      </p>

      {showPicker && (
        <AssetPicker
          assets={assets}
          onSelect={(asset) => void onPick(asset)}
          onClose={() => setShowPicker(false)}
          title={`选择参考图（剩余 ${remainingSlots} 个名额）`}
        />
      )}
    </div>
  );
}
