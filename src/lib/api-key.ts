import { invoke } from "@tauri-apps/api/core";

export async function getApiKey(): Promise<string | null> {
  return await invoke<string | null>("get_api_key");
}

export async function setApiKey(key: string): Promise<void> {
  await invoke("set_api_key", { key });
}

export async function clearApiKey(): Promise<void> {
  await invoke("clear_api_key");
}

export async function hasApiKey(): Promise<boolean> {
  const k = await getApiKey();
  return !!k && k.length > 0;
}
