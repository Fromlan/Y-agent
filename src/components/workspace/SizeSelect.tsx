interface Props {
  value: string;
  onChange: (v: string) => void;
  modelId: string;
}

const PRESETS_BY_MODEL: Record<string, string[]> = {
  "doubao-seedream-5-0-pro-260628": ["1k", "1.5k", "2k"],
  "doubao-seedream-5-0-lite-260128": ["2k", "3k", "4k"],
  "doubao-seedream-4-5-251128": ["2k", "4k"],
  "doubao-seedream-4-0-250828": ["1k", "2k", "4k"],
};

const SIZE_LABELS: Record<string, string> = {
  "1k": "1K",
  "1.5k": "1.5K",
  "2k": "2K",
  "3k": "3K",
  "4k": "4K",
};

export default function SizeSelect({ value, onChange, modelId }: Props) {
  const options = PRESETS_BY_MODEL[modelId] ?? ["1k", "2k"];
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
