import { useState } from "react";
import {
  ArrowUp,
  Settings as SettingsIcon,
} from "lucide-react";
import type { Asset } from "@/lib/types";
import { useToast } from "@/components/shared/Toast";
import { explainError } from "@/lib/jimeng";
import ToolModal from "./tools/ToolModal";
import type { ToolProgress } from "./tools/runTool";
import { TOOLS, type ToolKind } from "./tools/tool-constants";

interface Props {
  projectId: string;
  assets: Asset[];
  onAssetCreated: (asset: Asset) => void;
  hasKey: boolean | null;
  onOpenSettings: () => void;
}

/**
 * Tools Tab 顶层：6 个工具的网格 + 选中后弹出 ToolModal。
 *
 * 所有具体 Form（Batch / WebSearch / Transparent / Layer / LocalEdit / SplitSprite）
 * 已拆到 `./tools/<Form>.tsx`；本文件只负责：
 *   - API Key 缺失提示
 *   - 工具网格（TOOLS 列表驱动）
 *   - runAndClose：把 runTool 的 onProgress 转给 ProgressBar，
 *     完成/失败后通知父组件 + 收尾 busy 标志
 */
export default function ToolsTab({
  projectId,
  assets,
  onAssetCreated,
  hasKey,
  onOpenSettings,
}: Props) {
  const toast = useToast();
  const [active, setActive] = useState<ToolKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ToolProgress | null>(null);

  const onClose = () => {
    if (busy) return;
    setActive(null);
    setProgress(null);
  };

  const runAndClose = async (
    kind: ToolKind,
    fn: (onProgress: (p: ToolProgress) => void) => Promise<Asset>
  ) => {
    if (hasKey === false) {
      onOpenSettings();
      return;
    }
    setBusy(true);
    setProgress({ phase: "requesting", message: "准备中…" });
    try {
      const asset = await fn((p) => setProgress(p));
      onAssetCreated(asset);
      toast.success(`已生成并入库：${TOOLS.find((t) => t.id === kind)?.title ?? ""}`);
      // 短延迟让用户看到 "done" 状态再关
      setTimeout(() => {
        setActive(null);
        setProgress(null);
      }, 600);
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      const friendly = await explainError(raw).catch(() => raw);
      toast.error(friendly);
      setProgress({ phase: "error", message: friendly });
      // 错误状态也保留一会儿，让用户看清楚
      setTimeout(() => setBusy(false), 1500);
      return;
    }
    setBusy(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <h2 className="text-base font-medium">工具</h2>

        {hasKey === false && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-md border text-xs"
            style={{
              backgroundColor: "color-mix(in srgb, var(--status-warn) 8%, transparent)",
              borderColor: "color-mix(in srgb, var(--status-warn) 28%, transparent)",
            }}
          >
            <span className="flex-1 text-text-secondary">
              还没配置即梦 API Key。
            </span>
            <button
              onClick={onOpenSettings}
              className="px-2 py-0.5 rounded text-xs font-medium hover:opacity-80 flex items-center gap-1"
              style={{
                color: "var(--status-warn)",
                backgroundColor: "color-mix(in srgb, var(--status-warn) 18%, transparent)",
              }}
            >
              <SettingsIcon className="w-3 h-3" /> 打开设置
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TOOLS.map(({ id, title, desc, icon: Icon, tag }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              disabled={hasKey === false}
              className="panel p-4 text-left space-y-2 hover:border-accent transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-start justify-between">
                <Icon className="w-5 h-5 text-accent" />
                <span className="text-[10px] text-text-muted uppercase tracking-wider">
                  {tag}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-medium">{title}</h3>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">{desc}</p>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                打开 <ArrowUp className="w-3 h-3 rotate-90" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {active && (
        <ToolModal
          kind={active}
          onClose={onClose}
          busy={busy}
          progress={progress}
          projectId={projectId}
          assets={assets}
          onRun={(fn: (onProgress: (p: ToolProgress) => void) => Promise<Asset>) => runAndClose(active, fn)}
        />
      )}
    </div>
  );
}
