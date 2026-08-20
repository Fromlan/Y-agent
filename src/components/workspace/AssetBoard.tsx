import { useEffect, useMemo, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import type { Asset } from "@/lib/types";
import { assetMainImage } from "@/lib/types";
import { useToast } from "@/components/shared/Toast";
import { confirmDialog } from "@/lib/dialog";
import AssetCard, { type ViewMode } from "@/components/workspace/AssetCard";
import BoardToolbar, {
  type SortBy,
  type SpecialFilter,
} from "@/components/workspace/BoardToolbar";
import AssetDetailDialog from "@/components/workspace/AssetDetailDialog";

interface Props {
  assets: Asset[];
  onCopyPrompt: (text: string) => void;
  onDownload: (url: string, filename: string) => void;
  onDelete: (id: string) => void;
  onBatchDelete: (ids: string[]) => void | Promise<void>;
  /** P3：局部编辑生成新资产时通知父组件刷新列表 */
  onAssetCreated?: (asset: Asset) => void;
}

/**
 * 项目详情页的资产看板
 * 取代原来的简单资产网格，提供：
 * - 三种视图（瀑布流 / 等高网格 / 紧凑小图）
 * - 搜索（按 prompt）+ 模型筛选 + 特殊筛选
 * - 排序（最新/最早/Prompt 长度/生成耗时）
 * - 批量选择 → 批量下载 / 批量删除
 */
export default function AssetBoard({
  assets,
  onCopyPrompt,
  onDownload,
  onDelete,
  onBatchDelete,
  onAssetCreated,
}: Props) {
  const toast = useToast();

  // 视图偏好持久化到 localStorage（单个项目内 vs 全局？先做全局简单）
  const [view, setView] = useState<ViewMode>(() => {
    const v = localStorage.getItem("y-agent.boardView");
    if (v === "masonry" || v === "grid" || v === "compact") return v;
    return "masonry";
  });
  useEffect(() => {
    localStorage.setItem("y-agent.boardView", view);
  }, [view]);

  const [search, setSearch] = useState("");
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [special, setSpecial] = useState<SpecialFilter>(null);
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [detail, setDetail] = useState<Asset | null>(null);

  // 切换 selectMode 时清空选中
  useEffect(() => {
    if (!selectMode) setSelectedIds(new Set());
  }, [selectMode]);

  // 资产集合变化（删除/新增）时同步选中集
  useEffect(() => {
    setSelectedIds((prev) => {
      const ids = new Set<string>();
      for (const id of prev) {
        if (assets.some((a) => a.id === id)) ids.add(id);
      }
      return ids;
    });
  }, [assets]);

  // 当前详情资产被删除时自动关闭详情弹窗
  useEffect(() => {
    if (detail && !assets.some((a) => a.id === detail.id)) {
      setDetail(null);
    }
  }, [assets, detail]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = assets.filter((a) => {
      if (q && !a.prompt.toLowerCase().includes(q)) return false;
      if (selectedModels.size > 0 && !selectedModels.has(a.model)) return false;
      if (special === "layer" && !a.isLayerDecomposition) return false;
      if (special === "ref" && a.refCount <= 0) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return b.createdAt - a.createdAt;
        case "oldest":
          return a.createdAt - b.createdAt;
        case "longest-prompt":
          return b.prompt.length - a.prompt.length;
        case "shortest-prompt":
          return a.prompt.length - b.prompt.length;
        case "fastest":
          return a.costMs - b.costMs;
        case "slowest":
          return b.costMs - a.costMs;
      }
    });
    return list;
  }, [assets, search, selectedModels, special, sortBy]);

  const toggleModel = (m: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map((a) => a.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleBatchDownload = async () => {
    const targets = filtered.filter((a) => selectedIds.has(a.id));
    if (targets.length === 0) return;
    toast.info(`开始批量下载 ${targets.length} 个主图…`);
    // 浏览器对连续 download 有限制，用间隔触发
    for (let i = 0; i < targets.length; i++) {
      const a = targets[i];
      const url = assetMainImage(a);
      if (url) {
        onDownload(url, `y-agent-${a.id}.png`);
      }
      // 让浏览器喘口气，避免被当广告拦截
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await confirmDialog(
      `确认删除选中的 ${ids.length} 个资产？此操作不可恢复。`,
      { kind: "warning", okLabel: "删除" }
    );
    if (!ok) return;
    try {
      await onBatchDelete(ids);
      toast.success(`已删除 ${ids.length} 个`);
      clearSelection();
    } catch (e: any) {
      toast.error(`批量删除失败：${e?.message ?? e}`);
    }
  };

  // 视图根容器样式：统一 grid，三种视图只差"列密度"和"卡片高度"
  // - masonry: 固定高度 192px（h-48），高密度多列
  // - grid:    aspect-square 1:1，中等密度
  // - compact: aspect-square 1:1，最高密度（更小图）
  const gridClass =
    view === "compact"
      ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-2"
      : view === "grid"
      ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
      : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2";

  return (
    <div className="space-y-3">
      <BoardToolbar
        assets={assets}
        search={search}
        onSearch={setSearch}
        selectedModels={selectedModels}
        onToggleModel={toggleModel}
        special={special}
        onSpecial={setSpecial}
        sortBy={sortBy}
        onSortBy={setSortBy}
        view={view}
        onView={setView}
        selectMode={selectMode}
        onToggleSelectMode={() => setSelectMode((s) => !s)}
        selectedIds={selectedIds}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onBatchDownload={handleBatchDownload}
        onBatchDelete={handleBatchDelete}
        filteredCount={filtered.length}
        totalCount={assets.length}
      />

      {filtered.length === 0 ? (
        <EmptyFiltered
          total={assets.length}
          hasFilter={!!search || selectedModels.size > 0 || special !== null}
          onClear={() => {
            setSearch("");
            setSelectedModels(new Set());
            setSpecial(null);
          }}
        />
      ) : (
        <div className={gridClass}>
          {filtered.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              view={view}
              selected={selectedIds.has(a.id)}
              selectMode={selectMode}
              onToggleSelect={toggleSelect}
              onOpenPreview={(asset) => setDetail(asset)}
              onCopyPrompt={onCopyPrompt}
              onDownload={onDownload}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* 资产详情/信息展示窗口 */}
      {detail && (
        <AssetDetailDialog
          asset={detail}
          onClose={() => setDetail(null)}
          onCopyPrompt={onCopyPrompt}
          onDownload={onDownload}
          onDelete={onDelete}
          onAssetCreated={onAssetCreated}
        />
      )}
    </div>
  );
}

function EmptyFiltered({
  total,
  hasFilter,
  onClear,
}: {
  total: number;
  hasFilter: boolean;
  onClear: () => void;
}) {
  if (total === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center min-h-[300px]">
        <div className="w-16 h-16 rounded-2xl bg-bg-elev flex items-center justify-center mb-4">
          <ImageIcon className="w-7 h-7 text-text-muted" />
        </div>
        <h2 className="text-base font-medium mb-1">这个项目还没有资产</h2>
        <p className="text-text-secondary text-xs">在下方输入提示词开始第一次生成</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center text-center min-h-[200px] py-12">
      <div className="w-12 h-12 rounded-2xl bg-bg-elev flex items-center justify-center mb-3">
        <ImageIcon className="w-5 h-5 text-text-muted" />
      </div>
      <p className="text-text-secondary text-sm mb-2">没有匹配的资产</p>
      {hasFilter && (
        <button onClick={onClear} className="btn text-xs h-7 px-2.5">
          <X className="w-3.5 h-3.5" /> 清空筛选
        </button>
      )}
    </div>
  );
}
