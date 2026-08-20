import { useEffect, useState } from "react";
import { X, Image as ImageIcon } from "lucide-react";
import type { Asset } from "@/lib/types";
import { assetMainImage } from "@/lib/types";
import { resolveImageUrl } from "@/lib/image-resolver";
import { useToast } from "@/components/shared/Toast";
import SafeImage from "@/components/shared/SafeImage";

interface Props {
  assets: Asset[];
  onSelect: (asset: Asset, sourceUrl: string) => void;
  onClose: () => void;
  /** 弹窗标题 */
  title?: string;
}

/**
 * 共享"从资产库选一张图"弹窗。
 * - 网格缩略图：优先 localPath，缺失时回退 url（由 SafeImage 异步解析）
 * - 选完调 onSelect(asset, sourceUrl)，sourceUrl 是 jimeng API image[] 字段可接受的形式：
 *   - 本地路径 → 调 read_image_data_url 转 dataURL
 *   - 外链 URL → 直接用 URL
 *   - dataURL → 直接用
 */
export default function AssetPicker({ assets, onSelect, onClose, title = "选择一张图" }: Props) {
  const toast = useToast();
  const [resolving, setResolving] = useState<string | null>(null);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onPick = async (asset: Asset) => {
    const main = assetMainImage(asset);
    if (!main) {
      toast.error("这张资产没有可用图");
      return;
    }
    setResolving(asset.id);
    try {
      const sourceUrl = await resolveImageUrl(main);
      onSelect(asset, sourceUrl);
    } catch (e: any) {
      toast.error(`解析图片失败：${e?.message ?? e}`);
    } finally {
      setResolving(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-bg-overlay flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="panel w-[720px] max-w-[95vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-medium">{title}</h3>
          <button onClick={onClose} className="btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-text-muted">
              <ImageIcon className="w-8 h-8 mb-2" />
              <p className="text-sm">当前项目还没有资产</p>
              <p className="text-xs mt-1">先在「生图」或「对话」里生成一张</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {assets.map((a) => {
                const main = assetMainImage(a);
                return (
                  <button
                    key={a.id}
                    onClick={() => onPick(a)}
                    disabled={resolving === a.id}
                    className="relative aspect-square bg-bg-elev rounded overflow-hidden border border-border
                      hover:border-accent transition-colors group disabled:opacity-50"
                    title={a.prompt}
                  >
                    {main ? (
                      <SafeImage
                        src={main}
                        alt={a.prompt}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                    )}
                    {resolving === a.id && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-xs text-white">
                        解析中…
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
