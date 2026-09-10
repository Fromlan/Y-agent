import { X } from "lucide-react";
import { TOOLS, type ToolKind } from "./tool-constants";
import type { Asset } from "@/lib/types";
import type { ToolProgress } from "./runTool";
import BatchForm from "./BatchForm";
import WebSearchForm from "./WebSearchForm";
import TransparentForm from "./TransparentForm";
import LayerForm from "./LayerForm";
import LocalEditForm from "./LocalEditForm";
import SplitSpriteForm from "./SplitSpriteForm";
import { ProgressBar } from "./ProgressBar";

interface ToolModalProps {
  kind: ToolKind;
  projectId: string;
  assets: Asset[];
  busy: boolean;
  progress: ToolProgress | null;
  onClose: () => void;
  onRun: (fn: (onProgress: (p: ToolProgress) => void) => Promise<Asset>) => void;
}

export function ToolModal({ kind, projectId, assets, busy, progress, onClose, onRun }: ToolModalProps) {
  const def = TOOLS.find((t) => t.id === kind)!;
  const Icon = def.icon;
  return (
    <div
      className="fixed inset-0 z-50 bg-bg-overlay flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="panel w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-medium">{def.title}</h3>
            <span className="text-[10px] text-text-muted">{def.tag}</span>
          </div>
          <button onClick={onClose} disabled={busy} className="btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {kind === "batch" && <BatchForm projectId={projectId} onRun={onRun} busy={busy} />}
          {kind === "websearch" && (
            <WebSearchForm projectId={projectId} onRun={onRun} busy={busy} />
          )}
          {kind === "transparent" && (
            <TransparentForm
              projectId={projectId}
              assets={assets}
              onRun={onRun}
              busy={busy}
            />
          )}
          {kind === "layers" && (
            <LayerForm projectId={projectId} assets={assets} onRun={onRun} busy={busy} />
          )}
          {kind === "localedit" && (
            <LocalEditForm
              projectId={projectId}
              assets={assets}
              onRun={onRun}
              busy={busy}
            />
          )}
          {kind === "splitsprite" && <SplitSpriteForm busy={busy} />}
        </div>
        {progress && (
          <ProgressBar progress={progress} />
        )}
      </div>
    </div>
  );
}

export default ToolModal;
