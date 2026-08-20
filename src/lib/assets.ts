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

/** P5+ 兜底：扫一个项目（或全库）下"url 有但 localPath 缺"的资产并下到本地。
 * - 返回处理摘要：scanned / downloaded / failed / brokenMarked
 * - 失败/部分失败的资产会被后端标 `payload.broken = true`，UI 可据此给"图已过期"提示
 * - 建议在"打开项目"时调一次，自动修复历史数据
 */
export interface BackfillReport {
  scanned: number;
  downloaded: number;
  failed: number;
  brokenMarked: number;
}

export async function backfillLocalAssets(
  projectId?: string
): Promise<BackfillReport> {
  return await invoke<BackfillReport>("backfill_local_assets", { projectId });
}