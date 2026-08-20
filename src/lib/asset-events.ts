import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * 后端 `commands::ASSET_LOCAL_BACKFILLED_EVENT` 事件 payload。
 * - `localPaths` / `layerLocalPaths` 是 cleaned 后的绝对路径数组;
 *   前端按自身 payload 形态选用(urls 模式取 localPaths, layers 模式取 layerLocalPaths)。
 */
export interface AssetBackfillEvent {
    assetId: string;
    projectId: string;
    localPaths?: string[];
    layerLocalPaths?: string[];
}

const EVENT_NAME = "assets://local-backfilled";

let unlisten: UnlistenFn | null = null;

/**
 * 启动「资产本地兜底」事件订阅。
 *
 * 同一时刻只允许一个 listener(模块级单例);重复调用安全(no-op)。
 * - `apply(e)` 在事件到达时调用,可以读到该事件影响到的 assetId / projectId / cleaned 路径
 * - 调用方自己决定如何更新 React state(典型: setAssets(prev => map(...)))
 *
 * 返回 Promise<void>;失败仅 console.error,不抛。
 */
export async function startAssetEventListener(
    apply: (e: AssetBackfillEvent) => void
): Promise<void> {
    if (unlisten) return;
    try {
        unlisten = await listen<AssetBackfillEvent>(EVENT_NAME, (e) => {
            apply(e.payload);
        });
    } catch (e) {
        console.error("startAssetEventListener failed:", e);
    }
}

/** 释放当前 listener。下次 startAssetEventListener 会重新订阅。 */
export async function stopAssetEventListener(): Promise<void> {
    if (unlisten) {
        try {
            unlisten();
        } catch {
            /* ignore */
        }
        unlisten = null;
    }
}
