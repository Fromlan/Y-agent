/**
 * M3 角色工坊主页（2-pane 布局：列表 + 编辑器）
 *
 * 职责：
 * - 加载 / 缓存当前项目可见的档案列表（IPC）
 * - 选中档案的草稿态（本地 useState，自动防抖落盘）
 * - 新建 / 删除 / 更新（含校验失败时不发 IPC）
 * - "应用到 PromptBar"通过回调让上层（ProjectDetail）写入 PromptBar 状态
 *
 * 数据流：
 *   list_character_archives(projectId) → CharacterArchive[]
 *   ↓ queryCharacterArchives (scope / tag / search 过滤)
 *   CharacterArchiveList 渲染
 *   ↓ 选中
 *   CharacterArchiveEditor 编辑
 *   ↓ 防抖 500ms
 *   upsert_character_archive(input)
 *   ↓
 *   重新 listCharacterArchives 拿新行（含 createdAt / updatedAt）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/shared/Toast";
import { Download, Upload } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type {
  Asset,
  CharacterArchive,
  CharacterArchiveUpsert,
} from "@/lib/types";
import {
  buildArchiveExportJson,
  deleteCharacterArchive,
  downloadArchiveJson,
  listCharacterArchives,
  makeEmptyArchive,
  parseArchiveExportJson,
  upsertCharacterArchive,
  validateArchiveUpsert,
} from "@/lib/character-archive";
import CharacterArchiveList from "@/components/workspace/CharacterArchiveList";
import CharacterArchiveEditor from "@/components/workspace/CharacterArchiveEditor";

interface Props {
  projectId: string;
  /** 项目下所有资产（reference grid 用） */
  assets: Asset[];
  /** "应用到 PromptBar" 时把 id 写回；上层负责写入 PromptBar 状态 */
  onApplyToPromptBar?: (archiveId: string | null) => void;
}

export default function CharacterWorkshop({
  projectId,
  assets,
  onApplyToPromptBar,
}: Props) {
  const toast = useToast();
  const [archives, setArchives] = useState<CharacterArchive[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchName, setSearchName] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  // M3.3：是否只看本项目档案
  const [onlyProject, setOnlyProject] = useState(false);

  // 防抖落盘：onChange 触发后 500ms 合并 + 调 upsert_character_archive
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listCharacterArchives(projectId);
      setArchives(rows);
      // 选中不存在时清掉
      if (selectedId && !rows.find((a) => a.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (e) {
      toast.error("加载角色档案失败");
      console.error("[CharacterWorkshop] list failed:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedId, toast]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const selected = archives.find((a) => a.id === selectedId) ?? null;

  // 新建（scope 由参数决定：project / global）
  const onCreate = async (scope: "project" | "global") => {
    const draft = makeEmptyArchive(
      scope,
      scope === "project" ? projectId : null,
    );
    try {
      const row = await upsertCharacterArchive(draft);
      await reload();
      setSelectedId(row.id);
      toast.success(
        scope === "global" ? "全局档案已创建（跨项目可见）" : "档案已创建",
      );
    } catch (e: any) {
      toast.error(`新建失败：${e?.message ?? e}`);
    }
  };

  // 删除
  const onDelete = async () => {
    if (!selected) return;
    try {
      await deleteCharacterArchive(selected.id);
      toast.success(`已删除「${selected.name}」`);
      setSelectedId(null);
      await reload();
    } catch (e: any) {
      toast.error(`删除失败：${e?.message ?? e}`);
    }
  };

  // 编辑：本地草稿 + 防抖落盘
  const onChange = useCallback(
    (patch: Partial<CharacterArchiveUpsert>) => {
      if (!selected) return;
      // 清掉之前的 timer
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // 500ms 后落盘
      saveTimerRef.current = setTimeout(async () => {
        const merged: CharacterArchiveUpsert = {
          id: selected.id,
          scope: selected.scope,
          projectId: selected.projectId,
          name: patch.name ?? selected.name,
          description: patch.description ?? selected.description,
          referenceImageAssetIds: selected.referenceImageAssetIds,
          styleContractId: selected.styleContractId,
          promptSnippet: patch.promptSnippet ?? selected.promptSnippet,
          tags: patch.tags ?? selected.tags,
          agentUseCount: selected.agentUseCount,
        };
        // 二次校验（防止空名等）
        const err = validateArchiveUpsert(merged);
        if (err) return; // 静默：UI 已经显示错误，等用户改对
        try {
          await upsertCharacterArchive(merged);
          // 重新拉一次拿最新 updatedAt
          await reload();
        } catch (e: any) {
          toast.error(`保存失败：${e?.message ?? e}`);
        }
      }, 500);
    },
    [selected, reload, toast],
  );

  // 应用到 PromptBar
  const onApply = () => {
    if (!selected) return;
    // 先同步落盘一次（不等防抖）
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    onApplyToPromptBar?.(selected.id);
    toast.success(`已应用「${selected.name}」到 PromptBar`);
  };

  // M3.5：导出全部档案为 .json
  const onExportAll = () => {
    if (archives.length === 0) {
      toast.info("没有档案可导出");
      return;
    }
    const json = buildArchiveExportJson(archives);
    const ts = new Date().toISOString().slice(0, 10);
    downloadArchiveJson(`y-agent-archives-${ts}.json`, json);
    toast.success(`已导出 ${archives.length} 个档案到下载目录`);
  };

  // M3.5：导入 .json
  const onImportJson = async () => {
    try {
      const picked = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!picked || typeof picked !== "string") return;
      // 读文件
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const raw = await readTextFile(picked);
      const result = parseArchiveExportJson(raw);
      if ("error" in result) {
        toast.error(`导入失败：${result.error}`);
        return;
      }
      const { archives: items } = result.payload;
      if (items.length === 0) {
        toast.info("JSON 里没有档案");
        return;
      }
      // 逐项 upsert（id 留空 → Rust 端生成新 UUID）
      let okCount = 0;
      for (const a of items) {
        try {
          await upsertCharacterArchive({
            id: undefined,
            scope: a.scope,
            projectId: a.scope === "project" ? projectId : null,
            name: a.name,
            description: a.description,
            referenceImageAssetIds: [], // 导入不携带资产图（跨机器无意义）
            styleContractId: null,
            promptSnippet: a.promptSnippet,
            tags: a.tags,
            agentUseCount: 0,
          });
          okCount++;
        } catch {
          // 静默：单个失败不阻塞其他
        }
      }
      await reload();
      toast.success(`导入完成（${okCount}/${items.length}）`);
    } catch (e: any) {
      toast.error(`导入失败：${e?.message ?? e}`);
    }
  };

  // 卸载时清理
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (loading && archives.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-text-muted">
        加载中…
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-72 flex-shrink-0">
        <CharacterArchiveList
          archives={archives}
          selectedId={selectedId}
          onSelect={(id) => {
            // 切换时立即 flush 当前草稿
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            setSelectedId(id);
          }}
          onCreate={onCreate}
          searchName={searchName}
          onSearchNameChange={setSearchName}
          tagFilter={tagFilter}
          onTagFilterChange={setTagFilter}
          projectId={projectId}
          onlyProject={onlyProject}
          onOnlyProjectChange={setOnlyProject}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        {/* M3.5：工具栏（导出 / 导入） */}
        <div className="px-4 py-1.5 border-b border-border bg-bg-panel flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={onImportJson}
            className="text-[10px] flex items-center gap-0.5 px-2 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover"
            title="从 .json 文件导入档案（不含参考图）"
          >
            <Upload className="w-3 h-3" />
            导入
          </button>
          <button
            type="button"
            onClick={onExportAll}
            className="text-[10px] flex items-center gap-0.5 px-2 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover"
            title="把所有可见档案导出为 .json"
          >
            <Download className="w-3 h-3" />
            导出全部
          </button>
        </div>
        <div className="flex-1 min-w-0">
          {selected ? (
            <CharacterArchiveEditor
              key={selected.id}
              archive={selected}
              assets={assets}
              onChange={onChange}
              onDelete={onDelete}
              onApply={onApply}
              onReferencesChanged={() => void reload()}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-text-muted p-8 text-center">
              {archives.length === 0 ? (
                <>
                  <div>
                    <p className="mb-2">还没有角色档案</p>
                    <p className="text-[10px]">点左侧"新建档案"开始</p>
                  </div>
                </>
              ) : (
                <p>从左侧选一个档案查看详情</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
