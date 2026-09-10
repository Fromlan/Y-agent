import { useState } from "react";
import { MODEL_OPTIONS, modelCapabilities } from "@/lib/types";
import { runTool } from "./runTool";
import { LITE_ID } from "./tool-constants";
import { Field, Submit, type FormProps } from "./form-primitives";

export function WebSearchForm({ projectId, onRun, busy }: FormProps) {
  const lite = MODEL_OPTIONS.find((m) => m.id === LITE_ID) ?? MODEL_OPTIONS[0];
  const caps = modelCapabilities(lite.id);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("2k");
  const [outputFormat, setOutputFormat] = useState<"" | "png" | "jpeg">("png");
  const submit = () => {
    if (!prompt.trim()) return;
    onRun((onProgress) =>
      runTool(
        {
          projectId,
          prompt: prompt.trim(),
          modelId: lite.id,
          modelName: lite.name,
          size,
          tools: ["web_search"],
          ...(outputFormat ? { outputFormat } : {}),
        },
        onProgress
      )
    );
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        5.0 Lite 会先调用联网搜索拉取实时信息（天气、商品、新闻等），再基于搜索结果出图。
        prompt 里描述清楚你想要的实时信息。
      </p>
      <Field label="Prompt">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="input w-full"
          placeholder="例如：上海今天天气晴，画一张街角的咖啡店"
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

export default WebSearchForm;
