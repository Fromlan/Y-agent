/**
 * M3 角色档案下拉选择器（嵌到 PromptBar 顶部）
 *
 * 职责：
 * - 小型 popover，点 pill 打开
 * - 列出当前项目 + 全局所有档案（按 updatedAt 倒序）
 * - 支持搜索
 * - 点档案 → 选中（pill 显示档案名 + 颜色 badge）
 * - "清除"按钮：取消选择
 * - "去角色工坊管理"快捷链接
 *
 * 状态归属：archives 列表由上层 ProjectDetail 持有 + 缓存（避免每次开 popover 都打 IPC）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X, Globe, FolderOpen, Search, User, Plus } from "lucide-react";
import type { CharacterArchive } from "@/lib/types";
import { makeEmptyArchive, queryCharacterArchives, upsertCharacterArchive } from "@/lib/character-archive";
import { useToast } from "@/components/shared/Toast";

interface Props {
  projectId: string;
  archives: CharacterArchive[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** "去角色工坊" 链接（上层可挂在切换 tab 逻辑上） */
  onOpenWorkshop?: () => void;
  /** M3.3：新建档案后回调（让上层 reload archives 列表） */
  onArchiveChanged?: () => void;
}

export default function CharacterArchivePicker({
  projectId,
  archives,
  selectedId,
  onSelect,
  onOpenWorkshop,
  onArchiveChanged,
}: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => archives.find((a) => a.id === selectedId) ?? null,
    [archives, selectedId],
  );

  // M3.3：点 popover 底部"新建全局档案"
  const onCreateGlobal = async () => {
    try {
      const draft = makeEmptyArchive("global", null);
      const row = await upsertCharacterArchive(draft);
      toast.success("全局档案已创建（跨项目可见）");
      onArchiveChanged?.();
      onSelect(row.id);
      setOpen(false);
    } catch (e: any) {
      toast.error(`新建失败：${e?.message ?? e}`);
    }
  };

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const filtered = useMemo(
    () =>
      queryCharacterArchives(archives, {
        projectId,
        searchName: search,
      }),
    [archives, projectId, search],
  );

  return (
    <div className="relative" ref={popoverRef}>
      {/* pill 按钮 */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition ${
          selected
            ? "bg-accent/10 text-accent border border-accent/30"
            : "bg-bg-panel border border-border text-text-muted hover:text-text-primary hover:border-accent/40"
        }`}
        title={selected ? `当前档案：${selected.name}` : "未选择角色档案"}
      >
        {selected ? (
          <>
            {selected.scope === "global" ? (
              <Globe className="w-3 h-3" />
            ) : (
              <FolderOpen className="w-3 h-3" />
            )}
            <span className="truncate max-w-[120px]">{selected.name}</span>
            <span className="text-[10px] text-text-muted">·</span>
            <span className="text-[10px] text-text-muted">
              {selected.referenceImageAssetIds.length} 图
            </span>
            <X
              className="w-3 h-3 ml-0.5 hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(null);
              }}
            />
          </>
        ) : (
          <>
            <User className="w-3 h-3" />
            <span>选角色档案</span>
          </>
        )}
        <ChevronDown className="w-3 h-3 opacity-50" />
      </button>

      {/* popover */}
      {open && (
        <div className="absolute z-50 mt-1 w-72 bg-bg-panel border border-border rounded shadow-lg overflow-hidden">
          {/* 搜索框 */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索档案"
                className="w-full pl-6 pr-2 py-1 text-[11px] rounded border border-border bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                autoFocus
              />
            </div>
          </div>
          {/* 列表 */}
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-[11px] text-text-muted">
                {archives.length === 0 ? (
                  <>还没有角色档案</>
                ) : (
                  <>没有匹配的档案</>
                )}
              </div>
            ) : (
              <ul>
                {filtered.map((a) => {
                  const on = a.id === selectedId;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(a.id);
                          setOpen(false);
                        }}
                        className={`relative w-full text-left px-2 py-1.5 hover:bg-bg-hover transition ${
                          on ? "bg-accent/5" : ""
                        }`}
                      >
                        {on && (
                          <span
                            className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-accent"
                            aria-hidden
                          />
                        )}
                        <div className="flex items-center gap-1.5">
                          {a.scope === "global" ? (
                            <Globe className="w-3 h-3 text-accent flex-shrink-0" />
                          ) : (
                            <FolderOpen className="w-3 h-3 text-text-muted flex-shrink-0" />
                          )}
                          <span className="text-[12px] font-medium text-text-primary truncate">
                            {a.name}
                          </span>
                          {a.referenceImageAssetIds.length > 0 && (
                            <span className="text-[10px] text-text-muted flex-shrink-0">
                              {a.referenceImageAssetIds.length} 图
                            </span>
                          )}
                        </div>
                        {a.description && (
                          <p className="text-[10px] text-text-muted mt-0.5 line-clamp-1 pl-4">
                            {a.description}
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {/* 底部：新建全局档案 + 管理链接 */}
          <div className="border-t border-border p-1.5 space-y-0.5">
            <button
              type="button"
              onClick={onCreateGlobal}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-text-secondary hover:text-accent hover:bg-bg-hover rounded text-left"
              title="新建一个全局档案（跨所有项目可见）"
            >
              <Plus className="w-3 h-3" />
              新建全局档案
              <span className="text-[10px] text-text-muted ml-auto">
                <Globe className="w-2.5 h-2.5 inline-block" />
              </span>
            </button>
            {onOpenWorkshop && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenWorkshop();
                }}
                className="w-full text-center text-[11px] text-accent hover:underline py-1"
              >
                去角色工坊管理 →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
