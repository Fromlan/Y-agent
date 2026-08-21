/**
 * 项目级风格契约（Style Contract）
 *
 * 背景：参考项目 game-ui-design-workflow 用 Spec-Kit 风格的
 * `contracts/style-contract.yaml` 串联多页 UI 视觉一致性。我们做单人
 * 工具版，简化为 SQLite `projects.style_contract` JSON 列 + 8 字符
 * 短哈希 `checksum`（写入资产 `payload.styleContractId`）。
 *
 * 工作流：
 *  1. 用户在 AgentMemoryPanel 或首启引导里回答 4 个问题（画风/主色/线宽/光向）
 *  2. 落到 `projects.style_contract` JSON 列
 *  3. 每次生图把 `checksum` 写进 `AssetPayload.styleContractId`
 *  4. 改契约时（checksum 变了）→ 把所有同 `styleContractId` 的资产标 `stale`
 *
 * 字段定义与约束：
 *  - palette: { primary, accent, warning, background, ... } → string[] 颜色值
 *  - line_weight: "thin" | "medium" | "thick"
 *  - light_direction: "top" | "top-left" | "left" | "right" | "top-right" | "bottom"
 *  - art_style: string（画风名，如"二次元"、"写实厚涂"、"美卡"）
 *  - reference_asset_ids: string[]（参考图资产 id 列表）
 *  - additional: Record<string, unknown>（用户自定义字段，透传）
 */
import { invoke } from "@tauri-apps/api/core";
import { log } from "@/lib/logger";

/** 风格契约字段定义 */
export interface StyleContract {
  version: 1;
  art_style?: string;
  palette?: {
    primary?: string[];
    accent?: string[];
    warning?: string[];
    background?: string[];
  };
  line_weight?: "thin" | "medium" | "thick";
  light_direction?: "top" | "top-left" | "left" | "right" | "top-right" | "bottom";
  reference_asset_ids?: string[];
  additional?: Record<string, unknown>;
  /** 8 字符短哈希，由 computeChecksum 写入；存储时跟其他字段一起序列化 */
  checksum: string;
  created_at: number;
  updated_at: number;
}

export const EMPTY_STYLE_CONTRACT: StyleContract = {
  version: 1,
  checksum: "",
  created_at: 0,
  updated_at: 0,
};

/**
 * 计算契约的 8 字符短哈希。
 * 用 Web Crypto SubtleCrypto.digest("SHA-256")，取前 4 字节转 hex。
 * 算法与 P0 计划的 `styleContractId` 字段定义保持一致。
 *
 * 不变量：只 hash 业务字段（art_style / palette / line_weight / light_direction /
 * reference_asset_ids / additional / version）；metadata 字段（checksum / created_at /
 * updated_at）不参与。这样改 created_at 不会改变合约身份。
 *
 * 注意：JSON.stringify 的第二参是 replacer——传 array 时会被当成"所有层级的
 * key 白名单"而不是"排序工具"（会过滤掉 palette.primary 等嵌套键）。
 * 这里用 sort + 手工构造 key 顺序,避开这个坑。
 */
export async function computeChecksum(contract: StyleContract): Promise<string> {
  const businessOnly = {
    additional: contract.additional,
    art_style: contract.art_style,
    light_direction: contract.light_direction,
    line_weight: contract.line_weight,
    palette: contract.palette,
    reference_asset_ids: contract.reference_asset_ids,
    version: contract.version,
  };
  const serialized = JSON.stringify(businessOnly);
  const bytes = new TextEncoder().encode(serialized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest).slice(0, 4);
  return Array.from(view)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 把传入的字段（新契约或部分更新）转成完整 StyleContract，并计算 checksum */
export async function buildStyleContract(
  input: Omit<StyleContract, "checksum" | "created_at" | "updated_at"> & {
    /** 复用现有 created_at（更新场景） */
    created_at?: number;
  }
): Promise<StyleContract> {
  const now = Date.now();
  const base = {
    version: 1 as const,
    art_style: input.art_style,
    palette: input.palette,
    line_weight: input.line_weight,
    light_direction: input.light_direction,
    reference_asset_ids: input.reference_asset_ids,
    additional: input.additional,
  };
  const checksum = await computeChecksum({ ...base, checksum: "", created_at: now, updated_at: now });
  return {
    ...base,
    checksum,
    created_at: input.created_at ?? now,
    updated_at: now,
  };
}

/** 从后端读项目契约。未设置返回 EMPTY_STYLE_CONTRACT（checksum=""，视为"无契约"） */
export async function loadStyleContract(projectId: string): Promise<StyleContract> {
  try {
    const json = await invoke<string | null>("style_contract_get", { projectId });
    if (!json) return { ...EMPTY_STYLE_CONTRACT };
    const parsed = JSON.parse(json) as Partial<StyleContract>;
    return {
      version: 1,
      art_style: typeof parsed.art_style === "string" ? parsed.art_style : undefined,
      palette: parsed.palette,
      line_weight: parsed.line_weight as StyleContract["line_weight"],
      light_direction: parsed.light_direction as StyleContract["light_direction"],
      reference_asset_ids: Array.isArray(parsed.reference_asset_ids)
        ? parsed.reference_asset_ids.filter((x): x is string => typeof x === "string")
        : [],
      additional:
        typeof parsed.additional === "object" && parsed.additional
          ? (parsed.additional as Record<string, unknown>)
          : undefined,
      checksum: typeof parsed.checksum === "string" ? parsed.checksum : "",
      created_at: typeof parsed.created_at === "number" ? parsed.created_at : 0,
      updated_at: typeof parsed.updated_at === "number" ? parsed.updated_at : 0,
    };
  } catch (e) {
    log.warn("style-contract", "load failed:", e);
    return { ...EMPTY_STYLE_CONTRACT };
  }
}

/**
 * 保存项目契约（后端负责比较 checksum 变化，标记 stale 资产）。
 * 传入 string "" 等价于清除。
 */
export async function saveStyleContract(projectId: string, contract: StyleContract): Promise<void> {
  await invoke("style_contract_update", {
    projectId,
    json: JSON.stringify(contract),
  });
}

/** 把契约转成正向 prompt 末尾追加的"风格"段。无契约返回空串 */
export function renderStyleContract(contract: StyleContract): string {
  if (!contract.checksum) return "";
  const lines: string[] = ["[项目风格契约]"];
  if (contract.art_style) lines.push(`- 画风：${contract.art_style}`);
  if (contract.palette?.primary?.length) {
    lines.push(`- 主色：${contract.palette.primary.join(" / ")}`);
  }
  if (contract.palette?.accent?.length) {
    lines.push(`- 辅色：${contract.palette.accent.join(" / ")}`);
  }
  if (contract.line_weight) {
    const map: Record<string, string> = { thin: "细线", medium: "中线", thick: "粗线" };
    lines.push(`- 线宽：${map[contract.line_weight] ?? contract.line_weight}`);
  }
  if (contract.light_direction) {
    const map: Record<string, string> = {
      top: "顶光",
      "top-left": "左顶光",
      left: "左侧光",
      right: "右侧光",
      "top-right": "右顶光",
      bottom: "底光",
    };
    lines.push(`- 光向：${map[contract.light_direction] ?? contract.light_direction}`);
  }
  if (contract.reference_asset_ids && contract.reference_asset_ids.length > 0) {
    lines.push(`- 参考图：${contract.reference_asset_ids.length} 张（已附在 images）`);
  }
  return lines.join("\n");
}
