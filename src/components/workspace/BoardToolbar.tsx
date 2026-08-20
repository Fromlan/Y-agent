import { useMemo } from "react";
import {
  Search,
  Layers,
  Image as ImageIcon,
  LayoutGrid,
  Grid2x2,
  GalleryVertical,
  CheckSquare,
  Square,
  Download,
  Trash2,
  X,
  ArrowDownAZ,
  ArrowUpDown,
  Clock,
  Type,
} from "lucide-react";
import type { Asset } from "@/lib/types";
import type { ViewMode } from "@/components/workspace/AssetCard";

export type SortBy = "newest" | "oldest" | "longest-prompt" | "shortest-prompt" | "fastest" | "slowest";
export type SpecialFilter = "layer" | "ref" | null;

interface Props {
  assets: Asset[];
  search: string;
  onSearch: (s: string) => void;
  selectedModels: Set<string>;
  onToggleModel: (m: string) => void;
  special: SpecialFilter;
  onSpecial: (s: SpecialFilter) => void;
  sortBy: SortBy;
  onSortBy: (s: SortBy) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  selectedIds: Set<string>;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBatchDownload: () => void;
  onBatchDelete: () => void;
  filteredCount: number;
  totalCount: number;
}

/**
 * 看板顶部工具条：搜索 / 模型筛选 / 特殊筛选 / 排序 / 视图切换 / 批量选择
 * 单行布局，窄屏可换行（flex-wrap）
 */
export default function BoardToolbar({
  assets,
  search,
  onSearch,
  selectedModels,
  onToggleModel,
  special,
  onSpecial,
  sortBy,
  onSortBy,
  view,
  onView,
  selectMode,
  onToggleSelectMode,
  selectedIds,
  onSelectAll,
  onClearSelection,
  onBatchDownload,
  onBatchDelete,
  filteredCount,
  totalCount,
}: Props) {
  // 当前项目里出现过的模型，去重保序
  const modelsInUse = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const a of assets) {
      if (!seen.has(a.model)) {
        seen.add(a.model);
        out.push({ id: a.model, name: a.modelName });
      }
    }
    return out;
  }, [assets]);

  const allChecked = filteredCount > 0 && selectedIds.size === filteredCount;
  const someChecked = selectedIds.size > 0 && selectedIds.size < filteredCount;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* 搜索 */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="搜索 prompt..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-bg-elev border border-border rounded-md
              text-text-primary placeholder:text-text-muted
              focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* 视图切换 */}
        <div className="flex items-center bg-bg-elev border border-border rounded-md overflow-hidden">
          <ViewBtn
            active={view === "masonry"}
            onClick={() => onView("masonry")}
            title="瀑布流（自然比例）"
            icon={GalleryVertical}
          />
          <ViewBtn
            active={view === "grid"}
            onClick={() => onView("grid")}
            title="网格（等高）"
            icon={Grid2x2}
          />
          <ViewBtn
            active={view === "compact"}
            onClick={() => onView("compact")}
            title="紧凑（小图）"
            icon={LayoutGrid}
          />
        </div>

        {/* 排序 */}
        <SortMenu sortBy={sortBy} onChange={onSortBy} />

        <div className="flex-1" />

        {/* 批量选择入口 */}
        <button
          onClick={onToggleSelectMode}
          className={`btn text-xs h-7 px-2.5 ${
            selectMode ? "btn-primary" : ""
          }`}
          title="进入选择模式后可批量下载 / 删除"
        >
          {selectMode ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          {selectMode ? "退出选择" : "选择"}
        </button>
      </div>

      {/* 第二行：模型筛选 + 特殊筛选 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-text-muted uppercase tracking-wider">模型</span>
        <Chip
          active={selectedModels.size === 0}
          onClick={() => {
            // 清空所有 = 全部
            if (selectedModels.size > 0) {
              for (const m of selectedModels) onToggleModel(m);
            }
          }}
        >
          全部
        </Chip>
        {modelsInUse.map((m) => (
          <Chip
            key={m.id}
            active={selectedModels.has(m.id)}
            onClick={() => onToggleModel(m.id)}
            short
          >
            {shortName(m.name)}
          </Chip>
        ))}

        <div className="w-px h-4 bg-border mx-1" />

        <span className="text-[10px] text-text-muted uppercase tracking-wider">筛选</span>
        <Chip
          active={special === "layer"}
          onClick={() => onSpecial(special === "layer" ? null : "layer")}
          icon={Layers}
        >
          仅图层
        </Chip>
        <Chip
          active={special === "ref"}
          onClick={() => onSpecial(special === "ref" ? null : "ref")}
          icon={ImageIcon}
        >
          仅含参考图
        </Chip>

        <div className="flex-1" />
        <span className="text-[10px] text-text-muted">
          {filteredCount} / {totalCount}
        </span>
      </div>

      {/* 选择模式下的批量操作条 */}
      {selectMode && (
        <div className="flex items-center gap-2 p-2 panel bg-bg-elev">
          <span className="text-xs text-text-secondary">
            已选 <b className="text-text-primary">{selectedIds.size}</b> 个
          </span>
          <button
            onClick={allChecked || someChecked ? onClearSelection : onSelectAll}
            className="text-xs text-accent hover:underline"
          >
            {allChecked || someChecked ? "清空选择" : "全选当前"}
          </button>
          <div className="flex-1" />
          <button
            onClick={onBatchDownload}
            disabled={selectedIds.size === 0}
            className="btn text-xs h-7 px-2.5"
          >
            <Download className="w-3.5 h-3.5" /> 批量下载
          </button>
          <button
            onClick={onBatchDelete}
            disabled={selectedIds.size === 0}
            className="btn text-xs h-7 px-2.5 hover:!text-accent-danger"
          >
            <Trash2 className="w-3.5 h-3.5" /> 批量删除
          </button>
          <button
            onClick={onClearSelection}
            className="btn-icon p-1"
            title="关闭"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  title,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: typeof GalleryVertical;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 h-7 text-xs flex items-center transition-colors ${
        active
          ? "bg-accent text-text-inverse"
          : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
  icon: Icon,
  short,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: typeof Layers;
  short?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs h-6 px-2 rounded-md border transition-colors flex items-center gap-1
        ${active
          ? "bg-accent/20 border-accent text-accent"
          : "bg-bg-elev border-border text-text-secondary hover:text-text-primary hover:border-border-strong"}
        ${short ? "max-w-[120px] truncate" : ""}
      `}
      title={typeof children === "string" ? children : undefined}
    >
      {Icon && <Icon className="w-3 h-3" />}
      <span className="truncate">{children}</span>
    </button>
  );
}

function SortMenu({
  sortBy,
  onChange,
}: {
  sortBy: SortBy;
  onChange: (s: SortBy) => void;
}) {
  const options: { value: SortBy; label: string; icon: typeof ArrowDownAZ }[] = [
    { value: "newest", label: "最新优先", icon: Clock },
    { value: "oldest", label: "最早优先", icon: Clock },
    { value: "longest-prompt", label: "Prompt 最长", icon: Type },
    { value: "shortest-prompt", label: "Prompt 最短", icon: Type },
    { value: "fastest", label: "生成最快", icon: ArrowUpDown },
    { value: "slowest", label: "生成最慢", icon: ArrowUpDown },
  ];
  const cur = options.find((o) => o.value === sortBy)!;
  const Icon = cur.icon;
  return (
    <div className="relative group">
      <button
        className="btn text-xs h-7 px-2.5"
        title="排序方式"
      >
        <Icon className="w-3.5 h-3.5" />
        {cur.label}
      </button>
      <div
        className="absolute right-0 top-full mt-1 z-20 min-w-[140px] panel py-1
          opacity-0 invisible group-hover:opacity-100 group-hover:visible
          transition-opacity"
      >
        {options.map((o) => {
          const OIcon = o.icon;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className={`w-full text-left px-2.5 py-1 text-xs flex items-center gap-1.5
                ${
                  sortBy === o.value
                    ? "bg-bg-hover text-accent"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                }
              `}
            >
              <OIcon className="w-3 h-3" />
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 把模型名截短，eg "Seedream 5.0 Lite（默认）" → "5.0 Lite" */
function shortName(name: string): string {
  const m = name.match(/Seedream\s*([\d.]+(?:\s*(?:Lite|Pro))?)/i);
  if (m) return m[1];
  return name.replace(/^自定义\s*/, "自定义");
}
