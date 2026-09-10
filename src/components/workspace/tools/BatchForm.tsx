import { useState } from "react";
import { MODEL_OPTIONS, modelCapabilities, type ModelOption } from "@/lib/types";
import { runTool } from "./runTool";
import { LITE_ID } from "./tool-constants";
import { Field, Submit, type FormProps } from "./form-primitives";

export function BatchForm({ projectId, onRun, busy }: FormProps) {
  const lite = MODEL_OPTIONS.find((m) => m.id === LITE_ID) ?? MODEL_OPTIONS[0];
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelOption>(lite);
  const [size, setSize] = useState("2k");
  const [count, setCount] = useState(4);
  const [fastMode, setFastMode] = useState(false);
  const [outputFormat, setOutputFormat] = useState<"" | "png" | "jpeg">("png");
  const caps = modelCapabilities(model.id);

  const submit = () => {
    if (!prompt.trim()) return;
    onRun((onProgress) =>
      runTool(
        {
          projectId,
          prompt: prompt.trim(),
          modelId: model.id,
          modelName: model.name,
          size,
          sequential: "auto",
          maxImages: count,
          ...(caps.fastMode && fastMode ? { optimizePromptMode: "fast" as const } : {}),
          ...(outputFormat ? { outputFormat } : {}),
        },
        onProgress
      )
    );
  };

  return (
    <div className="space-y-3">
      <Field label="Prompt">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="input w-full"
          placeholder="描述你要的画面…"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="模型">
          <select
            value={model.id}
            onChange={(e) => {
              const m = MODEL_OPTIONS.find((x) => x.id === e.target.value);
              if (m) setModel(m);
              // 切模型时重置不兼容的开关
              setFastMode(false);
              setOutputFormat("");
            }}
            className="input w-full"
          >
            {MODEL_OPTIONS.filter((m) => modelCapabilities(m.id).groupGeneration).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="尺寸">
          <select value={size} onChange={(e) => setSize(e.target.value)} className="input w-full">
            {(caps.sizePresets ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label={`数量 (1-${caps.maxGroupImages})`}>
          <input
            type="number"
            min={1}
            max={caps.maxGroupImages}
            value={count}
            onChange={(e) =>
              setCount(Math.max(1, Math.min(caps.maxGroupImages, Number(e.target.value) || 1)))
            }
            className="input w-full"
          />
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
              <span className="text-xs text-text-secondary">fast（牺牲画质换速度）</span>
            </label>
          </Field>
        )}
        {caps.outputFormats.length > 1 && (
          <Field label="输出格式">
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as "" | "png" | "jpeg")}
              className="input w-full"
            >
              <option value="">PNG（Y-agent 默认）</option>
              {caps.outputFormats.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Submit onClick={submit} disabled={!prompt.trim() || busy} />
    </div>
  );
}

export default BatchForm;
