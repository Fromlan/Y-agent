/**
 * M3 角色档案列表（左侧栏）
 *
 * 职责：
 * - 列出当前项目 + 全局所有角色档案
 * - 顶部搜索框（name/description 模糊匹配）
 * - 标签多选过滤（AND 语义）
 * - 每行档案卡：name + scope badge + tags + agentUseCount + updatedAt
 * - "新建档案"按钮
 */
import { useMemo } from "react";
import { Search, Plus, Globe, FolderOpen, User } from "lucide-react";
import type { CharacterArchive } from "@/lib/types";
import { aggregateAllTags, queryCharacterArchives } from "@/lib/character-archive";

interface Props {
  archives: CharacterArchive[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  searchName: string;
  onSearchNameChange: (s: string) => void;
  tagFilter: string[];
  onTagFilterChange: (tags: string[]) => void;
  projectId: string;
}

function formatUpdated(ms: number): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(ms).toLocaleDateString("zh-CN");
}

export default function CharacterArchiveList({
  archives,
  selectedId,
  onSelect,
  onCreate,
  searchName,
  onSearchNameChange,
  tagFilter,
  onTagFilterChange,
  projectId,
}: Props) {
  const allTags = useMemo(() => aggregateAllTags(archives), [archives]);

  const filtered = useMemo(
    () =>
      queryCharacterArchives(archives, {
        projectId,
        searchName,
        tagFilter,
      }),
    [archives, projectId, searchName, tagFilter],
  );

  const toggleTag = (tag: string) => {
    if (tagFilter.includes(tag)) {
      onTagFilterChange(tagFilter.filter((t) => t !== tag));
    } else {
      onTagFilterChange([...tagFilter, tag]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-panel border-r border-border">
      {/* 顶部：搜索 + 新建 */}
      <div className="p-3 border-b border-border space-y-2">
        <button
          type="button"
          onClick={onCreate}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-accent text-white hover:opacity-90 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          新建档案
        </button>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            value={searchName}
            onChange={(e) => onSearchNameChange(e.target.value)}
            placeholder="搜索档案名 / 描述"
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-border bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {allTags.slice(0, 24).map((tag) => {
              const on = tagFilter.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                    on
                      ? "bg-accent text-white"
                      : "bg-bg border border-border text-text-secondary hover:border-accent"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
            {tagFilter.length > 0 && (
              <button
                type="button"
                onClick={() => onTagFilterChange([])}
                className="text-[10px] px-1.5 py-0.5 rounded text-text-muted hover:text-text-primary"
              >
                清除 ×
              </button>
            )}
          </div>
        )}
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-text-muted">
            {archives.length === 0 ? (
              <>
                <p className="mb-2">还没有角色档案</p>
                <p className="text-[10px]">点上方"新建档案"开始</p>
              </>
            ) : (
              <>没有匹配的档案</>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onSelect(a.id)}
                  className={`w-full text-left px-3 py-2 transition ${
                    selectedId === a.id
                      ? "bg-bg-hover"
                      : "hover:bg-bg-hover/50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">
                      {a.scope === "global" ? (
                        <Globe className="w-3.5 h-3.5 text-accent" />
                      ) : (
                        <FolderOpen className="w-3.5 h-3.5 text-text-muted" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-text-primary truncate">
                          {a.name || "(未命名)"}
                        </span>
                        {a.agentUseCount > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] text-text-muted"
                            title={`被 Agent 引用 ${a.agentUseCount} 次`}
                          >
                            <User className="w-2.5 h-2.5" />
                            {a.agentUseCount}
                          </span>
                        )}
                      </div>
                      {a.description && (
                        <p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">
                          {a.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-text-muted">
                          {formatUpdated(a.updatedAt)}
                        </span>
                        {a.referenceImageAssetIds.length > 0 && (
                          <span className="text-[10px] text-text-muted">
                            · {a.referenceImageAssetIds.length} 张参考图
                          </span>
                        )}
                        {a.tags.length > 0 && (
                          <span className="text-[10px] text-text-muted truncate">
                            · {a.tags.slice(0, 3).join(" / ")}
                            {a.tags.length > 3 && " …"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 底部计数 */}
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-muted">
        {filtered.length} / {archives.length} 个档案
      </div>
    </div>
  );
}
