/**
 * 主题选择器。
 *
 * - 4 套主题横向卡片布局
 * - 每张卡片：色板（6 个色块）+ 名字 + 描述 + 选中环
 * - 点击即时切换，无须"保存"按钮
 */

import { Check } from "lucide-react";
import { useTheme } from "@/lib/use-theme";

export default function ThemePicker() {
  const { theme, setTheme, themes } = useTheme();

  return (
    <div className="grid grid-cols-2 gap-2">
      {themes.map((t) => {
        const selected = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            className={[
              "text-left rounded-md border p-2.5 transition-colors group",
              "hover:bg-bg-hover",
              selected
                ? "border-accent ring-1 ring-accent bg-bg-hover"
                : "border-border",
            ].join(" ")}
            aria-pressed={selected}
          >
            {/* 6 块色板：base / panel / elev / accent / accent-hover / text-primary */}
            <div className="flex h-6 rounded overflow-hidden border border-border/60">
              {t.swatches.map((color, i) => (
                <div
                  key={i}
                  className="flex-1"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">
                {t.name}
              </span>
              {selected && (
                <Check className="w-3.5 h-3.5 text-accent" aria-label="已选中" />
              )}
            </div>
            <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
              {t.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
