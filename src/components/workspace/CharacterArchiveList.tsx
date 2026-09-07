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
import { useMemo, useState } from "react";
import { Search, Plus, Globe, FolderOpen, User, ChevronDown } from "lucide-react";
import type { CharacterArchive } from "@/lib/types";
import { aggregateAllTags, queryCharacterArchives } from "@/lib/character-archive";

interface Props {
  archives: CharacterArchive[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** M3.3：scope 参数决定是项目还是全局档案 */
  onCreate: (scope: "project" | "global") => void;
  searchName: string;
  onSearchNameChange: (s: string) => void;
  tagFilter: string[];
  onTagFilterChange: (tags: string[]) => void;
  projectId: string;
  /** M3.3：是否只看本项目档案（默认 false = 含全局） */
  onlyProject?: boolean;
  onOnlyProjectChange?: (v: boolean) => void;
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
  onlyProject = false,
  onOnlyProjectChange,
}: Props) {
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const allTags = useMemo(() => aggregateAllTags(archives), [archives]);

  const filtered = useMemo(
    () =>
      queryCharacterArchives(archives, {
        projectId,
        searchName,
        tagFilter,
        scope: onlyProject ? ["project"] : ["project", "global"],
      }),
    [archives, projectId, searchName, tagFilter, onlyProject],
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
        {/* 新建按钮：分裂成"项目 / 全局"两选项 */}
        <div className="relative">
          <div className="flex">
            <button
              type="button"
              onClick={() => onCreate("project")}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-l text-xs font-medium bg-accent text-white hover:opacity-90 transition"
              title="在本项目内可见的角色档案"
            >
              <Plus className="w-3.5 h-3.5" />
              新建项目档案
            </button>
            <button
              type="button"
              onClick={() => setShowCreateMenu((v) => !v)}
              className="px-2 py-1.5 rounded-r border-l border-white/20 bg-accent text-white hover:opacity-90 transition"
              title="更多新建选项"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
          {showCreateMenu && (
            <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-bg-panel border border-border rounded shadow-lg overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  onCreate("global");
                  setShowCreateMenu(false);
                }}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs hover:bg-bg-hover text-left"
              >
                <Globe className="w-3 h-3 text-accent" />
                新建全局档案
                <span className="text-[10px] text-text-muted ml-auto">
                  跨项目可见
                </span>
              </button>
            </div>
          )}
        </div>
        {/* 只看本项目 toggle */}
        {onOnlyProjectChange && (
          <label className="flex items-center gap-1.5 text-[10px] text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyProject}
              onChange={(e) => onOnlyProjectChange(e.target.checked)}
              className="rounded border-border"
            />
            只看本项目档案
          </label>
        )}
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
