import { useState } from "react";
import { ImagePlus, AlertCircle } from "lucide-react";
import { modelCapabilities, type Asset } from "@/lib/types";
import { runTool } from "./runTool";
import { isAssetJpeg, PRO_ID, PRO_NAME } from "./tool-constants";
import { Field, Submit, type ImageFormProps } from "./form-primitives";
import AssetPicker from "./AssetPicker";

export function TransparentForm({ projectId, assets, onRun, busy }: ImageFormProps) {
  const caps = modelCapabilities(PRO_ID);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [prompt, setPrompt] = useState("保持主体不变，背景改为透明");
  const [size, setSize] = useState("2k");
  const [fastMode, setFastMode] = useState(false);
  const isJpeg = selectedAsset ? isAssetJpeg(selectedAsset) : false;
  const submit = () => {
    if (!sourceUrl || isJpeg) return;
    onRun((onProgress) =>
      runTool(
        {
          projectId,
          prompt: prompt.trim() || "保持主体不变，背景改为透明",
          modelId: PRO_ID,
          modelName: PRO_NAME,
          size,
          image: [sourceUrl],
          outputFormat: "png",
          background: "transparent",
          isTransparent: true,
          ...(fastMode ? { optimizePromptMode: "fast" as const } : {}),
        },
        onProgress
      )
    );
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        用 5.0 Pro 的 background: transparent 能力，输出 PNG 透明背景版本，适合做 UI 图标 / 素材。
        <span className="text-status-warn">⚠ 输入图必须是 PNG。</span>
      </p>
      <Field label="1. 选一张图（必须是 PNG）">
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
      {isJpeg && (
        <div
          className="flex items-start gap-2 px-3 py-2 rounded-md border text-xs"
          style={{
            backgroundColor: "color-mix(in srgb, var(--status-warn) 8%, transparent)",
            borderColor: "color-mix(in srgb, var(--status-warn) 28%, transparent)",
          }}
        >
          <AlertCircle
            className="w-4 h-4 flex-shrink-0 mt-0.5"
            style={{ color: "var(--status-warn)" }}
          />
          <div className="flex-1 text-text-secondary space-y-1">
            <div>
              <strong className="text-text-primary">这张图是 JPEG</strong>，5.0 Pro 的「背景透明」必须用 PNG。
            </div>
            <div>
              解决：① 在「批量组图」用 <strong>输出格式=PNG</strong> 重出一张；
              ② 或用「局部编辑」把这张图转一道再回来选。
            </div>
          </div>
        </div>
      )}
      <Field label="2. 描述怎么处理这张图（可改 prompt）">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="input w-full"
          placeholder="保持主体不变，背景改为透明"
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
      <Submit
        onClick={submit}
        disabled={!sourceUrl || isJpeg || busy}
        hint={isJpeg ? "请选一张 PNG 图" : undefined}
      />
      {pickOpen && (
        <AssetPicker
          assets={assets}
          onSelect={(asset, src) => {
            setSelectedAsset(asset);
            setSourceUrl(src);
            setPickOpen(false);
          }}
          onClose={() => setPickOpen(false)}
          title="选一张 PNG 图（去背后输出透明 PNG）"
        />
      )}
    </div>
  );
}

export default TransparentForm;
