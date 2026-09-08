/**
 * M3 角色工坊主页（2-pane 布局：列表 + 编辑器）
 *
 * M3.6 改造要点：
 * - 数据流去重：archives / loading / reload 由上层 ProjectDetail 持有 + 透传。
 *   Workshop 内部不再调 listCharacterArchives,只是消费 props + 调 onReload。
 * - 草稿不丢：切档案 / 卸载前先 flushPending,把当前草稿立即落盘。
 * - 错误可见：校验失败 / IPC 失败 → toast.error,不再静默 return。
 * - 保存状态：savingStatus chip(saving / saved / error)提示用户。
 * - 顶部条整理:导出 split-button(项目内 / 全部);导入按钮加 tooltip。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/shared/Toast";
import { Download, Upload, ChevronDown } from "lucide-react";
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
  makeEmptyArchive,
  parseArchiveExportJson,
  upsertCharacterArchive,
  validateArchiveUpsert,
} from "@/lib/character-archive";
import CharacterArchiveList from "@/components/workspace/CharacterArchiveList";
import CharacterArchiveEditor from "@/components/workspace/CharacterArchiveEditor";

/** 编辑器向上传的草稿字段(标量,不再包 Partial) */
export interface CharacterArchiveDraftPatch {
  name: string;
  description: string;
  promptSnippet: string;
  tags: string[];
}

/** 保存状态指示 */
type SavingStatus = "idle" | "saving" | "saved" | "error";

interface Props {
  projectId: string;
  /** 项目下所有资产(reference grid 用) */
  assets: Asset[];
  /** 上层持有的 archives(单一源);Workshop 是消费方 */
  archives: CharacterArchive[];
  /** 数据加载中(上层控制) */
  loading: boolean;
  /** 让上层重新拉 archives(走 IPC);所有写操作(新建/删除/upsert)完成后调用 */
  onReload: () => Promise<void>;
  /** 当前选中的档案 id */
  selectedId: string | null;
  onSelectedIdChange: (id: string | null) => void;
  /** "应用到 PromptBar" 时把 id 写回;上层负责写入 PromptBar 状态 */
  onApplyToPromptBar?: (archiveId: string | null) => void;
}

export default function CharacterWorkshop({
  projectId,
  assets,
  archives,
  loading,
  onReload,
  selectedId,
  onSelectedIdChange,
  onApplyToPromptBar,
}: Props) {
  const toast = useToast();
  const [searchName, setSearchName] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  // M3.3:是否只看本项目档案
  const [onlyProject, setOnlyProject] = useState(false);

  // === 防抖落盘 ===
  // 1. 草稿态:用 ref 存最新 patch(避免闭包过期)
  const draftRef = useRef<CharacterArchiveDraftPatch | null>(null);
  // 2. timer ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 3. 保存状态(savingStatus 透传给 Editor 顶部 chip)
  const [savingStatus, setSavingStatus] = useState<SavingStatus>("idle");
  // 4. 当前防抖处理的是哪个 selectedId(避免旧 timer 落到新选中的档案上)
  const pendingSelectedIdRef = useRef<string | null>(null);
  // 5. saved 状态自动回 idle 的 timer
  const savedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = archives.find((a) => a.id === selectedId) ?? null;

  // === 实际落盘函数(从 timer / flush 共用) ===
  // 关键:闭包捕获的 selectedId 必须是当前 selected.id,否则会写到错对象
  const performSave = useCallback(
    async (forId: string) => {
      const draft = draftRef.current;
      if (!draft) return;
      const target = archives.find((a) => a.id === forId);
      if (!target) {
        // 选中的档案已经被外部删了/切了 — 跳过
        draftRef.current = null;
        setSavingStatus("idle");
        return;
      }
      const merged: CharacterArchiveUpsert = {
        id: target.id,
        scope: target.scope,
        projectId: target.projectId,
        name: draft.name,
        description: draft.description,
        referenceImageAssetIds: target.referenceImageAssetIds,
        styleContractId: target.styleContractId,
        promptSnippet: draft.promptSnippet,
        tags: draft.tags,
        agentUseCount: target.agentUseCount,
      };
      const err = validateArchiveUpsert(merged);
      if (err) {
        toast.error(err);
        setSavingStatus("error");
        return;
      }
      setSavingStatus("saving");
      try {
        await upsertCharacterArchive(merged);
        // 成功后清草稿 + 拉新数据
        draftRef.current = null;
        await onReload();
        setSavingStatus("saved");
        // 2 秒后回 idle
        if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current);
        savedResetTimerRef.current = setTimeout(() => {
          setSavingStatus("idle");
        }, 2000);
      } catch (e: any) {
        toast.error(`保存失败:${e?.message ?? e}`);
        setSavingStatus("error");
      }
    },
    [archives, onReload, toast],
  );

  // === 收到草稿 → 重新设防抖 timer ===
  const onDraftChange = useCallback(
    (patch: CharacterArchiveDraftPatch) => {
      if (!selected) return;
      // 切档案后第一帧 onDraftChange 是 useEffect 触发的同步草稿
      // 如果跟 selected 当前内容一致(没真的改),直接清状态不保存
      const isNoop =
        patch.name === selected.name &&
        patch.description === selected.description &&
        patch.promptSnippet === selected.promptSnippet &&
        JSON.stringify(patch.tags) === JSON.stringify(selected.tags);
      if (isNoop) {
        draftRef.current = null;
        return;
      }
      draftRef.current = patch;
      pendingSelectedIdRef.current = selected.id;
      // 清掉 saved 状态(用户又开始编辑)
      if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current);
      if (savingStatus === "saved" || savingStatus === "error") {
        setSavingStatus("idle");
      }
      // 重置 timer
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void performSave(selected.id);
      }, 500);
    },
    [selected, savingStatus, performSave],
  );

  // === flush:立即落盘(切档案 / 卸载 / 应用前调) ===
  const flushPending = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pendingId = pendingSelectedIdRef.current;
    if (pendingId && draftRef.current) {
      await performSave(pendingId);
    }
  }, [performSave]);

  // 卸载时 flush(防用户意外关 tab 丢内容)
  useEffect(() => {
    return () => {
      void flushPending();
      if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === 选中档案:先 flush 当前,再切 ===
  const handleSelect = useCallback(
    async (id: string) => {
      await flushPending();
      draftRef.current = null;
      pendingSelectedIdRef.current = null;
      setSavingStatus("idle");
      onSelectedIdChange(id);
    },
    [flushPending, onSelectedIdChange],
  );

  // === 新建(scope 由参数决定:project / global) ===
  const onCreate = async (scope: "project" | "global") => {
    // 新建前 flush
    await flushPending();
    // 关键:M3.6 修 — makeEmptyArchive 默认 name="" 会触发前后端校验失败。
    // 这里按当前 scope + 现有档案数生成一个默认名(用户随后在 Editor 里改)。
    const sameScopeCount = archives.filter(
      (a) =>
        a.scope === scope &&
        (scope === "global" || a.projectId === projectId),
    ).length;
    const defaultName =
      scope === "global"
        ? `全局档案 #${sameScopeCount + 1}`
        : `新档案 #${sameScopeCount + 1}`;
    const draft: import("@/lib/types").CharacterArchiveUpsert = {
      ...makeEmptyArchive(scope, scope === "project" ? projectId : null),
      name: defaultName,
    };
    try {
      const row = await upsertCharacterArchive(draft);
      await onReload();
      onSelectedIdChange(row.id);
      toast.success(
        scope === "global" ? "全局档案已创建(跨项目可见)" : "档案已创建",
      );
    } catch (e: any) {
      toast.error(`新建失败:${e?.message ?? e}`);
    }
  };

  // === 删除 ===
  const onDelete = async () => {
    if (!selected) return;
    // 删除前 flush
    await flushPending();
    try {
      await deleteCharacterArchive(selected.id);
      toast.success(`已删除「${selected.name}」`);
      onSelectedIdChange(null);
      await onReload();
    } catch (e: any) {
      toast.error(`删除失败:${e?.message ?? e}`);
    }
  };

  // === 应用到 PromptBar ===
  const onApply = async () => {
    if (!selected) return;
    // 应用前 flush,确保 PromptBar 拿到最新数据
    await flushPending();
    onApplyToPromptBar?.(selected.id);
    toast.success(`已应用「${selected.name}」到 PromptBar(请到对话 tab 生图)`);
  };

  // === 导出:split-button 支持 项目内 / 全部 ===
  const doExport = (mode: "project" | "all") => {
    const items =
      mode === "project"
        ? archives.filter((a) => a.scope === "project")
        : archives;
    if (items.length === 0) {
      toast.info(mode === "project" ? "本项目内没有档案可导出" : "没有档案可导出");
      return;
    }
    const json = buildArchiveExportJson(items);
    const ts = new Date().toISOString().slice(0, 10);
    const tag = mode === "project" ? "project" : "all";
    downloadArchiveJson(`y-agent-archives-${tag}-${ts}.json`, json);
    toast.success(`已导出 ${items.length} 个档案到下载目录`);
  };

  // === 导入 ===
  const onImportJson = async () => {
    try {
      const picked = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!picked || typeof picked !== "string") return;
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const raw = await readTextFile(picked);
      const result = parseArchiveExportJson(raw);
      if ("error" in result) {
        toast.error(`导入失败:${result.error}`);
        return;
      }
      const { archives: items } = result.payload;
      if (items.length === 0) {
        toast.info("JSON 里没有档案");
        return;
      }
      let okCount = 0;
      for (const a of items) {
        try {
          await upsertCharacterArchive({
            id: undefined,
            // 导入默认进当前项目(scope=project);scope=global 也会尊重
            scope: a.scope === "global" ? "global" : "project",
            projectId: a.scope === "global" ? null : projectId,
            name: a.name,
            description: a.description,
            referenceImageAssetIds: [],
            styleContractId: null,
            promptSnippet: a.promptSnippet,
            tags: a.tags,
            agentUseCount: 0,
          });
          okCount++;
        } catch {
          // 静默:单个失败不阻塞其他
        }
      }
      await onReload();
      toast.success(`导入完成(${okCount}/${items.length},已添加到当前项目)`);
    } catch (e: any) {
      toast.error(`导入失败:${e?.message ?? e}`);
    }
  };

  // 顶部条 split 状态
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);

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
          onSelect={handleSelect}
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
        {/* 工具栏(导入 / 导出 split) */}
        <div className="px-4 py-1.5 border-b border-border bg-bg-panel flex items-center justify-end gap-1.5">
          {/* 导入 split-button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowImportMenu((v) => !v);
                setShowExportMenu(false);
              }}
              className="text-[10px] flex items-center gap-0.5 px-2 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover"
              title="从 .json 文件导入档案(只导入到当前项目;不含参考图)"
            >
              <Upload className="w-3 h-3" />
              导入
            </button>
            {showImportMenu && (
              <div className="absolute right-0 top-full mt-1 z-10 bg-bg-panel border border-border rounded shadow-lg overflow-hidden min-w-[180px]">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportMenu(false);
                    void onImportJson();
                  }}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] hover:bg-bg-hover text-left"
                >
                  <Upload className="w-3 h-3" />
                  选择 .json 文件…
                </button>
                <div className="px-3 py-1 text-[10px] text-text-muted border-t border-border">
                  仅当前项目,scope=global 一律落到 project
                </div>
              </div>
            )}
          </div>
          {/* 导出 split-button */}
          <div className="relative">
            <div className="flex">
              <button
                type="button"
                onClick={() => doExport("all")}
                className="text-[10px] flex items-center gap-0.5 px-2 py-0.5 rounded-l text-text-muted hover:text-text-primary hover:bg-bg-hover"
                title="把所有可见档案(项目 + 全局)导出为 .json"
              >
                <Download className="w-3 h-3" />
                导出全部
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExportMenu((v) => !v);
                  setShowImportMenu(false);
                }}
                className="px-1.5 py-0.5 rounded-r border-l border-border/40 text-text-muted hover:text-text-primary hover:bg-bg-hover"
                title="更多导出选项"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 z-10 bg-bg-panel border border-border rounded shadow-lg overflow-hidden min-w-[180px]">
                <button
                  type="button"
                  onClick={() => {
                    setShowExportMenu(false);
                    doExport("project");
                  }}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] hover:bg-bg-hover text-left"
                >
                  <Download className="w-3 h-3" />
                  仅导出项目内档案
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowExportMenu(false);
                    doExport("all");
                  }}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] hover:bg-bg-hover text-left"
                >
                  <Download className="w-3 h-3" />
                  导出全部(含全局)
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {selected ? (
            <CharacterArchiveEditor
              key={selected.id}
              archive={selected}
              assets={assets}
              onDraftChange={onDraftChange}
              onDelete={onDelete}
              onApply={onApply}
              onReferencesChanged={() => void onReload()}
              savingStatus={savingStatus}
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
