/**
 * 把持久化的 ChatMessage 里的 assetIds 反查成完整 Asset 对象。
 * 在加载对话历史时使用——DB 只存 id，UI 需要 Asset 全字段渲染。
 */
import { listAssets } from "@/lib/assets";
import type { Asset } from "@/lib/types";
import type { ChatMessage } from "@/lib/agent-event";

export async function enrichMessagesWithAssets(
  projectId: string,
  msgs: ChatMessage[]
): Promise<ChatMessage[]> {
  const idSet = new Set<string>();
  msgs.forEach((m) => m.assetIds?.forEach((id) => idSet.add(id)));
  if (idSet.size === 0) return msgs;
  const allAssets = await listAssets(projectId);
  const map = new Map(allAssets.map((a) => [a.id, a]));
  return msgs.map((m) => {
    const ids = m.assetIds ?? [];
    const assets = ids.map((id) => map.get(id)).filter((a): a is Asset => !!a);
    return { ...m, assets: assets.length > 0 ? assets : undefined };
  });
}
