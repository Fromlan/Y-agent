import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageIcon, RefreshCw, Filter } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { useSession } from "@/lib/session";
import { listProjects } from "@/lib/projects";
import { listAssets, deleteAsset } from "@/lib/assets";
import { confirmDialog } from "@/lib/dialog";
import type { Asset, Project } from "@/lib/types";
import AssetBoard from "@/components/workspace/AssetBoard";

/**
 * 资产中心（全局视图）
 * - 聚合所有项目下的资产，复用 AssetBoard 的工具条 / 卡片 / 详情
 * - 顶部加一条"按项目筛选"chip
 * - 顶部加总览统计（资产数 / 涉及项目数 / 模型数）
 * - 删除资产后自动 reload
 */
export default function AssetCenterPage() {
  const toast = useToast();
  const { setCurrentProject } = useSession();

  const [projects, setProjects] = useState<Project[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  const projectNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ps = await listProjects();
      setProjects(ps);
      // 聚合：每个项目查一次，失败的项目用空数组占位（不阻塞其它项目）
      const lists = await Promise.all(
        ps.map((p) =>
          listAssets(p.id)
            .then((arr) => arr)
            .catch((e) => {
              console.warn(`load assets for project ${p.id} failed:`, e);
              return [] as Asset[];
            })
        )
      );
      setAssets(lists.flat());
    } catch (e: any) {
      console.error(e);
      toast.error(`加载资产中心失败：${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // 外部按项目筛选；项目数变化时（load 后）如果之前选的项目已不存在则清理选中
  useEffect(() => {
    setSelectedProjectIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set<string>();
      for (const id of prev) if (projectNameById.has(id)) valid.add(id);
      return valid;
    });
  }, [projectNameById]);

  const filteredAssets = useMemo(() => {
    if (selectedProjectIds.size === 0) return assets;
    return assets.filter((a) => selectedProjectIds.has(a.projectId));
  }, [assets, selectedProjectIds]);

  // 总览统计（基于未筛选的总量，体现"全局"信息）
  const stats = useMemo(() => {
    const modelSet = new Set<string>();
    let layerCount = 0;
    let refCount = 0;
    for (const a of assets) {
      modelSet.add(a.model);
      if (a.isLayerDecomposition) layerCount++;
      if (a.refCount > 0) refCount++;
    }
    return {
      total: assets.length,
      projectCount: new Set(assets.map((a) => a.projectId)).size,
      modelCount: modelSet.size,
      layerCount,
      refCount,
    };
  }, [assets]);

  const onCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("已复制 prompt"),
      () => toast.error("复制失败")
    );
  };

  const onDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const onDelete = async (id: string) => {
    const ok = await confirmDialog("确认删除这个资产？", { okLabel: "删除" });
    if (!ok) return;
    try {
      await deleteAsset(id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
      toast.success("已删除");
    } catch (e: any) {
      toast.error(`删除失败：${e?.message ?? e}`);
    }
  };

  const onBatchDelete = async (ids: string[]) => {
    // 逐个删（后端目前没有 batch 接口）
    for (const id of ids) {
      await deleteAsset(id);
    }
    setAssets((prev) => prev.filter((a) => !ids.includes(a.id)));
  };

  const toggleProject = (id: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearProjectFilter = () => setSelectedProjectIds(new Set());

  const onJumpToProject = (id: string) => {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    setCurrentProject(p);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 顶部栏：标题 + 总览统计 + 刷新 */}
      <header className="h-12 flex items-center px-4 border-b border-border flex-shrink-0 gap-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-accent" />
          <h1 className="text-sm font-semibold text-text-primary">资产中心</h1>
          <span className="text-[10px] text-text-muted">跨项目聚合</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-text-secondary">
          <Stat label="资产" value={stats.total} />
          <span className="text-text-muted">·</span>
          <Stat label="项目" value={stats.projectCount} />
          <span className="text-text-muted">·</span>
          <Stat label="模型" value={stats.modelCount} />
          {stats.layerCount > 0 && (
            <>
              <span className="text-text-muted">·</span>
              <Stat label="图层" value={stats.layerCount} accent />
            </>
          )}
        </div>
        <div className="flex-1" />
        <button
          onClick={load}
          disabled={loading}
          className="btn text-xs h-7 px-2.5"
          title="刷新"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </header>

      {/* 项目筛选条 */}
      {projects.length > 0 && (
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-shrink-0 overflow-x-auto">
          <Filter className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <span className="text-[10px] text-text-muted uppercase tracking-wider flex-shrink-0">
            项目
          </span>
          <Chip active={selectedProjectIds.size === 0} onClick={clearProjectFilter}>
            全部
          </Chip>
          {projects.map((p) => {
            const count = assets.filter((a) => a.projectId === p.id).length;
            return (
              <Chip
                key={p.id}
                active={selectedProjectIds.has(p.id)}
                onClick={() => toggleProject(p.id)}
                title={`${p.name} · ${count} 个资产`}
              >
                {p.name}
                <span className="ml-1 text-text-muted">{count}</span>
              </Chip>
            );
          })}
        </div>
      )}

      {/* 主体：复用 AssetBoard（搜索/视图/批量/详情都在它内部） */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && assets.length === 0 ? (
          <div className="h-full flex items-center justify-center text-text-muted text-sm">
            加载中…
          </div>
        ) : projects.length === 0 ? (
          <EmptyNoProject onJumpToProject={onJumpToProject} />
        ) : (
          <AssetBoard
            assets={filteredAssets}
            onCopyPrompt={onCopyPrompt}
            onDownload={onDownload}
            onDelete={onDelete}
            onBatchDelete={onBatchDelete}
          />
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-text-muted">{label}</span>
      <b className={accent ? "text-accent" : "text-text-primary"}>{value}</b>
    </span>
  );
}

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`text-xs h-6 px-2 rounded-md border transition-colors flex items-center gap-1 flex-shrink-0
        ${
          active
            ? "bg-accent/20 border-accent text-accent"
            : "bg-bg-elev border-border text-text-secondary hover:text-text-primary hover:border-border-strong"
        }`}
    >
      {children}
    </button>
  );
}

function EmptyNoProject({ onJumpToProject: _ }: { onJumpToProject: (id: string) => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center min-h-[300px]">
      <div className="w-16 h-16 rounded-2xl bg-bg-elev flex items-center justify-center mb-4">
        <ImageIcon className="w-7 h-7 text-text-muted" />
      </div>
      <h2 className="text-base font-medium mb-1">还没有任何项目</h2>
      <p className="text-text-secondary text-xs">先去项目库创建一个项目，再开始生成资产</p>
    </div>
  );
}
