import { useEffect, useState } from "react";
import { X, Brain, Trash2, Save, Palette, ChevronDown } from "lucide-react";
import {
  loadAgentContext,
  saveAgentContext,
  type AgentContext,
} from "@/lib/agent-memory";
import {
  loadStyleContract,
  saveStyleContract,
  buildStyleContract,
  type StyleContract,
} from "@/lib/style-contract";
import { useToast } from "@/components/shared/Toast";
import { confirmDialog } from "@/lib/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** 保存/清除后同步到父组件的 in-memory context，避免本次会话继续用旧记忆 */
  onContextChange?: (ctx: AgentContext) => void;
  /** 契约保存后回调（让父组件 reload） */
  onStyleContractChange?: (contract: StyleContract) => void;
}

/**
 * 项目级 Agent Memory 面板
 * - 画风偏好（styleHints）编辑 + 清空
 * - 项目级风格契约（StyleContract）4 字段编辑（折叠 details）
 * - 显示最近用过的模型
 */
export default function AgentMemoryPanel({
  open,
  onClose,
  projectId,
  onContextChange,
  onStyleContractChange,
}: Props) {
  const [ctx, setCtx] = useState<AgentContext | null>(null);
  const [styleHintsText, setStyleHintsText] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // 风格契约（M3：项目级视觉契约，决定 [项目风格契约] 段拼到 prompt 末尾）
  const [contract, setContract] = useState<StyleContract | null>(null);
  const [contractOpen, setContractOpen] = useState(false);
  const [contractSaving, setContractSaving] = useState(false);
  const [contractText, setContractText] = useState<{
    artStyle: string;
    primary: string;
    accent: string;
    background: string;
    lineWeight: "" | "thin" | "medium" | "thick";
    lightDirection: "" | "top" | "top-left" | "left" | "right" | "top-right" | "bottom";
  }>({
    artStyle: "",
    primary: "",
    accent: "",
    background: "",
    lineWeight: "",
    lightDirection: "",
  });

  useEffect(() => {
    if (open) {
      loadAgentContext(projectId).then((c) => {
        setCtx(c);
        setStyleHintsText(c.styleHints.join("、"));
      }).catch(console.error);
      loadStyleContract(projectId).then((c) => {
        setContract(c);
        // 4 字段同步到本地草稿（palette 每组逗号分隔）
        setContractText({
          artStyle: c.art_style ?? "",
          primary: (c.palette?.primary ?? []).join(", "),
          accent: (c.palette?.accent ?? []).join(", "),
          background: (c.palette?.background ?? []).join(", "),
          lineWeight: c.line_weight ?? "",
          lightDirection: c.light_direction ?? "",
        });
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

  const onSaveContract = async () => {
    if (!contract) return;
    setContractSaving(true);
    try {
      const parseColors = (s: string) =>
        s
          .split(/[,,，\s]+/)
          .map((c) => c.trim())
          .filter((c) => /^#?[0-9a-fA-F]{3,8}$/.test(c))
          .map((c) => (c.startsWith("#") ? c : `#${c}`));
      const built = await buildStyleContract({
        version: 1,
        art_style: contractText.artStyle.trim() || undefined,
        palette: {
          primary: parseColors(contractText.primary),
          accent: parseColors(contractText.accent),
          background: parseColors(contractText.background),
        },
        line_weight: contractText.lineWeight || undefined,
        light_direction: contractText.lightDirection || undefined,
        created_at: contract.created_at,
      });
      await saveStyleContract(projectId, built);
      setContract(built);
      onStyleContractChange?.(built);
      toast.success("风格契约已保存");
    } catch (e: any) {
      toast.error(`保存失败：${e?.message ?? e}`);
    } finally {
      setContractSaving(false);
    }
  };

  const onClearContract = async () => {
    if (!contract) return;
    const ok = await confirmDialog("确认清除风格契约？后续生图将不再注入 [项目风格契约] 段。", {
      kind: "warning",
      okLabel: "清除",
    });
    if (!ok) return;
    setContractSaving(true);
    try {
      const empty: StyleContract = { ...contract, checksum: "", art_style: undefined, palette: undefined, line_weight: undefined, light_direction: undefined };
      // saveStyleContract 用 empty 当 JSON：checksum="" 视为"无契约"
      await saveStyleContract(projectId, empty);
      setContract(empty);
      setContractText({ artStyle: "", primary: "", accent: "", background: "", lineWeight: "", lightDirection: "" });
      onStyleContractChange?.(empty);
      toast.success("风格契约已清除");
    } catch (e: any) {
      toast.error(`清除失败：${e?.message ?? e}`);
    } finally {
      setContractSaving(false);
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

          {/* 风格契约：折叠 details,默认收起,避免初次打开面板过载 */}
          {contract && (
            <section className="border border-border rounded-md">
              <button
                type="button"
                onClick={() => setContractOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-bg-hover transition-colors"
              >
                <span className="flex items-center gap-2 text-xs font-medium">
                  <Palette className="w-3.5 h-3.5 text-accent" />
                  项目风格契约
                  {contract.checksum && (
                    <span className="text-[10px] text-text-muted font-mono">
                      {contract.checksum}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-text-muted transition-transform ${contractOpen ? "rotate-180" : ""}`}
                />
              </button>
              {contractOpen && (
                <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border">
                  <div>
                    <label className="text-[11px] text-text-muted mb-1 block">画风</label>
                    <input
                      value={contractText.artStyle}
                      onChange={(e) => setContractText((c) => ({ ...c, artStyle: e.target.value }))}
                      placeholder="例如：二次元厚涂 / 写实 / 美卡"
                      className="input text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-text-muted mb-1 block">
                      主色（逗号分隔 #hex）
                    </label>
                    <input
                      value={contractText.primary}
                      onChange={(e) => setContractText((c) => ({ ...c, primary: e.target.value }))}
                      placeholder="#ff5c4d, #f5a85b"
                      className="input text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-text-muted mb-1 block">辅色</label>
                    <input
                      value={contractText.accent}
                      onChange={(e) => setContractText((c) => ({ ...c, accent: e.target.value }))}
                      placeholder="#5bc2a8"
                      className="input text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-text-muted mb-1 block">背景色</label>
                    <input
                      value={contractText.background}
                      onChange={(e) => setContractText((c) => ({ ...c, background: e.target.value }))}
                      placeholder="#0e0f13, #16181e"
                      className="input text-xs font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-text-muted mb-1 block">线宽</label>
                      <select
                        value={contractText.lineWeight}
                        onChange={(e) => setContractText((c) => ({ ...c, lineWeight: e.target.value as typeof c.lineWeight }))}
                        className="input text-xs"
                      >
                        <option value="">（未指定）</option>
                        <option value="thin">细线</option>
                        <option value="medium">中线</option>
                        <option value="thick">粗线</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-text-muted mb-1 block">光向</label>
                      <select
                        value={contractText.lightDirection}
                        onChange={(e) => setContractText((c) => ({ ...c, lightDirection: e.target.value as typeof c.lightDirection }))}
                        className="input text-xs"
                      >
                        <option value="">（未指定）</option>
                        <option value="top">顶光</option>
                        <option value="top-left">左顶光</option>
                        <option value="left">左侧光</option>
                        <option value="right">右侧光</option>
                        <option value="top-right">右顶光</option>
                        <option value="bottom">底光</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={onClearContract}
                      disabled={contractSaving}
                      className="text-xs text-text-muted hover:text-accent-danger disabled:opacity-40"
                    >
                      清除
                    </button>
                    <button
                      type="button"
                      onClick={onSaveContract}
                      disabled={contractSaving}
                      className="btn btn-primary text-xs h-7 px-2.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {contractSaving ? "保存中..." : "保存契约"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

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
