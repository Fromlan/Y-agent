import { useState } from "react";
import { ImagePlus, Scissors } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useToast } from "@/components/shared/Toast";
import { splitSpriteSheet, type SplitResult } from "@/lib/sprite-splitter";
import { Field } from "./form-primitives";

interface SplitSpriteFormProps {
  busy: boolean;
}

export function SplitSpriteForm({ busy }: SplitSpriteFormProps) {
  const toast = useToast();
  const [inputPath, setInputPath] = useState("");
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [outputDir, setOutputDir] = useState("");
  const [baseName, setBaseName] = useState("tile");
  const [outputZip, setOutputZip] = useState(true);
  const [lastResult, setLastResult] = useState<SplitResult | null>(null);

  const pickInput = async () => {
    const p = await openDialog({
      multiple: false,
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (typeof p === "string") {
      setInputPath(p);
      // 自动用源图所在目录作为输出目录
      if (!outputDir) {
        const dir = p.replace(/[\\/][^\\/]+$/, "");
        setOutputDir(dir);
      }
    }
  };

  const pickOutputDir = async () => {
    const p = await openDialog({ directory: true, multiple: false });
    if (typeof p === "string") setOutputDir(p);
  };

  const canRun =
    !busy &&
    !!inputPath &&
    rows >= 1 &&
    cols >= 1 &&
    !!outputDir;

  const onRun = async () => {
    try {
      const result = await splitSpriteSheet({
        inputPath,
        rows,
        cols,
        outputDir,
        baseName,
        outputZip,
      });
      setLastResult(result);
      toast.success(
        `已切出 ${result.tiles.length} 个 PNG` +
          (result.zipPath ? "，已打包 ZIP" : "")
      );
    } catch (e: any) {
      toast.error(`切分失败：${e?.message ?? e}`);
    }
  };

  const openContainingFolder = async (filePath: string) => {
    try {
      // 优先：用 explorer /select 打开所在文件夹并选中（Windows 体验最好）
      // fallback：shell.open 直接打开文件（macOS / Linux 走默认程序）
      const { open: shellOpen } = await import("@tauri-apps/plugin-shell");
      if (navigator.userAgent.includes("Windows")) {
        // Windows: explorer /select,"path" 高亮该文件
        const { Command } = await import("@tauri-apps/plugin-shell");
        await Command.create("explorer", ["/select,", filePath]).execute();
      } else {
        await shellOpen(filePath);
      }
    } catch (e: any) {
      toast.error(`打开失败：${e?.message ?? e}`);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        把一张「网格状」雪碧图按 <code>rows × cols</code> 切成多个独立 PNG。
        与 <code>ui-component-breakdown</code> 互补：后者输出独立组件（无需切图），
        本工具处理「一张网格图 → 多个独立 PNG + ZIP」的本地切图场景。
      </p>
      <Field label="1. 源图（PNG / JPG）">
        {inputPath ? (
          <div className="flex items-center gap-2">
            <span className="input flex-1 truncate text-xs" title={inputPath}>
              {inputPath}
            </span>
            <button onClick={pickInput} className="btn text-xs">重选</button>
          </div>
        ) : (
          <button onClick={pickInput} className="btn flex items-center gap-1">
            <ImagePlus className="w-3.5 h-3.5" /> 选择图片
          </button>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="行数 (rows)">
          <input
            type="number"
            min={1}
            value={rows}
            onChange={(e) => setRows(Math.max(1, Number(e.target.value) || 1))}
            className="input w-full"
          />
        </Field>
        <Field label="列数 (cols)">
          <input
            type="number"
            min={1}
            value={cols}
            onChange={(e) => setCols(Math.max(1, Number(e.target.value) || 1))}
            className="input w-full"
          />
        </Field>
      </div>
      <Field label="2. 输出目录">
        {outputDir ? (
          <div className="flex items-center gap-2">
            <span className="input flex-1 truncate text-xs" title={outputDir}>
              {outputDir}
            </span>
            <button onClick={pickOutputDir} className="btn text-xs">重选</button>
          </div>
        ) : (
          <button onClick={pickOutputDir} className="btn flex items-center gap-1">
            <ImagePlus className="w-3.5 h-3.5" /> 选择目录
          </button>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="文件名前缀">
          <input
            type="text"
            value={baseName}
            onChange={(e) => setBaseName(e.target.value.trim() || "tile")}
            className="input w-full"
            placeholder="tile"
          />
        </Field>
        <Field label="同时打包 ZIP">
          <label className="flex items-center gap-1.5 h-[38px]">
            <input
              type="checkbox"
              checked={outputZip}
              onChange={(e) => setOutputZip(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-xs text-text-secondary">
              切完后生成 <code>{baseName}.zip</code>
            </span>
          </label>
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onRun} disabled={!canRun} className="btn btn-primary flex items-center gap-1">
          <Scissors className="w-3.5 h-3.5" /> 切分
        </button>
        {inputPath && rows * cols > 0 && (
          <span className="text-xs text-text-muted">
            将切出 {rows * cols} 个文件
          </span>
        )}
      </div>
      {lastResult && (
        <div className="mt-3 panel p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-accent-success">
              切分成功 · {lastResult.tiles.length} 个 PNG
            </div>
            <span className="text-[10px] text-text-muted">
              源图 {lastResult.sourceWidth}×{lastResult.sourceHeight} ·{" "}
              {lastResult.rows}×{lastResult.cols}
            </span>
          </div>
          {lastResult.zipPath && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-muted">ZIP：</span>
              <code className="flex-1 truncate" title={lastResult.zipPath}>
                {lastResult.zipPath}
              </code>
              <button
                onClick={() => openContainingFolder(lastResult.zipPath!)}
                className="btn text-xs"
              >
                打开位置
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SplitSpriteForm;
