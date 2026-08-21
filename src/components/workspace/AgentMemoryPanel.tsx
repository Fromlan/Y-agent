import { useEffect, useState } from "react";
import { X, Brain, Trash2, Save } from "lucide-react";
import {
  loadAgentContext,
  saveAgentContext,
  type AgentContext,
} from "@/lib/agent-memory";
import { useToast } from "@/components/shared/Toast";
import { confirmDialog } from "@/lib/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** 保存/清除后同步到父组件的 in-memory context，避免本次会话继续用旧记忆 */
  onContextChange?: (ctx: AgentContext) => void;
}

/**
 * 项目级 Agent Memory 面板
 * - 查看 / 编辑 / 清除风格偏好
 * - 显示最近用过的模型
 * - v0.1 仅支持 styleHints 编辑（手动改 + 一键清除）
 */
export default function AgentMemoryPanel({ open, onClose, projectId, onContextChange }: Props) {
  const [ctx, setCtx] = useState<AgentContext | null>(null);
  const [styleHintsText, setStyleHintsText] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      loadAgentContext(projectId).then((c) => {
        setCtx(c);
        setStyleHintsText(c.styleHints.join("、"));
      }).catch(console.error);
    }
  }, [open, projectId]);

  if (!open || !ctx) return null;

  const onSave = async () => {
    setSaving(true);
    try {
      const next: AgentContext = {
        ...ctx,
        styleHints: styleHintsText
          .split(/[、,，\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 8),
        updatedAt: Date.now(),
      };
      await saveAgentContext(projectId, next);
      setCtx(next);
      onContextChange?.(next);
      toast.success("已保存");
    } catch (e: any) {
      toast.error(`保存失败：${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    const ok = await confirmDialog(
      "确认清除 Agent 记忆？已学到的画风偏好会清空。",
      { kind: "warning", okLabel: "清除" }
    );
    if (!ok) return;
    setSaving(true);
    try {
      const empty: AgentContext = { styleHints: [], recentModels: [], updatedAt: Date.now() };
      await saveAgentContext(projectId, empty);
      setCtx(empty);
      setStyleHintsText("");
      onContextChange?.(empty);
      toast.success("已清除");
    } catch (e: any) {
      toast.error(`清除失败：${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay"
      onClick={onClose}
    >
      <div
        className="panel w-[520px] max-w-[90vw] p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="w-5 h-5 text-accent" />
            Agent 记忆
          </h2>
          <button onClick={onClose} className="btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-text-muted mb-4">
          Agent 学到的画风偏好，会拼到每次对话模式生成的 prompt 末尾。
        </p>

        <div className="space-y-4">
          <section>
            <label className="label">画风偏好</label>
            <input
              value={styleHintsText}
              onChange={(e) => setStyleHintsText(e.target.value)}
              placeholder="例如：厚涂、写实、3:2、暖色调"
              className="input"
            />
          </section>

          <section>
            <label className="label">最近用过的模型</label>
            {ctx.recentModels.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {ctx.recentModels.map((m) => (
                  <span
                    key={m}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-bg-hover text-text-secondary"
                  >
                    {m}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">还没有记录</p>
            )}
          </section>

          {ctx.updatedAt > 0 && (
            <p className="text-[11px] text-text-muted">
              最后更新：{new Date(ctx.updatedAt).toLocaleString("zh-CN")}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <button
            onClick={onClear}
            disabled={saving}
            className="text-xs text-text-muted hover:text-accent-danger flex items-center gap-1 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清除记忆
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn">关闭</button>
            <button onClick={onSave} disabled={saving} className="btn btn-primary">
              <Save className="w-3.5 h-3.5" />
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
