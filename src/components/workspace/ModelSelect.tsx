import { useState } from "react";
import { MODEL_OPTIONS, modelCapabilities, type ModelOption, type ModelCapabilities } from "@/lib/types";

interface Props {
  value: ModelOption;
  onChange: (m: ModelOption) => void;
}

/**
 * 给自定义 ID 构造 ModelOption。能力矩阵走 modelCapabilities() 兜底（5.0 Lite 风格）。
 */
function buildCustomOption(id: string): ModelOption {
  return {
    id,
    name: id ? `自定义: ${id}` : "自定义",
    supportsLayerDecomposition: modelCapabilities(id).layerDecomposition,
    supportsGroupGeneration: modelCapabilities(id).groupGeneration,
    capabilities: modelCapabilities(id),
  };
}

function summarizeCaps(c: ModelCapabilities): string {
  const flags: string[] = [];
  if (c.webSearch) flags.push("联网");
  if (c.fastMode) flags.push("极速");
  if (c.background) flags.push("透明");
  if (c.layerDecomposition) flags.push("图层");
  if (c.interactiveEdit) flags.push("局部编辑");
  if (c.outputFormats.includes("png") && c.outputFormats.includes("jpeg")) flags.push("PNG/JPEG");
  else if (c.outputFormats.includes("jpeg")) flags.push("仅 JPEG");
  return flags.length > 0 ? flags.join(" · ") : "基础生图";
}

function summarizeCapsShort(c: ModelCapabilities): string {
  const flags: string[] = [];
  if (c.webSearch) flags.push("联网");
  if (c.fastMode) flags.push("极速");
  if (c.background) flags.push("透明");
  if (c.layerDecomposition) flags.push("图层");
  // 只显示前 2 个，剩余放 tooltip
  return flags.slice(0, 2).join(" · ");
}

export default function ModelSelect({ value, onChange }: Props) {
  const [customId, setCustomId] = useState(
    () => localStorage.getItem("y-agent.customModelId") ?? ""
  );
  const [editing, setEditing] = useState(false);

  // 自定义模型 ID 不局限于 ep-/custom- 前缀；只要不是内置模型，都应显示自定义编辑框
  const isCustom =
    value.id === "CUSTOM" || !MODEL_OPTIONS.some((m) => m.id === value.id);

  const shortSummary = summarizeCapsShort(value.capabilities);
  const fullSummary = value.hint ?? summarizeCaps(value.capabilities);

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={isCustom ? "CUSTOM" : value.id}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "CUSTOM") {
            setEditing(true);
            onChange(buildCustomOption(customId || "custom-"));
          } else {
            const m = MODEL_OPTIONS.find((x) => x.id === v);
            if (m) onChange(m);
          }
        }}
        className="text-xs bg-bg-elev border border-border rounded px-2 py-1
          text-text-primary focus:outline-none focus:border-accent"
      >
        {MODEL_OPTIONS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {/* 能力位摘要：主行只显示前 2 个，hover tooltip 看全部 */}
      {shortSummary && (
        <span
          className="text-[10px] text-text-muted hidden md:inline"
          title={fullSummary}
        >
          {shortSummary}
        </span>
      )}
      {(isCustom || editing) && (
        <input
          type="text"
          value={customId}
          onChange={(e) => {
            const v = e.target.value;
            setCustomId(v);
            localStorage.setItem("y-agent.customModelId", v);
            onChange(buildCustomOption(v));
          }}
          placeholder="ep-xxxxxxxx 或模型名"
          className="w-44 text-xs bg-bg-elev border border-border rounded px-2 py-1
            text-text-primary focus:outline-none focus:border-accent"
        />
      )}
    </div>
  );
}
