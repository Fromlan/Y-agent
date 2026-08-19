import { invoke } from "@tauri-apps/api/core";

/** 通用 KV 偏好读写。用于默认模型、默认尺寸等用户偏好。 */

export async function getPref(key: string): Promise<string | null> {
  return await invoke<string | null>("get_pref", { key });
}

export async function setPref(key: string, value: string): Promise<void> {
  await invoke("set_pref", { key, value });
}
