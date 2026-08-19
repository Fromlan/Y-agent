import { useState } from "react";
import { MODEL_OPTIONS, type ModelOption } from "@/lib/types";

interface Props {
  value: ModelOption;
  onChange: (m: ModelOption) => void;
}

export default function ModelSelect({ value, onChange }: Props) {
  const [customId, setCustomId] = useState(
    () => localStorage.getItem("y-agent.customModelId") ?? ""
  );
  const [editing, setEditing] = useState(false);

  const isCustom = value.id === "CUSTOM" || value.id.startsWith("ep-") || value.id.startsWith("custom-");

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={isCustom ? "CUSTOM" : value.id}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "CUSTOM") {
            setEditing(true);
            const m: ModelOption = {
              id: customId || "custom-",
              name: "自定义",
              supportsLayerDecomposition: false,
              supportsGroupGeneration: true,
            };
            onChange(m);
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
      {(isCustom || editing) && (
        <input
          type="text"
          value={customId}
          onChange={(e) => {
            const v = e.target.value;
            setCustomId(v);
            localStorage.setItem("y-agent.customModelId", v);
            onChange({
              id: v,
              name: v ? `自定义: ${v}` : "自定义",
              supportsLayerDecomposition: false,
              supportsGroupGeneration: true,
            });
          }}
          placeholder="ep-xxxxxxxx 或模型名"
          className="w-44 text-xs bg-bg-elev border border-border rounded px-2 py-1
            text-text-primary focus:outline-none focus:border-accent"
        />
      )}
    </div>
  );
}
