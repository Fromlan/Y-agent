import { invoke } from "@tauri-apps/api/core";
import type { Asset, AssetPayload } from "@/lib/types";

export interface CreateAssetParams {
  projectId: string;
  prompt: string;
  model: string;
  modelName: string;
  size: string;
  refCount: number;
  costMs: number;
  isLayerDecomposition: boolean;
  payload: AssetPayload;
}

export async function listAssets(projectId: string): Promise<Asset[]> {
  return await invoke<Asset[]>("list_assets", { projectId });
}

export async function createAsset(params: CreateAssetParams): Promise<Asset> {
  return await invoke<Asset>("create_asset", { params });
}

export async function deleteAsset(id: string): Promise<void> {
  await invoke("delete_asset", { id });
}
