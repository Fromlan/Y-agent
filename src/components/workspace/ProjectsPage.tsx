import { useCallback, useEffect, useState } from "react";
import { FolderPlus, Trash2, FolderOpen, Pencil, ArrowRight } from "lucide-react";
import { listProjects, createProject, deleteProject, renameProject } from "@/lib/projects";
import { useToast } from "@/components/shared/Toast";
import { usePrompt } from "@/components/shared/PromptProvider";
import { useSession } from "@/lib/session";
import { confirmDialog } from "@/lib/dialog";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const { setCurrentProject } = useSession();
  const toast = useToast();
  const prompt = usePrompt();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listProjects());
    } catch (e: any) {
      toast.error(`加载项目失败：${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onCreate = async () => {
    const name = await prompt("项目名称", { defaultValue: "未命名项目", okLabel: "创建" });
    if (!name?.trim()) return;
    try {
      await createProject(name.trim());
      toast.success("项目已创建");
      reload();
    } catch (e: any) {
      toast.error(`创建失败：${e?.message ?? e}`);
    }
  };

  const onDelete = async (id: string, name: string) => {
    const ok = await confirmDialog(
      `确认删除项目「${name}」？\n项目内的所有资产也会被删除。此操作不可恢复。`,
      { kind: "warning", okLabel: "删除" }
    );
    if (!ok) return;
    try {
      await deleteProject(id);
      toast.success("已删除");
      reload();
    } catch (e: any) {
      toast.error(`删除失败：${e?.message ?? e}`);
    }
  };

  const onRename = async (id: string, currentName: string) => {
    const name = await prompt("新项目名", { defaultValue: currentName });
    if (!name?.trim() || name.trim() === currentName) return;
    try {
      await renameProject(id, name.trim());
      toast.success("已重命名");
      reload();
    } catch (e: any) {
      toast.error(`重命名失败：${e?.message ?? e}`);
    }
  };

  const onEnter = (p: Project) => {
    setCurrentProject(p);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">项目库</h1>
          <button onClick={onCreate} className="btn btn-primary">
            <FolderPlus className="w-4 h-4" />
            新建项目
          </button>
        </div>

        {loading ? (
          <p className="text-text-secondary text-sm">加载中...</p>
        ) : items.length === 0 ? (
          <div className="panel p-8 text-center">
            <FolderOpen className="w-10 h-10 mx-auto text-text-muted mb-3" />
            <p className="text-text-secondary mb-4">还没有项目</p>
            <button onClick={onCreate} className="btn btn-primary">
              <FolderPlus className="w-4 h-4" />
              新建项目
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => onEnter(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEnter(p);
                  }
                }}
                className="panel p-4 hover:border-accent/40 hover:bg-bg-hover/40
                  transition-colors group cursor-pointer relative"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-text-muted mt-1">
                      {p.assetCount} 个资产 · {formatTime(p.updatedAt)}
                    </div>
                  </div>
                  <ArrowRight
                    className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100
                      transition-opacity flex-shrink-0 mt-0.5"
                  />
                </div>
                {/* 底部操作按钮：stopPropagation 避免触发卡片进入 */}
                <div
                  className="mt-3 flex items-center justify-end gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onRename(p.id, p.name)}
                    className="btn-icon p-1"
                    title="重命名"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(p.id, p.name)}
                    className="btn-icon p-1 hover:text-accent-danger"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(t: number): string {
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return new Date(t).toLocaleDateString("zh-CN");
}
