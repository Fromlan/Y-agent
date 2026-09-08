/**
 * O-7 资产批量导出为 ZIP
 *
 * - 客户端 JSZip 打包(无 Rust 依赖,纯浏览器 fetch)
 * - 主图直接放根,文件名 {idx}_{short_id}.{ext}
 * - 多图资产额外按层 index 分文件
 * - 进度通过 onProgress 回调(0~1)
 * - 文件名为空时跳过
 */
import JSZip from "jszip";
import { readFile } from "@tauri-apps/plugin-fs";
import type { Asset } from "@/lib/types";
import { assetMainImage, flatAssetImages, imageInput } from "@/lib/types";
import { localPathToAssetUrl } from "@/lib/image-resolver";

function detectExt(asset: Asset): string {
  // 优先看 payload.outputFormat
  if (asset.payload.outputFormat === "jpeg") return "jpg";
  if (asset.payload.outputFormat === "png") return "png";
  // 看 main URL 末尾扩展名
  const main = assetMainImage(asset);
  if (main) {
    const stripped = main.split("?")[0].split("#")[0];
    const m = stripped.match(/\.(jpe?g|png|webp)(\.|$)/i);
    if (m) {
      const e = m[1].toLowerCase();
      if (e === "jpg" || e === "jpeg") return "jpg";
      return e;
    }
  }
  return "png";
}

function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

interface ExportOpts {
  /** 资产列表(已过滤好) */
  assets: Asset[];
  /** 项目名,用于 zip 文件名(可选) */
  projectName?: string;
  /** 进度回调 (0~1, current/total) */
  onProgress?: (current: number, total: number) => void;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  count: number;
}

/**
 * 把一组资产打包成 zip 并返回 blob
 * - 视频资产: 不打包(M3 之前的导出;M5+ 可加)
 * - 单图资产: 主图放根
 * - 多图资产(图层): 按 zIndex 拆 1-N 个文件
 */
export async function exportAssetsZip({
  assets,
  projectName = "y-agent",
  onProgress,
}: ExportOpts): Promise<ExportResult> {
  const zip = new JSZip();
  let count = 0;
  const total = assets.length;
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    const ext = detectExt(a);
    const shortId = a.id.slice(0, 8);
    const idx = String(i + 1).padStart(3, "0");
    const baseName = `${idx}_${shortId}`;
    if (a.payload?.kind === "video") {
      // 视频资产: 跳过(O-7 范围只覆盖图)
      onProgress?.(i + 1, total);
      continue;
    }
    const imgs = flatAssetImages(a);
    if (imgs.length > 1) {
      // 多图: 按层 index 拆开
      imgs.forEach((img, layerIdx) => {
        const input = imageInput(img);
        if (!input) return;
        const layerExt = img.outputFormat === "jpeg" ? "jpg" : ext;
        const layerName = img.name
          ? sanitizeFilename(img.name)
          : `layer-${String(layerIdx + 1).padStart(2, "0")}`;
        const fname = `${baseName}_${layerName}.${layerExt}`;
        addToZip(zip, input, fname);
        count++;
      });
    } else {
      // 单图: 主图
      const main = imageInput(imgs[0]) || assetMainImage(a);
      if (!main) {
        onProgress?.(i + 1, total);
        continue;
      }
      const fname = `${baseName}.${ext}`;
      addToZip(zip, main, fname);
      count++;
    }
    onProgress?.(i + 1, total);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const ts = new Date().toISOString().slice(0, 10);
  const safeName = sanitizeFilename(projectName);
  const filename = `y-agent-${safeName}-${count}assets-${ts}.zip`;
  return { blob, filename, count };
}

function addToZip(zip: JSZip, src: string, fname: string) {
  // 1) http(s): fetch 同步转 base64
  if (src.startsWith("http://") || src.startsWith("https://")) {
    zip.file(
      fname,
      fetch(src).then((r) => {
        if (!r.ok) throw new Error(`fetch ${src} failed: ${r.status}`);
        return r.arrayBuffer();
      }),
      { binary: true }
    );
    return;
  }
  // 2) data: URL
  if (src.startsWith("data:")) {
    const m = src.match(/^data:([^;]+);base64,(.*)$/);
    if (m) {
      // 已经是 base64 字符串,JSZip 直接吃
      zip.file(fname, m[2], { base64: true });
      return;
    }
    // 不是 base64 的 data: 退化为 fetch (少见)
    zip.file(
      fname,
      fetch(src).then((r) => r.arrayBuffer()),
      { binary: true }
    );
    return;
  }
  // 3) 本地路径(Windows C:\...): 通过 Tauri fs 读
  if (/[\\/]/.test(src) && !src.startsWith("asset:")) {
    // Tauri 读
    zip.file(
      fname,
      readFile(src).then((bytes) => bytes.buffer as ArrayBuffer),
      { binary: true }
    );
    return;
  }
  // 4) asset:// 协议(本地 asset 协议 URL): 也走 Tauri 读
  if (src.startsWith("asset://")) {
    // 从 asset:// URL 还原原 path
    // Tauri 2: asset://localhost/<encoded path> → 解码
    try {
      const url = new URL(src);
      let p = decodeURIComponent(url.pathname);
      // Windows 上可能是 /C:/... 形态,去掉前导 /
      if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
      zip.file(
        fname,
        readFile(p).then((bytes) => bytes.buffer as ArrayBuffer),
        { binary: true }
      );
      return;
    } catch {
      // 兜底: 跳过
    }
  }
  // 5) 兜底: 跳过(避免 zip 里有空文件)
}

/** 触发浏览器下载一个 blob */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 防止 tree-shake 删除 localPathToAssetUrl 的间接引用
void localPathToAssetUrl;
