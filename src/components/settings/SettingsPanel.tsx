import { useEffect, useState } from "react";
import { X, Eye, EyeOff, FlaskConical, Brain, Activity, Palette, Database } from "lucide-react";
import { getApiKey, setApiKey, clearApiKey } from "@/lib/api-key";
import { getPref, setPref } from "@/lib/prefs";
import { useToast } from "@/components/shared/Toast";
import { MODEL_OPTIONS, modelCapabilities, type ModelOption } from "@/lib/types";
import { loadLlmConfig, saveLlmConfig, presetConfig } from "@/lib/llm-config";
import { LLM_PRESETS, type LLMConfig } from "@/lib/llm";
import { confirmDialog } from "@/lib/dialog";
import { APP_NAME, APP_VERSION, BUILD_TAG } from "@/lib/app-info";
import { listProjects } from "@/lib/projects";
import { listAssets, backfillOutputFormat } from "@/lib/assets";
import ThemePicker from "@/components/settings/ThemePicker";
import type { Asset } from "@/lib/types";

const PREF_DEFAULT_MODEL = "default_model";
const PREF_DEFAULT_SIZE = "default_size";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: Props) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [defaultModel, setDefaultModel] = useState<ModelOption>(MODEL_OPTIONS[0]);
  const [defaultSize, setDefaultSize] = useState("2k");
  // LLM 配置
  const [llmProvider, setLlmProvider] = useState<keyof typeof LLM_PRESETS>("deepseek");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmEndpoint, setLlmEndpoint] = useState(LLM_PRESETS.deepseek.endpoint);
  const [llmModel, setLlmModel] = useState(LLM_PRESETS.deepseek.model); // v4-flash（2026 默认）
  const [llmConfigured, setLlmConfigured] = useState(false);
  // P5：今日用量（最近 24h 内的 usage 聚合）
  const [usage24h, setUsage24h] = useState<{
    generated: number;
    outputTokens: number;
    totalTokens: number;
    assets: number;
  } | null>(null);
  // P6+：回填 outputFormat 报告
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillReport, setBackfillReport] = useState<{
    scanned: number;
    missing: number;
    updated: number;
    skipped: number;
  } | null>(null);
  const toast = useToast();

  // 默认模型切换后，若默认尺寸不在新模型的能力矩阵里，自动切到第一个可用档位
  useEffect(() => {
    const presets = modelCapabilities(defaultModel.id).sizePresets;
    if (presets.length > 0 && !presets.includes(defaultSize)) {
      setDefaultSize(presets[0]);
    }
  }, [defaultModel.id, defaultSize]);

  useEffect(() => {
    if (open) {
      getApiKey()
        .then((k) => {
          setKey(k ?? "");
          setHasKey(!!k);
        })
        .catch(console.error);
      // P5：聚合近 24h 用量（按 asset.createdAt 过滤）
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      Promise.all([listProjects()])
        .then(async ([projects]) => {
          const allAssets: Asset[] = (
            await Promise.all(
              projects.map((p) =>
                listAssets(p.id)
                  .then((arr) => arr)
                  .catch(() => [] as Asset[])
              )
            )
          ).flat();
          const recent = allAssets.filter((a) => a.createdAt >= cutoff);
          let generated = 0;
          let outputTokens = 0;
          let totalTokens = 0;
          for (const a of recent) {
            const u = a.payload.usage;
            if (!u) continue;
            generated += u.generatedImages ?? 0;
            outputTokens += u.outputTokens ?? 0;
            totalTokens += u.totalTokens ?? 0;
          }
          setUsage24h({
            generated,
            outputTokens,
            totalTokens,
            assets: recent.length,
          });
        })
        .catch((e) => {
          console.warn("usage24h load failed:", e);
          setUsage24h(null);
        });
      getPref(PREF_DEFAULT_MODEL).then((v) => {
        if (v) {
          const m = MODEL_OPTIONS.find((o) => o.id === v);
          if (m) setDefaultModel(m);
        }
      }).catch(console.error);
      getPref(PREF_DEFAULT_SIZE).then((v) => {
        if (v) setDefaultSize(v);
      }).catch(console.error);
      loadLlmConfig().then((c) => {
        if (c) {
          setLlmProvider((c.provider as keyof typeof LLM_PRESETS) ?? "deepseek");
          setLlmApiKey(c.apiKey);
          setLlmEndpoint(c.endpoint);
          setLlmModel(c.model);
          setLlmConfigured(true);
        } else {
          setLlmConfigured(false);
        }
      }).catch(console.error);
    }
  }, [open]);

  // 切换 provider 时自动填默认 endpoint / model
  const onProviderChange = (p: keyof typeof LLM_PRESETS) => {
    setLlmProvider(p);
    if (p !== "custom" && LLM_PRESETS[p]) {
      setLlmEndpoint(LLM_PRESETS[p].endpoint);
      setLlmModel(LLM_PRESETS[p].model);
    }
  };

  if (!open) return null;

  const onSave = async () => {
    if (!key.trim()) {
      toast.warn("请输入 API Key");
      return;
    }
    setSaving(true);
    try {
      await setApiKey(key.trim());
      await setPref(PREF_DEFAULT_MODEL, defaultModel.id);
      await setPref(PREF_DEFAULT_SIZE, defaultSize);
      // LLM 配置（可选）：若填了 key 就保存
      if (llmApiKey.trim()) {
        const cfg: LLMConfig = llmProvider === "custom"
          ? { provider: "custom", apiKey: llmApiKey.trim(), endpoint: llmEndpoint.trim(), model: llmModel.trim() }
          : presetConfig(llmProvider, llmApiKey.trim());
        await saveLlmConfig(cfg);
        setLlmConfigured(true);
      } else {
        await saveLlmConfig(null);
        setLlmConfigured(false);
      }
      toast.success("已保存");
      setHasKey(true);
      onClose();
    } catch (e: any) {
      toast.error(`保存失败：${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    const ok = await confirmDialog("确认清除 API Key？", { kind: "warning", okLabel: "清除" });
    if (!ok) return;
    try {
      await clearApiKey();
      setKey("");
      setHasKey(false);
      toast.success("已清除");
    } catch (e: any) {
      toast.error(`清除失败：${e?.message ?? e}`);
    }
  };

  const onEnableDemo = async () => {
    setSaving(true);
    try {
      const demoKey = `demo-${Date.now().toString(36)}`;
      await setApiKey(demoKey);
      await setPref(PREF_DEFAULT_MODEL, defaultModel.id);
      await setPref(PREF_DEFAULT_SIZE, defaultSize);
      toast.success("Demo 模式已启用");
      setHasKey(true);
      onClose();
    } catch (e: any) {
      toast.error(`启用失败：${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  // P6+：回填老资产的 payload.outputFormat 字段
  //  - 修复 P4 之前入库的资产（详情页"格式"显示 "—"）
  //  - 推断规则：transparent → png；URL 末尾 .png/.jpg/.jpeg → 对应格式
  //  - 已有字段会跳过，URL 没扩展名（火山方舟 jfs/tos 内部路径）也会跳过
  const onBackfillOutputFormat = async () => {
    if (backfillBusy) return;
    const ok = await confirmDialog(
      "扫描所有项目，缺 outputFormat 的资产按 URL 扩展名回填。已有字段不动。是否继续？",
      { kind: "info", okLabel: "开始回填" }
    );
    if (!ok) return;
    setBackfillBusy(true);
    try {
      const r = await backfillOutputFormat();
      setBackfillReport(r);
      toast.success(
        `回填完成：扫描 ${r.scanned} 条，缺字段 ${r.missing} 条，已更新 ${r.updated} 条，跳过 ${r.skipped} 条`
      );
    } catch (e: any) {
      toast.error(`回填失败：${e?.message ?? e}`);
    } finally {
      setBackfillBusy(false);
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
          <h2 className="text-lg font-semibold">设置</h2>
          <button onClick={onClose} className="btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* 外观主题 */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" />
              外观主题
            </h3>
            <ThemePicker />
          </section>

          {/* 默认偏好 */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              默认偏好
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">默认模型</label>
                <select
                  value={defaultModel.id}
                  onChange={(e) => {
                    const m = MODEL_OPTIONS.find((o) => o.id === e.target.value);
                    if (m) setDefaultModel(m);
                  }}
                  className="input"
                >
                  {MODEL_OPTIONS.filter((o) => o.id !== "CUSTOM").map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">默认尺寸</label>
                <select
                  value={defaultSize}
                  onChange={(e) => setDefaultSize(e.target.value)}
                  className="input"
                >
                  {(modelCapabilities(defaultModel.id).sizePresets ?? [])?.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  )) ?? <option value="2k">2k</option>}
                </select>
              </div>
            </div>
          </section>

          {/* API Key */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              API Key
            </h3>
            <div>
              <label className="label flex items-center justify-between">
                <span>即梦（豆包 Seedream）API Key</span>
                {hasKey && (
                  <span className="text-[10px] text-accent-success">● 已配置</span>
                )}
              </label>
              <div className="relative mt-1.5">
                <input
                  type={show ? "text" : "password"}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="ark-..."
                  className="input pr-10"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-text-muted mt-1.5">
                在
                <a
                  className="text-accent hover:underline mx-1"
                  href="https://console.volcengine.com/ark/region:cn-beijing/apiKey"
                  target="_blank"
                  rel="noreferrer"
                >
                  火山方舟控制台
                </a>
                获取 Key。
              </p>
            </div>
          </section>

          {/* Agent LLM（v0.2 新增） */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              今日用量（最近 24h）
            </h3>
            {usage24h ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-bg-elev border border-border rounded-md p-2">
                  <div className="text-text-muted text-[10px] mb-0.5">生成图</div>
                  <div className="text-text-primary text-base font-semibold tabular-nums">
                    {usage24h.generated}
                    <span className="text-text-muted text-[10px] ml-1">张</span>
                  </div>
                </div>
                <div className="bg-bg-elev border border-border rounded-md p-2">
                  <div className="text-text-muted text-[10px] mb-0.5">任务</div>
                  <div className="text-text-primary text-base font-semibold tabular-nums">
                    {usage24h.assets}
                    <span className="text-text-muted text-[10px] ml-1">次</span>
                  </div>
                </div>
                <div className="bg-bg-elev border border-border rounded-md p-2 col-span-2">
                  <div className="text-text-muted text-[10px] mb-0.5">Token 消耗</div>
                  <div className="text-text-primary tabular-nums">
                    <span className="font-semibold">{usage24h.totalTokens.toLocaleString()}</span>
                    <span className="text-text-muted text-[10px] ml-1">总计</span>
                    {usage24h.outputTokens > 0 && (
                      <span className="text-text-muted text-[10px] ml-2">
                        (输出 {usage24h.outputTokens.toLocaleString()})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-muted">加载中…</p>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5" />
              Agent LLM（用于对话）
              {llmConfigured && (
                <span className="text-[10px] text-accent-success ml-1">● 已配置</span>
              )}
            </h3>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Provider</label>
                  <select
                    className="input"
                    value={llmProvider}
                    onChange={(e) => onProviderChange(e.target.value as keyof typeof LLM_PRESETS)}
                  >
                    <option value="deepseek">{LLM_PRESETS.deepseek.name}</option>
                    <option value="doubao">{LLM_PRESETS.doubao.name}</option>
                    <option value="openai">{LLM_PRESETS.openai.name}</option>
                    <option value="custom">自定义 OpenAI 兼容</option>
                  </select>
                </div>
                <div>
                  <label className="label">Model</label>
                  <input
                    className="input"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    placeholder="deepseek-chat"
                  />
                </div>
              </div>
              <div>
                <label className="label">API Key</label>
                <input
                  type="password"
                  className="input"
                  value={llmApiKey}
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  placeholder={llmProvider === "deepseek" ? "sk-..." : "API Key"}
                  autoComplete="off"
                />
              </div>
              {llmProvider === "custom" && (
                <div>
                  <label className="label">Endpoint URL</label>
                  <input
                    className="input"
                    value={llmEndpoint}
                    onChange={(e) => setLlmEndpoint(e.target.value)}
                    placeholder="https://your-api.com/v1/chat/completions"
                  />
                </div>
              )}
              <p className="text-[11px] text-text-muted">
                留空则退到规则路由（不真对话，只展示计划）。
                {llmProvider === "deepseek" && (
                  <> 在 <a className="text-accent hover:underline mx-1" href="https://platform.deepseek.com/" target="_blank" rel="noreferrer">DeepSeek 平台</a> 注册免费拿 Key。</>
                )}
              </p>
            </div>
          </section>

          {/* 数据维护（P6+：outputFormat 回填） */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              数据维护
            </h3>
            <div className="space-y-2">
              <button
                onClick={onBackfillOutputFormat}
                disabled={backfillBusy}
                className="btn"
              >
                {backfillBusy ? "回填中…" : "回填 outputFormat 字段"}
              </button>
              {backfillReport && (
                <div className="text-[11px] text-text-muted bg-bg-elev border border-border rounded-md p-2 space-y-0.5">
                  <div>扫描：<span className="text-text-primary tabular-nums">{backfillReport.scanned}</span> 条</div>
                  <div>缺字段：<span className="text-text-primary tabular-nums">{backfillReport.missing}</span> 条</div>
                  <div>已更新：<span className="text-accent-success tabular-nums">{backfillReport.updated}</span> 条</div>
                  <div>跳过（已有 / 无法推断）：<span className="text-text-primary tabular-nums">{backfillReport.skipped}</span> 条</div>
                </div>
              )}
              <p className="text-[10px] text-text-muted/70">
                一次性操作，已有字段不动。
              </p>
            </div>
          </section>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <button
              onClick={onClear}
              disabled={!hasKey}
              className="text-xs text-text-muted hover:text-accent-danger disabled:opacity-40"
            >
              清除 Key
            </button>
            <div className="flex gap-2">
              {!hasKey && (
                <button onClick={onEnableDemo} disabled={saving} className="btn">
                  <FlaskConical className="w-3.5 h-3.5" />
                  试用 Demo 模式
                </button>
              )}
              <button onClick={onClose} className="btn">取消</button>
              <button onClick={onSave} disabled={saving} className="btn btn-primary">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>

        {/* 关于 */}
        <div className="border-t border-border px-5 py-3 flex items-center justify-between text-[11px] text-text-muted bg-bg-elev/40">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="Y-agent" className="w-5 h-5" />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-text-primary text-xs">{APP_NAME}</span>
              <span className="text-text-muted tracking-wide">
                Make · Iterate · Ship
              </span>
            </div>
          </div>
          <span className="font-mono" title="v0.1.0 = package.json / build-tag = git + 时间">
            v{APP_VERSION} · {BUILD_TAG}
          </span>
        </div>
      </div>
    </div>
  );
}

