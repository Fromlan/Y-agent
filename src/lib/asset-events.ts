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

/**
 * 订阅者集合：允许多个组件同时订阅。Tauri 的 listen() 本身只支持单 callback，
 * 所以用一个模块级 set 收集所有 apply，回调里逐个调用。
 * 之前用单 callback 有"第二个订阅者被静默 no-op"的 bug — 切到 set 后修复。
 */
const applies = new Set<(e: AssetBackfillEvent) => void>();
let unlisten: UnlistenFn | null = null;
let pending: Promise<void> | null = null;

/**
 * 启动「资产本地兜底」事件订阅。
 * - 支持多个订阅者（项目详情 + 资产中心可同时挂载）
 * - 重复调用同一 apply 是 no-op（set 去重）
 * - 最后一个 stop 才会真正 unlisten
 *
 * 返回 Promise<void>;失败仅 console.error,不抛。
 */
export async function startAssetEventListener(
    apply: (e: AssetBackfillEvent) => void
): Promise<void> {
    applies.add(apply);
    if (unlisten || pending) return;
    pending = (async () => {
        try {
            unlisten = await listen<AssetBackfillEvent>(EVENT_NAME, (e) => {
                for (const a of applies) {
                    try {
                        a(e.payload);
                    } catch (err) {
                        console.error("asset-events apply error", err);
                    }
                }
            });
        } catch (e) {
            console.error("startAssetEventListener failed:", e);
        } finally {
            pending = null;
        }
    })();
    await pending;
}

/** 释放当前订阅者。同一 apply 多次 stop 是 no-op。 */
export async function stopAssetEventListener(
    apply?: (e: AssetBackfillEvent) => void
): Promise<void> {
    if (apply) {
        applies.delete(apply);
    }
    if (applies.size > 0) return;
    if (unlisten) {
        try {
            unlisten();
        } catch {
            /* ignore */
        }
        unlisten = null;
    }
}

/** 仅供测试：清空订阅者集合 + listener。生产代码不要用。 */
export function __resetForTests(): void {
    applies.clear();
    if (unlisten) {
        try {
            unlisten();
        } catch {
            /* ignore */
        }
        unlisten = null;
    }
}
