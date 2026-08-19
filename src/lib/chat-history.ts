/**
 * 对话历史持久化（前端 wrapper）
 * - 后端存储：SQLite chat_sessions / chat_messages
 * - v0.1 设计：每个项目一个 session，多轮对话历史
 * - 资产通过 asset_ids 数组引用，资产表是 source of truth
 */

import { invoke } from "@tauri-apps/api/core";
import type { ChatMessage } from "@/lib/agent-event";
import type { Asset } from "@/lib/types";
import { log } from "@/lib/logger";

/** 获取或创建项目的 chat_session id */
export async function getOrCreateSession(projectId: string): Promise<string> {
  return await invoke<string>("chat_session_get_or_create", { projectId });
}

/** 列出 session 的所有消息（已按时间排序） */
export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  const jsonList = await invoke<string[]>("chat_message_list", { sessionId });
  return jsonList.map((j) => JSON.parse(j) as ChatMessage);
}

/** 插入一条消息，返回消息 id */
export interface InsertMessageParams {
  role: "user" | "agent";
  content: string;
  attachments?: string[];     // dataURL[]
  skillLog?: object;
  events?: object[];
  pendingPlan?: object;
  error?: string;
  assetIds?: string[];
  /** 可选：前端已有的消息 id（保持 in-memory id 与 DB id 一致，让 updateMessage 能找到行） */
  id?: string;
}
export async function insertMessage(
  sessionId: string,
  msg: InsertMessageParams
): Promise<string> {
  return await invoke<string>("chat_message_insert", {
    sessionId,
    role: msg.role,
    content: msg.content,
    attachments: msg.attachments ? JSON.stringify(msg.attachments) : null,
    skillLog: msg.skillLog ? JSON.stringify(msg.skillLog) : null,
    events: msg.events ? JSON.stringify(msg.events) : null,
    pendingPlan: msg.pendingPlan ? JSON.stringify(msg.pendingPlan) : null,
    error: msg.error ?? null,
    assetIds: msg.assetIds ? JSON.stringify(msg.assetIds) : null,
    id: msg.id ?? null,
  });
}

/** 更新消息（部分字段；传 undefined 的字段不会被更新） */
export interface UpdateMessageParams {
  content?: string;
  skillLog?: object | null;
  events?: object[] | null;
  pendingPlan?: object | null;
  error?: string | null;
  assetIds?: string[] | null;
}
export async function updateMessage(
  messageId: string,
  fields: UpdateMessageParams
): Promise<void> {
  await invoke("chat_message_update", {
    messageId,
    content: fields.content,
    skillLog: fields.skillLog === undefined ? undefined : fields.skillLog === null ? "" : JSON.stringify(fields.skillLog),
    events: fields.events === undefined ? undefined : fields.events === null ? "" : JSON.stringify(fields.events),
    pendingPlan: fields.pendingPlan === undefined ? undefined : fields.pendingPlan === null ? "" : JSON.stringify(fields.pendingPlan),
    error: fields.error,
    assetIds: fields.assetIds === undefined ? undefined : fields.assetIds === null ? "" : JSON.stringify(fields.assetIds),
  });
}

/** 删除单条消息 */
export async function deleteMessage(messageId: string): Promise<void> {
  await invoke("chat_message_delete", { messageId });
}

/** 清空 session 所有消息 */
export async function clearSession(sessionId: string): Promise<void> {
  await invoke("chat_session_clear", { sessionId });
}

/** 辅助：把 assets 数组的 id 提取出来 */
export function assetIds(assets: Asset[] | undefined): string[] {
  return (assets ?? []).map((a) => a.id);
}

// ---------- fire-and-forget 安全包装 ----------
//
// 用途：业务侧不需要 await，但失败不能悄无声息。带 1 次重试 + 错误日志。
// 用法：void persistInsert(...);  // 代替 .catch(console.error)
//
// 为什么不直接 await？因为对话 / 生成流里 DB 写失败不应该阻塞主流程
// （in-memory state 已经更新，刷新页面才会丢数据）。

const MAX_RETRY = 1;
const RETRY_DELAY_MS = 200;

async function withRetry<T>(op: () => Promise<T>, label: string): Promise<T | null> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      return await op();
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRY) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  log.error("chat-history", `${label} failed after ${MAX_RETRY + 1} attempts:`, lastErr);
  return null;
}

/** 异步插入消息。失败时自动重试 1 次并写错误日志（不抛错、不阻塞）。 */
export function persistInsert(sessionId: string, msg: InsertMessageParams): void {
  void withRetry(() => insertMessage(sessionId, msg), `insertMessage(${msg.role})`);
}

/** 异步更新消息。失败时自动重试 1 次并写错误日志。 */
export function persistUpdate(messageId: string, fields: UpdateMessageParams): void {
  void withRetry(() => updateMessage(messageId, fields), `updateMessage(${messageId.slice(0, 8)}…)`);
}

/** 异步删除消息。失败时重试 1 次。 */
export function persistDelete(messageId: string): void {
  void withRetry(() => deleteMessage(messageId), `deleteMessage(${messageId.slice(0, 8)}…)`);
}
