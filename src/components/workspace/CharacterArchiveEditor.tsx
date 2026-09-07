/**
 * M3 角色档案编辑器（中间栏）
 *
 * 职责：
 * - name / description / promptSnippet 编辑
 * - tags 增删（chips 输入）
 * - 校验失败时实时提示
 * - 顶部"删除" + "复制 id"按钮
 * - 底部"应用到 PromptBar"按钮（close 并把 id 写回 store）
 */
import { useEffect, useMemo, useState } from "react";
import { X, Trash2, Copy, Check, ArrowRight, Plus, Globe, FolderOpen } from "lucide-react";
import type {
  Asset,
  CharacterArchive,
  CharacterArchiveUpsert,
} from "@/lib/types";
import {
  CHARACTER_ARCHIVE_LIMITS,
  validateArchiveUpsert,
} from "@/lib/character-archive";
import CharacterReferenceGrid from "@/components/workspace/CharacterReferenceGrid";

interface Props {
  archive: CharacterArchive;
  /** 项目下所有资产（reference grid 用） */
  assets: Asset[];
  /** 草稿模式：onChange 每次改动都触发，外部自己决定何时落盘 */
  onChange: (patch: Partial<CharacterArchiveUpsert>) => void;
  onDelete: () => void;
  onApply: () => void;
  /** reference 改动后通知上层 reload（拿新 referenceImageAssetIds） */
  onReferencesChanged: () => void;
}

export default function CharacterArchiveEditor({
  archive,
  assets,
  onChange,
  onDelete,
  onApply,
  onReferencesChanged,
}: Props) {
  // 本地草稿态：编辑时实时显示 + onChange 透传
  const [name, setName] = useState(archive.name);
  const [description, setDescription] = useState(archive.description);
  const [promptSnippet, setPromptSnippet] = useState(archive.promptSnippet);
  const [tagsInput, setTagsInput] = useState("");
  const [tags, setTags] = useState<string[]>(archive.tags);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // archive 切换时重置本地草稿
  useEffect(() => {
    setName(archive.name);
    setDescription(archive.description);
    setPromptSnippet(archive.promptSnippet);
    setTags(archive.tags);
    setTagsInput("");
    setConfirmDelete(false);
  }, [archive.id, archive.name, archive.description, archive.promptSnippet, archive.tags]);

  // 校验：把所有字段组合成 upsert，跑 validateArchiveUpsert
  const validation = useMemo(() => {
    return validateArchiveUpsert({
      id: archive.id,
      scope: archive.scope,
      projectId: archive.projectId,
      name,
      description,
      referenceImageAssetIds: archive.referenceImageAssetIds,
      styleContractId: archive.styleContractId,
      promptSnippet,
      tags,
      agentUseCount: archive.agentUseCount,
    });
  }, [
    archive.id,
    archive.scope,
    archive.projectId,
    archive.referenceImageAssetIds,
    archive.styleContractId,
    archive.agentUseCount,
    name,
    description,
    promptSnippet,
    tags,
  ]);

  // 名字 / 描述 / snippet 实时 onChange 上去（让外部 store 保持最新）
  useEffect(() => {
    onChange({ name, description, promptSnippet, tags });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, description, promptSnippet, tags]);

  const addTagFromInput = () => {
    const t = tagsInput.trim();
    if (!t) return;
    if (tags.includes(t)) {
      setTagsInput("");
      return;
    }
    if (tags.length >= CHARACTER_ARCHIVE_LIMITS.MAX_TAGS) {
      return;
    }
    if (t.length > CHARACTER_ARCHIVE_LIMITS.MAX_TAG_LENGTH) {
      return;
    }
    setTags([...tags, t]);
    setTagsInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const onCopyId = async () => {
    try {
      await navigator.clipboard.writeText(archive.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 忽略：旧浏览器或权限拒绝
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg">
      {/* 顶部条：scope badge + id + 操作 */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-2 bg-bg-panel">
        <span
          className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
            archive.scope === "global"
              ? "bg-accent/10 text-accent"
              : "bg-bg-hover text-text-secondary"
          }`}
          title={archive.scope === "global" ? "全局档案：跨项目可见" : "项目档案：仅本项目可见"}
        >
          {archive.scope === "global" ? (
            <Globe className="w-3 h-3" />
          ) : (
            <FolderOpen className="w-3 h-3" />
          )}
          {archive.scope === "global" ? "全局" : "项目"}
        </span>
        <span className="text-[10px] text-text-muted font-mono">
          {archive.id.slice(0, 8)}…
        </span>
        <button
          type="button"
          onClick={onCopyId}
          className="text-[10px] text-text-muted hover:text-text-primary flex items-center gap-0.5"
          title="复制完整 id"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "已复制" : "复制 id"}
        </button>
        <div className="flex-1" />
        {confirmDelete ? (
          <>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-[10px] px-2 py-0.5 rounded text-text-secondary hover:text-text-primary"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
            >
              确认删除
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-[10px] text-text-muted hover:text-red-400 flex items-center gap-0.5"
            title="删除档案（不会删除参考图本身）"
          >
            <Trash2 className="w-3 h-3" />
            删除
          </button>
        )}
      </div>

      {/* 主表单 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* name */}
        <div>
          <label className="text-[11px] font-medium text-text-secondary mb-1 block">
            档案名 <span className="text-red-400">*</span>
            <span className="ml-1 text-text-muted">
              {name.length}/{CHARACTER_ARCHIVE_LIMITS.MAX_NAME_LENGTH}
            </span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：红发火焰法师"
            className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-panel text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* description */}
        <div>
          <label className="text-[11px] font-medium text-text-secondary mb-1 block">
            描述
            <span className="ml-1 text-text-muted">
              {description.length}/{CHARACTER_ARCHIVE_LIMITS.MAX_DESCRIPTION_LENGTH}
            </span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例：20 岁女性，火焰系魔法，红发，左手持法杖"
            rows={3}
            className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-panel text-text-primary focus:outline-none focus:ring-1 focus:ring-accent resize-none"
          />
        </div>

        {/* tags */}
        <div>
          <label className="text-[11px] font-medium text-text-secondary mb-1 block">
            标签
            <span className="ml-1 text-text-muted">
              {tags.length}/{CHARACTER_ARCHIVE_LIMITS.MAX_TAGS}
            </span>
          </label>
          <div className="flex flex-wrap gap-1 mb-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded bg-accent/10 text-accent"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:text-red-400"
                  title="移除"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {tags.length < CHARACTER_ARCHIVE_LIMITS.MAX_TAGS && (
              <div className="inline-flex items-center gap-0.5">
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTagFromInput();
                    } else if (e.key === "Backspace" && !tagsInput && tags.length > 0) {
                      setTags(tags.slice(0, -1));
                    }
                  }}
                  placeholder="输入标签后回车"
                  className="w-24 text-[11px] px-1.5 py-0.5 rounded border border-border bg-bg-panel text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={addTagFromInput}
                  className="text-text-muted hover:text-accent"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* promptSnippet */}
        <div>
          <label className="text-[11px] font-medium text-text-secondary mb-1 block">
            Prompt 片段（可选）
            <span className="ml-1 text-text-muted">追加到 [风格契约] 之后</span>
            <span className="ml-1 text-text-muted">
              {promptSnippet.length}/{CHARACTER_ARCHIVE_LIMITS.MAX_PROMPT_SNIPPET_LENGTH}
            </span>
          </label>
          <textarea
            value={promptSnippet}
            onChange={(e) => setPromptSnippet(e.target.value)}
            placeholder="例：表情要夸张，口型要清晰"
            rows={2}
            className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-panel text-text-primary focus:outline-none focus:ring-1 focus:ring-accent resize-none"
          />
        </div>

        {/* 参考图（CharacterReferenceGrid — M3.1.4 接 attach/detach IPC） */}
        <CharacterReferenceGrid
          archive={archive}
          assets={assets}
          onChanged={onReferencesChanged}
        />

        {/* 校验错误 */}
        {validation && (
          <div className="text-[11px] text-red-400 px-2 py-1.5 bg-red-500/10 rounded">
            {validation}
          </div>
        )}
      </div>

      {/* 底部：应用按钮 */}
      <div className="px-4 py-2 border-t border-border bg-bg-panel flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={!!validation}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-accent text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          title="把这个档案设到 PromptBar（需要 PromptBar 在 chat / generate 模式）"
        >
          应用到 PromptBar
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
