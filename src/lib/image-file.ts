import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

const ALLOWED_EXT = ["png", "jpg", "jpeg", "webp"];
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB，参考图够用；超过会拒

/**
 * 打开系统文件选择器，选一张本地图，读成 data URL 字符串（给 API 直接用）。
 * 用户取消返回 null。
 */
export async function pickImageAsDataUrl(): Promise<string | null> {
  const picked = await open({
    multiple: false,
    filters: [{ name: "图片", extensions: ALLOWED_EXT }],
  });
  if (!picked || typeof picked !== "string") return null;

  const ext = picked.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.includes(ext)) {
    throw new Error(`不支持的图片格式：.${ext}`);
  }

  const bytes = await readFile(picked);
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error(
      `图片过大（${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB），限制 8MB`
    );
  }

  // 字节转 base64
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.byteLength; i++) bin += String.fromCharCode(arr[i]);
  const b64 = btoa(bin);

  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
  return `data:${mime};base64,${b64}`;
}
