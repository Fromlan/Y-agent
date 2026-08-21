/**
 * 资产库入库的统一抽象层。
 *
 * 背景：之前有 6 个 `createAsset` 调用点（agent-flow.ts × 3 / runTool.ts × 2 /
 * AssetDetailDialog.tsx × 1）各自手写 payload 对象，format 字段来源不统一，
 * 导致 5.0 系列 partial 资产、局部编辑资产等场景下 `outputFormat` 字段缺失，
 * 详情页"格式"显示 "—"。
 *
 * 本文件提供两个纯函数：
 * - `resolveFormat`：统一 format 解析规则（响应 > 请求 > 模型归一化）
 * - `buildAssetPayload`：统一 payload 构造逻辑（消除 6 处重复）
 *
 * 所有 createAsset 调用点都必须通过这两个函数构造 payload，禁止再手写
 * `payload.outputFormat` 等字段（避免再次发生字段遗漏）。
 */
import type { AssetPayload, GeneratedImage, Usage } from "@/lib/types";
import { applyOutputFormatDefault } from "@/lib/jimeng";

/** 局部编辑时画的 bbox（图像素坐标，x1 y1 x2 y2） */
export type Bbox = { x1: number; y1: number; x2: number; y2: number };

/**
 * 入库 payload 的输入。所有字段 optional（除 urls），让每个入库点只传它有数据的字段。
 * `isTransparent` 必填（即使 false 也要显式传），避免与 transparent 标志混在一起漏写。
 */
export interface BuildAssetPayloadInput {
  /** 单图/组图时所有图的 url 列表（必填） */
  urls: string[];
  /** 图层拆分时的图层 */
  layers?: GeneratedImage[];
  /** API 顶层 usage */
  usage?: Usage;
  /** 局部编辑溯源——哪个资产编辑出来的 */
  parentAssetId?: string;
  /** 局部编辑时画的 bbox */
  bbox?: Bbox;
  /** 透明背景标志（PNG + transparent） */
  isTransparent: boolean;
  /** 本地缓存绝对路径（与 urls 平行） */
  localPaths?: string[];
  /** 图层拆分的图层本地路径（与 layers 平行） */
  layerLocalPaths?: string[];
  /** 风格契约短哈希（8 字符）。P0 新增，可选。 */
  styleContractId?: string;
  /** 生成此资产的 Skill id。P0 新增，可选。 */
  sourceSkillId?: string;
  /** P1：资产状态机。approved 显式传；缺省时不在 payload 里写（保留 SQLite 旧数据兼容）。 */
  status?: "pending-generation" | "approved" | "stale";
  /** P1：相关资产 id 列表（拆解时填源 page id）。 */
  relatedAssetIds?: string[];
  /** P1：组件契约 id。 */
  componentContractId?: string;
}

/**
 * 统一 format 解析规则。
 *
 * 优先级：
 * 1. 响应有合法值（来自 API）→ 用响应（最权威，能反映 API 实际行为）
 * 2. 请求有合法值 → 用请求（用户在 PromptBar 显式选的）
 * 3. 模型归一化兜底（5.0 Pro/Lite = "png"，4.5/4.0 = undefined）
 *
 * 严格判断大小写（只认小写 "png" / "jpeg"），避免 resp.output_format
 * 偶发返回 "PNG" / "Webp" 等导致入库污染。
 *
 * 适用场景：
 * - 同步生图（5.0 Pro / runToolSync / 局部编辑）：传 respFormat
 * - 流式 completed 主资产：传 respFormat（来自 onCompleted info.output_format）
 * - 流式 partial 资产：传 reqFormat（partial 阶段还没拿到 API 响应）
 */
export function resolveFormat(opts: {
  respFormat: string | undefined;
  reqFormat: "png" | "jpeg" | undefined;
  modelId: string;
}): "png" | "jpeg" | undefined {
  if (opts.respFormat === "png" || opts.respFormat === "jpeg") {
    return opts.respFormat;
  }
  if (opts.reqFormat === "png" || opts.reqFormat === "jpeg") {
    return opts.reqFormat;
  }
  // 模型兜底（5.0 Pro/Lite = "png"；4.5/4.0 = undefined，partial 阶段保持缺口）
  return applyOutputFormatDefault({
    model: opts.modelId,
    prompt: "",
    outputFormat: undefined,
  }).outputFormat;
}

/**
 * 统一 payload 构造逻辑。所有入库点必须通过本函数构造 payload。
 *
 * 设计要点：
 * - format 字段是权威来源：`buildAssetPayload` 只接受已归一化的
 *   `"png" | "jpeg" | undefined`，调用方负责先调 `resolveFormat`
 * - 只写有数据的字段，避免 `null` / 空对象污染 JSON
 * - 输出顺序尽量与 AssetPayload 类型声明一致，便于阅读
 */
export function buildAssetPayload(
  input: BuildAssetPayloadInput,
  format: "png" | "jpeg" | undefined
): AssetPayload {
  const payload: AssetPayload = {
    urls: input.urls,
  };
  if (input.layers && input.layers.length > 0) {
    payload.layers = input.layers;
  }
  if (input.usage) {
    payload.usage = input.usage;
  }
  if (input.parentAssetId) {
    payload.parentAssetId = input.parentAssetId;
  }
  if (input.bbox) {
    payload.bbox = input.bbox;
  }
  if (input.isTransparent) {
    payload.transparent = true;
  }
  if (format) {
    payload.outputFormat = format;
  }
  if (input.localPaths && input.localPaths.length > 0) {
    payload.localPaths = input.localPaths;
  }
  if (input.layerLocalPaths && input.layerLocalPaths.length > 0) {
    payload.layerLocalPaths = input.layerLocalPaths;
  }
  // P0：风格契约短哈希（项目级视觉契约标识，无契约时缺省）
  if (input.styleContractId) {
    payload.styleContractId = input.styleContractId;
  }
  // P0：生成本资产时命中的 Skill id（便于按 Skill 维度筛选/统计）
  if (input.sourceSkillId) {
    payload.sourceSkillId = input.sourceSkillId;
  }
  // P1：资产状态机（显式传才写，老 SQLite 数据保留）
  if (input.status) {
    payload.status = input.status;
  }
  if (input.relatedAssetIds && input.relatedAssetIds.length > 0) {
    payload.relatedAssetIds = input.relatedAssetIds;
  }
  if (input.componentContractId) {
    payload.componentContractId = input.componentContractId;
  }
  return payload;
}
