/**
 * M3 角色档案（Character Archive）纯函数层
 *
 * 设计：所有过滤 / 搜索 / 校验 / 排序都不依赖 IPC，可独立单测。
 *   - 上层（UI / Agent router）调 IPC 拿到 CharacterArchive[]，再调这里做派生。
 *   - 输入数据是"已经从 Rust 端 list 出来的数组"，本模块不持有任何可变状态。
 *
 * 职责边界：
 *   - 纯数据变换（filter / sort / search / validate / aggregate）
 *   - 不做 IPC（IPC 在 character-archive-api.ts 里）
 *   - 不做渲染（renderCharacterArchive 在 M3.2 加，占位符拼接到 prompt 末尾）
 *   - 不做 demo 模式占位（demo 在 UI 层 mock，本模块不区分）
 *
 * 与 src/lib/style-contract.ts 的关系：
 *   - style-contract 跟 project 绑（每项目一份）
 *   - character archive 可跨 project 引用（scope=global）
 *   - 渲染顺序：{{user_input}} → {{character_archive}} → {{style_contract}} → 反向限制
 *     见 doc/plan-m3-character-workshop.md § 3.2
 */
import type {
  CharacterArchive,
  CharacterArchiveQuery,
  CharacterArchiveUpsert,
} from "@/lib/types";

// 角色档案的硬约束常量。改动时同步改 Rust 端 `validate_archive_input`。
export const CHARACTER_ARCHIVE_LIMITS = {
  MAX_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 4000,
  MAX_PROMPT_SNIPPET_LENGTH: 2000,
  MAX_REFERENCE_IMAGES: 6,
  MAX_TAGS: 16,
  MAX_TAG_LENGTH: 24,
} as const;

/** 默认 scope 查询：项目 + 全局合并 */
export const DEFAULT_SCOPE_QUERY: ("project" | "global")[] = ["project", "global"];

/**
 * 按 query 过滤 + 排序 archives。
 * - scope: 不传 → ['project', 'global']；传 'project' 还要 projectId 匹配
 * - tagFilter: AND 语义（必须包含所有指定标签）
 * - searchName: name / description 都模糊匹配（不区分大小写）
 * - 默认按 updatedAt DESC 排序
 */
export function queryCharacterArchives(
  archives: CharacterArchive[],
  query: CharacterArchiveQuery = {},
): CharacterArchive[] {
  const scope = query.scope ?? DEFAULT_SCOPE_QUERY;
  const projectId = query.projectId ?? "";
  const tagFilter = query.tagFilter ?? [];
  const search = (query.searchName ?? "").trim().toLowerCase();

  return sortByUpdated(
    archives.filter((a) => {
      // 1. scope 过滤
      if (!scope.includes(a.scope)) return false;
      if (a.scope === "project" && a.projectId !== projectId) return false;
      // 2. tag 过滤（AND）
      if (tagFilter.length > 0) {
        const tagSet = new Set(a.tags);
        for (const t of tagFilter) {
          if (!tagSet.has(t)) return false;
        }
      }
      // 3. 名称 / 描述 模糊匹配
      if (search) {
        const hay = `${a.name}\n${a.description}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    }),
  );
}

/** 按 updatedAt DESC 排序（同时间戳按 name 升序兜底） */
export function sortByUpdated(archives: CharacterArchive[]): CharacterArchive[] {
  return [...archives].sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

/** 聚合所有 archive 的 tags 集合（按使用次数 + 字母序排序，供左侧多选过滤 UI 用） */
export function aggregateAllTags(archives: CharacterArchive[]): string[] {
  const counts = new Map<string, number>();
  for (const a of archives) {
    // M3.6 防御:Rust 端 schema 错配时 a.tags 可能是 undefined(老数据 / 早期 build),
    // 这里不 throw,直接跳过,UI 至少能渲染。Rust 端 fix 见 storage.rs::CharacterArchiveRow 自定义 Serialize。
    const tags = Array.isArray(a.tags) ? a.tags : [];
    for (const t of tags) {
      const trimmed = (t ?? "").trim();
      if (!trimmed) continue;
      counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], "zh-CN");
    })
    .map(([tag]) => tag);
}

/** 校验 upsert 输入。返回 null = OK，字符串 = 错误消息。 */
export function validateArchiveUpsert(
  upsert: CharacterArchiveUpsert,
): string | null {
  // 1. name 必填 + 长度
  const name = (upsert.name ?? "").trim();
  if (!name) return "档案名不能为空";
  if (name.length > CHARACTER_ARCHIVE_LIMITS.MAX_NAME_LENGTH)
    return `档案名不能超过 ${CHARACTER_ARCHIVE_LIMITS.MAX_NAME_LENGTH} 字符`;

  // 2. description 长度
  if ((upsert.description ?? "").length > CHARACTER_ARCHIVE_LIMITS.MAX_DESCRIPTION_LENGTH)
    return `描述不能超过 ${CHARACTER_ARCHIVE_LIMITS.MAX_DESCRIPTION_LENGTH} 字符`;

  // 3. promptSnippet 长度
  if ((upsert.promptSnippet ?? "").length > CHARACTER_ARCHIVE_LIMITS.MAX_PROMPT_SNIPPET_LENGTH)
    return `Prompt 片段不能超过 ${CHARACTER_ARCHIVE_LIMITS.MAX_PROMPT_SNIPPET_LENGTH} 字符`;

  // 4. scope 合法
  if (upsert.scope !== "project" && upsert.scope !== "global")
    return `scope 必须是 'project' 或 'global'（收到 '${upsert.scope}'）`;

  // 5. scope=project 必须有 projectId；scope=global 必须没有
  if (upsert.scope === "project") {
    if (!upsert.projectId || upsert.projectId.trim() === "")
      return "scope=project 时必须提供 projectId";
  } else {
    if (upsert.projectId && upsert.projectId.trim() !== "")
      return "scope=global 时 projectId 必须为空";
  }

  // 6. 参考图数量 + 去重
  const refs = upsert.referenceImageAssetIds ?? [];
  if (refs.length > CHARACTER_ARCHIVE_LIMITS.MAX_REFERENCE_IMAGES)
    return `参考图最多 ${CHARACTER_ARCHIVE_LIMITS.MAX_REFERENCE_IMAGES} 张（当前 ${refs.length} 张）`;
  const seen = new Set<string>();
  for (const id of refs) {
    if (seen.has(id)) return `参考图 ID 重复：${id}`;
    seen.add(id);
  }

  // 7. tags 数量 + 长度 + 去重
  const tags = upsert.tags ?? [];
  if (tags.length > CHARACTER_ARCHIVE_LIMITS.MAX_TAGS)
    return `标签最多 ${CHARACTER_ARCHIVE_LIMITS.MAX_TAGS} 个`;
  const seenTag = new Set<string>();
  for (const tag of tags) {
    const t = (tag ?? "").trim();
    if (!t) return "标签不能为空";
    if (t.length > CHARACTER_ARCHIVE_LIMITS.MAX_TAG_LENGTH)
      return `单个标签不能超过 ${CHARACTER_ARCHIVE_LIMITS.MAX_TAG_LENGTH} 字符`;
    if (seenTag.has(t)) return `标签重复：${t}`;
    seenTag.add(t);
  }

  return null;
}

/**
 * 构造一个空档案 upsert（UI 初始填表用）。projectId 在 scope=project 时必填。
 */
export function makeEmptyArchive(
  scope: "project" | "global",
  projectId: string | null,
): CharacterArchiveUpsert {
  return {
    id: undefined,
    scope,
    projectId: scope === "project" ? projectId : null,
    name: "",
    description: "",
    referenceImageAssetIds: [],
    styleContractId: null,
    promptSnippet: "",
    tags: [],
    agentUseCount: 0,
  };
}

/** 检测一个档案 ID 是否在另一个档案的 referenceImageAssetIds 里（用于"被引用"统计） */
export function isReferencedAsReference(
  archive: CharacterArchive,
  assetId: string,
): boolean {
  return archive.referenceImageAssetIds.includes(assetId);
}

/**
 * 从 archives 中找出"引用了指定 assetId 的所有档案"。
 * 主要给 AssetDetailDialog 的"创建/附加到档案"二级菜单用：列出现有可附加的档案。
 */
export function findArchivesReferencingAsset(
  archives: CharacterArchive[],
  assetId: string,
): CharacterArchive[] {
  return archives.filter((a) => a.referenceImageAssetIds.includes(assetId));
}

/**
 * 把多个档案 name 拼成一个 list（Agent system prompt 注入时用）。
 * 长度限制默认 2000 字符（system prompt 注入是软限制，截断后加 "..." 提示）。
 */
export function summarizeArchivesForPrompt(
  archives: CharacterArchive[],
  maxChars = 2000,
): string {
  if (archives.length === 0) return "";
  const lines: string[] = [];
  let used = 0;
  for (const a of archives) {
    const line = `- ${a.id} | ${a.name}${a.description ? ` (${a.description.slice(0, 60)})` : ""}`;
    if (used + line.length + 1 > maxChars) {
      lines.push(`…（共 ${archives.length} 个档案，已截断显示前 ${lines.length} 个）`);
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

/**
 * 把 CharacterArchive 转成正向 prompt 末尾追加的"角色档案"段。
 * - 没有档案名 + 没有描述 + 没有参考图 + 没有 promptSnippet → 返回空串（不污染 prompt）
 * - 输出格式与 [项目风格契约] 对称，便于阅读和后续 LLM 解析
 * - 参考图数量走"档案 N 张参考图"（不描述具体内容；具体内容由用户在 description 里写）
 *   真正视觉一致性靠 jimeng image[] 数组（同 plan § 3.2 链路）
 *
 * 拼接到 prompt 末尾时位置：{{user_input}} → {{character_archive}} → {{style_contract}} → 反向限制
 *   见 doc/plan-m3-character-workshop.md § 3.2
 */
export function renderCharacterArchive(archive: CharacterArchive): string {
  // 全空判断：name + description + promptSnippet + 参考图 都没就跳过
  const name = (archive.name ?? "").trim();
  const desc = (archive.description ?? "").trim();
  const snippet = (archive.promptSnippet ?? "").trim();
  const refCount = archive.referenceImageAssetIds?.length ?? 0;
  if (!name && !desc && !snippet && refCount === 0) return "";

  const lines: string[] = ["[角色档案]"];
  if (name) lines.push(`- 名称：${name}`);
  if (desc) lines.push(`- 描述：${desc}`);
  if (refCount > 0) {
    lines.push(`- 参考图：${refCount} 张（已附在 image[] 数组里）`);
  }
  if (snippet) {
    // 用户补充的 prompt 片段，独占一段
    lines.push("");
    lines.push(`[用户补充] ${snippet}`);
  }
  return lines.join("\n");
}

// ============================================================================
// IPC 层（仅在 Tauri runtime 里有意义；纯函数单测不需要这部分）
// ============================================================================
//
// Tauri command 在 src-tauri/src/commands.rs 里：
//   - character_archive_upsert
//   - character_archive_list
//   - character_archive_get
//   - character_archive_delete
//   - character_archive_attach_reference_image
//   - character_archive_detach_reference_image
//   - character_archive_increment_agent_use_count
//
// Rust 端返回的 CharacterArchiveRow 已经 snake_case → camelCase 序列化（#[serde(rename_all="camelCase")]），
// 跟前端 CharacterArchive 接口字段名一一对应。这里只做 JSON 字段适配，不做语义转换。

import { invoke } from "@tauri-apps/api/core";

/** Rust 端返回的 raw row（snake_case 序列化为 camelCase 后跟 CharacterArchive 一致） */
type CharacterArchiveRow = CharacterArchive;

/** 列出某项目可见的角色档案（含 scope=global）。Rust 自动按 updated_at DESC。 */
export async function listCharacterArchives(
  projectId: string,
): Promise<CharacterArchiveRow[]> {
  return await invoke<CharacterArchiveRow[]>("character_archive_list", { projectId });
}

/** 读取单条。不存在返回 null。 */
export async function getCharacterArchive(
  id: string,
): Promise<CharacterArchiveRow | null> {
  return await invoke<CharacterArchiveRow | null>("character_archive_get", { id });
}

/** 创建或更新。id 不传时 Rust 端生成 UUID。返回写回的完整行（带 createdAt/updatedAt）。 */
export async function upsertCharacterArchive(
  upsert: CharacterArchiveUpsert,
): Promise<CharacterArchiveRow> {
  const err = validateArchiveUpsert(upsert);
  if (err) throw new Error(err);
  // 把 TS 字段名映射到 Rust 端 JsCharacterArchiveUpsert（camelCase）
  return await invoke<CharacterArchiveRow>("character_archive_upsert", {
    input: {
      id: upsert.id ?? null,
      scope: upsert.scope,
      projectId: upsert.projectId ?? null,
      name: upsert.name,
      description: upsert.description,
      referenceImageAssetIds: upsert.referenceImageAssetIds ?? [],
      styleContractId: upsert.styleContractId ?? null,
      promptSnippet: upsert.promptSnippet ?? "",
      tags: upsert.tags ?? [],
      agentUseCount: upsert.agentUseCount ?? 0,
    },
  });
}

/** 删除档案。返回影响行数（0 = 不存在）。 */
export async function deleteCharacterArchive(id: string): Promise<number> {
  return await invoke<number>("character_archive_delete", { id });
}

/** 追加 1 个参考图 asset id 到档案。返回新的 ref 数组长度。 */
export async function attachReferenceImage(
  archiveId: string,
  assetId: string,
): Promise<number> {
  return await invoke<number>("character_archive_attach_reference_image", {
    archiveId,
    assetId,
  });
}

/** 移除 1 个参考图 asset id。返回新的 ref 数组长度。 */
export async function detachReferenceImage(
  archiveId: string,
  assetId: string,
): Promise<number> {
  return await invoke<number>("character_archive_detach_reference_image", {
    archiveId,
    assetId,
  });
}

/** Agent 工具触发：自增 agentUseCount 计数器。档案不存在返回 null。 */
export async function incrementAgentUseCount(
  archiveId: string,
): Promise<number | null> {
  return await invoke<number | null>(
    "character_archive_increment_agent_use_count",
    { archiveId },
  );
}

// ============================================================================
// M3.5 .json 导入导出
// ============================================================================
//
// 档案在 .json 文件里只带元数据（id / name / description / tags / etc.）。
// **不含 referenceImageAssetIds 的内容** — 资产图是本地 SQLite 资源，跨机器
// 共享靠 ReferenceImage 路径或重新生成。导入时用新 id 避免冲突。
//
// schemaVersion: 1 起始。后续字段变化时 bump，导入端拒绝不识别的版本。

/** 导出 / 导入 .json 顶层 schema */
export interface CharacterArchiveExportV1 {
  schemaVersion: 1;
  exportedAt: number;
  archives: Array<{
    // 原始 id（导出时记录，仅作人类可读，导入时重新生成）
    originalId: string;
    name: string;
    description: string;
    tags: string[];
    promptSnippet: string;
    scope: "project" | "global";
    /** scope=project 时，导出档案的项目名（导入端用来提示，不绑定 id） */
    sourceProjectName?: string;
  }>;
}

/** 把档案列表打包成 .json 字符串。空档案返回带空数组的合法 schema。 */
export function buildArchiveExportJson(
  archives: CharacterArchive[],
  projectName?: string,
): string {
  const payload: CharacterArchiveExportV1 = {
    schemaVersion: 1,
    exportedAt: Date.now(),
    archives: archives.map((a) => ({
      originalId: a.id,
      name: a.name,
      description: a.description,
      tags: a.tags,
      promptSnippet: a.promptSnippet,
      scope: a.scope,
      // scope=project 时记录项目名（仅供人类可读）
      sourceProjectName: a.scope === "project" ? projectName : undefined,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

/** 解析 .json 字符串。返回 (payload, 错误消息)。错误时 payload 为 null。 */
export function parseArchiveExportJson(
  raw: string,
): { payload: CharacterArchiveExportV1 } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    return { error: `JSON 解析失败：${e?.message ?? e}` };
  }
  if (!parsed || typeof parsed !== "object") {
    return { error: "JSON 顶层必须是对象" };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.schemaVersion !== 1) {
    return {
      error: `不支持的 schemaVersion：${obj.schemaVersion}（当前实现支持 1）`,
    };
  }
  if (!Array.isArray(obj.archives)) {
    return { error: "archives 字段必须是数组" };
  }
  // 简单逐项校验
  for (let i = 0; i < obj.archives.length; i++) {
    const a = obj.archives[i] as Record<string, unknown>;
    if (typeof a?.name !== "string" || !(a.name as string).trim()) {
      return { error: `第 ${i + 1} 项 name 缺失或为空` };
    }
    if (a.scope !== "project" && a.scope !== "global") {
      return { error: `第 ${i + 1} 项 scope 必须是 'project' 或 'global'` };
    }
  }
  return { payload: obj as unknown as CharacterArchiveExportV1 };
}

/** 在浏览器里下载 .json 文件 */
export function downloadArchiveJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================================
// M3.6 时间格式化(从 CharacterArchiveList 提到 lib 层,供 Picker / 详情复用)
// ============================================================================

/**
 * 把 updatedAt 毫秒时间戳格式化为「刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期」。
 * - < 1 分钟 → 刚刚
 * - < 1 小时 → N 分钟前
 * - < 1 天   → N 小时前
 * - < 7 天   → N 天前
 * - 其它     → 形如 2026-09-08 的本地日期
 */
export function formatArchiveUpdated(ms: number): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(ms).toLocaleDateString("zh-CN");
}
