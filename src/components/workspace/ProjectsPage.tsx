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
          <div>
            <h1 className="text-xl font-semibold">项目库</h1>
            <p className="text-xs text-text-muted mt-1">
              每个项目组织一类游戏的美术资产（角色、场景、UI 等）
            </p>
          </div>
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
            <p className="text-text-secondary">还没有项目</p>
            <p className="text-text-muted text-xs mt-1">
              点右上角"新建项目"开始你的第一个项目
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map((p) => (
              <div
                key={p.id}
                className="panel p-4 hover:border-border-strong transition-colors group"
              >
                <button
                  onClick={() => onEnter(p)}
                  className="block w-full text-left"
                  title="双击进入项目"
                >
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-text-muted mt-1">
                    {p.assetCount} 个资产 · {formatTime(p.updatedAt)}
                  </div>
                </button>
                <div className="mt-3 flex items-center justify-between">
                  <button
                    onClick={() => onEnter(p)}
                    className="text-xs text-accent hover:underline flex items-center gap-1"
                  >
                    进入 <ArrowRight className="w-3 h-3" />
                  </button>
                  <div className="flex items-center gap-1">
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
