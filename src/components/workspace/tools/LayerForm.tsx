import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { modelCapabilities } from "@/lib/types";
import { runTool } from "./runTool";
import { PRO_ID, PRO_NAME } from "./tool-constants";
import { Field, Submit, type ImageFormProps } from "./form-primitives";
import AssetPicker from "./AssetPicker";

export function LayerForm({ projectId, assets, onRun, busy }: ImageFormProps) {
  const caps = modelCapabilities(PRO_ID);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [prompt, setPrompt] = useState("将图像拆分为底图与可编辑图层");
  const [size, setSize] = useState("2k");
  const [fastMode, setFastMode] = useState(false);
  const submit = () => {
    if (!sourceUrl) return;
    onRun((onProgress) =>
      runTool(
        {
          projectId,
          prompt: prompt.trim() || "将图像拆分为底图与可编辑图层",
          modelId: PRO_ID,
          modelName: PRO_NAME,
          size,
          image: [sourceUrl],
          layerDecomposition: true,
          ...(fastMode ? { optimizePromptMode: "fast" as const } : {}),
        },
        onProgress
      )
    );
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        5.0 Pro 的 layer_decomposition 能力，把图拆为 1 张底图 + N 个可编辑图层。
        进入资产详情可看图层列表 / 隐藏 / 单图层导出。
      </p>
      <Field label="1. 选一张图">
        {sourceUrl ? (
          <div className="flex items-center gap-2">
            <div className="w-16 h-16 rounded border border-border overflow-hidden">
              <img src={sourceUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <button onClick={() => setPickOpen(true)} className="btn text-xs">
              重选
            </button>
          </div>
        ) : (
          <button onClick={() => setPickOpen(true)} className="btn flex items-center gap-1">
            <ImagePlus className="w-3.5 h-3.5" /> 从资产库选图
          </button>
        )}
      </Field>
      <Field label="2. 拆分指令（可改）">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="input w-full"
          placeholder="将图像拆分为底图与可编辑图层"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="尺寸">
          <select value={size} onChange={(e) => setSize(e.target.value)} className="input w-full">
            {(caps.sizePresets ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        {caps.fastMode && (
          <Field label="极速模式">
            <label className="flex items-center gap-1.5 h-[38px]">
              <input
                type="checkbox"
                checked={fastMode}
                onChange={(e) => setFastMode(e.target.checked)}
                className="accent-accent"
              />
              <span className="text-xs text-text-secondary">fast</span>
            </label>
          </Field>
        )}
      </div>
      <Submit onClick={submit} disabled={!sourceUrl || busy} />
      {pickOpen && (
        <AssetPicker
          assets={assets}
          onSelect={(_asset, src) => {
            setSourceUrl(src);
            setPickOpen(false);
          }}
          onClose={() => setPickOpen(false)}
          title="选一张要拆分的图"
        />
      )}
    </div>
  );
}

export default LayerForm;
