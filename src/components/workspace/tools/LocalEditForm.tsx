import { useState, useRef, useEffect } from "react";
import { ImagePlus } from "lucide-react";
import { modelCapabilities } from "@/lib/types";
import { runTool } from "./runTool";
import { PRO_ID, PRO_NAME } from "./tool-constants";
import { Field, Submit, type ImageFormProps } from "./form-primitives";
import AssetPicker from "./AssetPicker";

export function LocalEditForm({ projectId, assets, onRun, busy }: ImageFormProps) {
  const caps = modelCapabilities(PRO_ID);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("2k");
  const [fastMode, setFastMode] = useState(false);
  // bbox 用图像素坐标（API 文档要求的格式）
  const [bbox, setBbox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null
  );
  // 用 ref 拿到 <img> 元素 + 自然像素尺寸
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // 屏幕坐标 → 图像素坐标
  const screenToImage = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img || !naturalSize.w || !naturalSize.h) return null;
    const rect = img.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null;
    }
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(naturalSize.w, Math.round(relX * naturalSize.w))),
      y: Math.max(0, Math.min(naturalSize.h, Math.round(relY * naturalSize.h))),
    };
  };

  // 拖框：mousedown 起点，mousemove 更新，mouseup 结束
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    const pt = screenToImage(e.clientX, e.clientY);
    if (!pt) return;
    dragRef.current = pt;
    setBbox({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const pt = screenToImage(e.clientX, e.clientY);
      if (!pt) return;
      setBbox({
        x1: dragRef.current.x,
        y1: dragRef.current.y,
        x2: pt.x,
        y2: pt.y,
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // screenToImage 闭包内引用，每次 render 重新生成；监听器只在 naturalSize 变化时重绑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalSize]);

  const submit = () => {
    if (!sourceUrl || !bbox || !prompt.trim()) return;
    const finalPrompt = `${prompt.trim()} <bbox>${bbox.x1} ${bbox.y1} ${bbox.x2} ${bbox.y2}</bbox>`;
    onRun((onProgress) =>
      runTool(
        {
          projectId,
          prompt: finalPrompt,
          modelId: PRO_ID,
          modelName: PRO_NAME,
          size,
          image: [sourceUrl],
          bbox,
          ...(fastMode ? { optimizePromptMode: "fast" as const } : {}),
        },
        onProgress
      )
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        5.0 Pro 的局部编辑能力：选图 → 在图上拖框 → 描述要改的内容 → 重出图。
        prompt 自动按 5.0 Pro 文档的 &lt;bbox&gt;x1 y1 x2 y2&lt;/bbox&gt; 格式拼接（坐标是图像素）。
      </p>
      <Field label="1. 选一张图">
        {sourceUrl ? (
          <div className="space-y-2">
            <div className="relative inline-block max-w-full">
              <img
                ref={imgRef}
                src={sourceUrl}
                alt=""
                onLoad={(e) => {
                  setNaturalSize({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  });
                }}
                onMouseDown={onMouseDown}
                className="max-h-64 rounded border border-border cursor-crosshair select-none"
                draggable={false}
              />
              {bbox && naturalSize.w > 0 && (
                <div
                  className="absolute border-2 border-accent bg-accent/15 pointer-events-none"
                  style={{
                    left: `${(Math.min(bbox.x1, bbox.x2) / naturalSize.w) * 100}%`,
                    top: `${(Math.min(bbox.y1, bbox.y2) / naturalSize.h) * 100}%`,
                    width: `${(Math.abs(bbox.x2 - bbox.x1) / naturalSize.w) * 100}%`,
                    height: `${(Math.abs(bbox.y2 - bbox.y1) / naturalSize.h) * 100}%`,
                  }}
                >
                  <span className="absolute -top-5 left-0 bg-accent text-text-inverse text-[10px] px-1 py-0.5 rounded whitespace-nowrap">
                    [{Math.min(bbox.x1, bbox.x2)}, {Math.min(bbox.y1, bbox.y2)}, {Math.max(bbox.x1, bbox.x2)}, {Math.max(bbox.y1, bbox.y2)}]
                  </span>
                </div>
              )}
            </div>
            <div className="text-[10px] text-text-muted">
              {naturalSize.w > 0
                ? `源图 ${naturalSize.w}×${naturalSize.h}px · 在图上拖框选区域`
                : "等待图加载..."}
            </div>
            <div className="flex gap-1">
              <button onClick={() => setPickOpen(true)} className="btn text-xs">
                换图
              </button>
              <button
                onClick={() => setBbox(null)}
                className="btn text-xs"
                disabled={!bbox}
              >
                清除 bbox
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setPickOpen(true)} className="btn flex items-center gap-1">
            <ImagePlus className="w-3.5 h-3.5" /> 从资产库选图
          </button>
        )}
      </Field>
      <Field label="2. 描述要改成什么">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="input w-full"
          placeholder="例如：在这里加一束红色的玫瑰"
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
        disabled={!sourceUrl || !bbox || !prompt.trim() || busy}
        hint={!bbox ? "需要在图上拖框" : undefined}
      />
      {pickOpen && (
        <AssetPicker
          assets={assets}
          onSelect={(_asset, src) => {
            setSourceUrl(src);
            setBbox(null);
            setNaturalSize({ w: 0, h: 0 });
            setPickOpen(false);
          }}
          onClose={() => setPickOpen(false)}
          title="选一张要改的图"
        />
      )}
    </div>
  );
}

export default LocalEditForm;
