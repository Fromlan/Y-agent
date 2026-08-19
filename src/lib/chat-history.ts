/**
 * 对话历史持久化（前端 wrapper）
 * - 后端存储：SQLite chat_sessions / chat_messages
 * - v0.1 设计：每个项目一个 session，多轮对话历史
 * - 资产通过 asset_ids 数组引用，资产表是 source of truth
 */

import { invoke } from "@tauri-apps/api/core";
import type { ChatMessage } from "@/lib/agent-event";
import type { Asset } from "@/lib/types";

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
