import { modelCapabilities } from "@/lib/types";

interface Props {
  value: string;
  onChange: (v: string) => void;
  modelId: string;
}

const SIZE_LABELS: Record<string, string> = {
  "1k": "1K",
  "1.5k": "1.5K",
  "2k": "2K",
  "3k": "3K",
  "4k": "4K",
};

export default function SizeSelect({ value, onChange, modelId }: Props) {
  // P0：能力矩阵驱动，避免写死 4 个 model id。custom 也走 modelCapabilities() 兜底。
  const caps = modelCapabilities(modelId);
  const options = caps.sizePresets.length > 0 ? caps.sizePresets : ["1k", "2k"];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs bg-bg-elev border border-border rounded px-2 py-1
        text-text-primary focus:outline-none focus:border-accent"
    >
      {options.map((s) => (
        <option key={s} value={s}>
          {SIZE_LABELS[s] ?? s}
        </option>
      ))}
    </select>
  );
}
