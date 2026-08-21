/**
 * 火山方舟 Seedream 模型的运行时能力矩阵。
 * 每个 ModelOption 携带一份；UI 用它做参数显隐，Rust 端用 model id 走同样约束。
 *
 * 加新能力时同步更新：
 * 1. 后端 `validate_params`（互斥 / 专属参数）
 * 2. PromptBar 显隐逻辑
 * 3. doc/api-integration.md 的能力矩阵表
 */
export interface ModelCapabilities {
  /** 联网搜索（tools=[{type:"web_search"}]） */
  webSearch: boolean;
  /** SSE 流式输出 */
  stream: boolean;
  /** 提示词极速模式（optimize_prompt_options.mode="fast"） */
  fastMode: boolean;
  /** 透明背景输出（background="transparent"） */
  background: boolean;
  /** 图层拆分 */
  layerDecomposition: boolean;
  /** 交互编辑（bbox 标记） */
  interactiveEdit: boolean;
  /** 组图（sequential_image_generation=auto） */
  groupGeneration: boolean;
  /** 支持的输出文件格式 */
  outputFormats: ("png" | "jpeg")[];
  /** 分辨率档位（用于 SizeSelect 动态显示） */
  sizePresets: string[];
  /** 组图最大张数（含输入参考图总和，lite/4.5/4.0 = 15；pro 不支持组图 = 1） */
  maxGroupImages: number;
  /** 单次请求最大输入参考图数（pro=10；其它=14） */
  maxInputImages: number;
  /** 图层最大数量（pro=16；其它=0） */
  maxLayers: number;
}

export interface ModelOption {
  id: string;
  name: string;
  /** 旧字段保留，新代码请用 `capabilities.layerDecomposition` */
  supportsLayerDecomposition: boolean;
  /** 旧字段保留，新代码请用 `capabilities.groupGeneration` */
  supportsGroupGeneration: boolean;
  hint?: string;
  /** 模型能力矩阵（P0 起统一用这个做 UI 显隐和参数校验） */
  capabilities: ModelCapabilities;
}

/** Seedream 5.0 Lite 正式 Model ID（官方文档既支持 5-0-lite-260128 也支持 5-0-260128） */
const SEEDREAM_5_0_LITE_ALIASES = new Set([
  "doubao-seedream-5-0-lite-260128",
  "doubao-seedream-5-0-260128",
]);

/** 给任意 modelId（含自定义）反查能力矩阵，找不到就降级为"全部 false"的安全默认 */
export function modelCapabilities(id: string): ModelCapabilities {
  if (SEEDREAM_5_0_LITE_ALIASES.has(id)) return CAPABILITIES_5_0_LITE;
  const m = MODEL_OPTIONS.find((o) => o.id === id);
  if (m) return m.capabilities;
  return CAPABILITIES_CUSTOM;
}

const CAPABILITIES_5_0_PRO: ModelCapabilities = {
  webSearch: false,
  stream: false,
  fastMode: true,
  background: true,
  layerDecomposition: true,
  interactiveEdit: true,
  groupGeneration: false,
  outputFormats: ["png", "jpeg"],
  sizePresets: ["1k", "1.5k", "2k"],
  maxGroupImages: 1,
  maxInputImages: 10,
  maxLayers: 16,
};

const CAPABILITIES_5_0_LITE: ModelCapabilities = {
  webSearch: true,
  stream: true,
  fastMode: false,
  background: false,
  layerDecomposition: false,
  interactiveEdit: false,
  groupGeneration: true,
  outputFormats: ["png", "jpeg"],
  sizePresets: ["2k", "3k", "4k"],
  maxGroupImages: 15,
  maxInputImages: 14,
  maxLayers: 0,
};

const CAPABILITIES_4_5: ModelCapabilities = {
  webSearch: false,
  stream: true,
  fastMode: false,
  background: false,
  layerDecomposition: false,
  interactiveEdit: false,
  groupGeneration: true,
  outputFormats: ["jpeg"],
  sizePresets: ["2k", "4k"],
  maxGroupImages: 15,
  maxInputImages: 14,
  maxLayers: 0,
};

const CAPABILITIES_4_0: ModelCapabilities = {
  webSearch: false,
  stream: true,
  fastMode: true,
  background: false,
  layerDecomposition: false,
  interactiveEdit: false,
  groupGeneration: true,
  outputFormats: ["jpeg"],
  sizePresets: ["1k", "2k", "4k"],
  maxGroupImages: 15,
  maxInputImages: 14,
  maxLayers: 0,
};

/** 自定义 Endpoint 走最宽松默认：按 5.0 Lite 能力（最常用），让用户能试用 */
const CAPABILITIES_CUSTOM: ModelCapabilities = { ...CAPABILITIES_5_0_LITE };

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "doubao-seedream-5-0-lite-260128",
    name: "Seedream 5.0 Lite（默认）",
    supportsLayerDecomposition: false,
    supportsGroupGeneration: true,
    hint: "支持组图、联网搜索、流式，多数账号默认开通",
    capabilities: CAPABILITIES_5_0_LITE,
  },
  {
    id: "doubao-seedream-4-5-251128",
    name: "Seedream 4.5",
    supportsLayerDecomposition: false,
    supportsGroupGeneration: true,
    capabilities: CAPABILITIES_4_5,
  },
  {
    id: "doubao-seedream-4-0-250828",
    name: "Seedream 4.0",
    supportsLayerDecomposition: false,
    supportsGroupGeneration: true,
    hint: "支持极速模式（fast）和 1K",
    capabilities: CAPABILITIES_4_0,
  },
  {
    id: "doubao-seedream-5-0-pro-260628",
    name: "Seedream 5.0 Pro（需开通）",
    supportsLayerDecomposition: true,
    supportsGroupGeneration: false,
    hint: "支持图层拆分、交互编辑、背景透明——需在方舟控制台开通",
    capabilities: CAPABILITIES_5_0_PRO,
  },
  {
    id: "CUSTOM",
    name: "自定义 ID…",
    supportsLayerDecomposition: false,
    supportsGroupGeneration: true,
    hint: "按 5.0 Lite 能力兜底（PNG/JPEG、联网搜索、组图）",
    capabilities: CAPABILITIES_CUSTOM,
  },
];

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  assetCount: number;
}

/** 图层边界框（5.0 Pro 图层拆分场景） */
export interface BoundingBox {
  /** 绝对像素坐标 [left, top, right, bottom] */
  absolute?: number[];
  /** 归一化坐标 [left, top, right, bottom]（0-1000） */
  normalized?: number[];
}

/** 单图错误（组图场景下某张失败时填） */
export interface ImageError {
  code?: string;
  message?: string;
}

/** API 顶层 usage 透传 */
export interface Usage {
  generatedImages?: number;
  inputImages?: number;
  outputTokens?: number;
  totalTokens?: number;
  toolUsage?: { webSearch?: number };
}

export interface GeneratedImage {
  url: string;
  isBase64?: boolean;
  zIndex?: number;
  name?: string;
  description?: string;
  /** 实际像素尺寸，如 `2048x2048` */
  size?: string;
  /** 输出文件格式：png|jpeg */
  outputFormat?: string;
  /** 图层边界框（5.0 Pro 图层拆分场景） */
  boundingBox?: BoundingBox;
  /** 单图错误（组图场景下某张失败时填） */
  error?: ImageError;
  /** P5：本地缓存绝对路径。优先用这个，缺失时回退 url */
  localPath?: string;
}

export interface AssetPayload {
  /** 单图/组图时所有图的 url 列表 */
  urls: string[];
  /** 图层拆分时的图层（按 zIndex 升序，0 是底图） */
  layers?: GeneratedImage[];
  /** P0：API 顶层 usage 入库，便于"今日生成 N 张"统计 */
  usage?: Usage;
  /** P3：局部编辑溯源——哪个资产编辑出来的 */
  parentAssetId?: string;
  /** P3：局部编辑时画的 bbox（图像素坐标，x1 y1 x2 y2） */
  bbox?: { x1: number; y1: number; x2: number; y2: number };
  /** P4：透明背景标志（PNG + transparent），用于 AssetCard 角标 */
  transparent?: boolean;
  /** P4：实际输出格式（png|jpeg），便于资产详情页显示 */
  outputFormat?: "png" | "jpeg";
  /** P5：本地缓存绝对路径列表（与 urls 平行）。优先用这个，缺失时回退 url。 */
  localPaths?: string[];
  /** P5：图层拆分的图层本地路径（与 layers 平行） */
  layerLocalPaths?: string[];
  /** P5+：本地兜底失败时由后端标 true（24h URL 失效等），UI 显示"图已过期" */
  broken?: boolean;
  /** 风格契约短哈希（8 字符）。本资产生成时所遵循的项目级 style-contract 标识。
   *  P0 新增：为空表示"无契约"（早期数据 / demo 模式 / 首次进入未配置的项目）。 */
  styleContractId?: string;
  /** 生成此资产的 Skill id（如 `character-turnaround` / `ui-icons`）。
   *  P0 新增：让资产库可以按 Skill 维度筛选/统计，也方便后续契约变更时定位受影响的 skill。 */
  sourceSkillId?: string;
  /** P1：资产状态机。pending-generation（生图失败/未跑完）、approved（生图成功，可信）、stale（契约已变，资产与现契约不一致） */
  status?: "pending-generation" | "approved" | "stale";
  /** P1：相关资产 id 列表。组件拆解时填源 page id；风格契约变更时反向关联等。 */
  relatedAssetIds?: string[];
  /** P1：组件契约 id（拆页面为组件时绑定 ui-component-breakdown 的产物）。 */
  componentContractId?: string;
}

export interface Asset {
  id: string;
  projectId: string;
  prompt: string;
  model: string;
  modelName: string;
  size: string;
  refCount: number;
  costMs: number;
  isLayerDecomposition: boolean;
  payload: AssetPayload;
  createdAt: number;
}

/**
 * 工具函数：合并普通生成的 urls 和图层拆分的 layers 为统一的展示列表
 * - 非图层拆分：返回 payload.urls
 * - 图层拆分：按 zIndex 升序返回 layers（图层在前 / 底图在后）
 */
function layerZIndex(img: GeneratedImage): number {
  // 兼容旧数据：早期后端序列化的是 z_index，新数据是 zIndex。
  return img.zIndex ?? (img as GeneratedImage & { z_index?: number }).z_index ?? 0;
}

export function flatAssetImages(asset: Asset): GeneratedImage[] {
  if (asset.isLayerDecomposition && asset.payload.layers?.length) {
    const rawLayers = asset.payload.layers;
    const layerLocalPaths = asset.payload.layerLocalPaths ?? [];
    // layerLocalPaths 与 payload.layers 原始顺序平行；排序时同步移动 localPath，
    // 避免按 zIndex 排序后路径错位。
    return rawLayers
      .map((layer, i) => ({
        layer,
        localPath: layerLocalPaths[i],
      }))
      .sort((a, b) => layerZIndex(a.layer) - layerZIndex(b.layer))
      .map(({ layer, localPath }) =>
        layer.localPath
          ? layer
          : localPath
          ? { ...layer, localPath }
          : layer
      );
  }
  // P5：把 localPaths 拼到每个 GeneratedImage 上
  const urls = asset.payload.urls ?? [];
  const localPaths = asset.payload.localPaths ?? [];
  return urls.map((u, i) => ({
    url: u,
    ...(localPaths[i] ? { localPath: localPaths[i] } : {}),
  }));
}

/** 取资产的主图：图层拆分取底图（zIndex=0），否则取 urls[0]
 *  返回的可能是外链 URL（http://）或本地绝对路径（Windows 路径）。
 *  上层应通过 `@/lib/image-resolver` 的 `resolveImageUrl` 异步转成可用的 data URL。
 *  P5：优先 localPath，没有时回退 url。 */
export function assetMainImage(asset: Asset): string | null {
  if (asset.isLayerDecomposition && asset.payload.layers?.length) {
    const rawLayers = asset.payload.layers;
    const layerLocalPaths = asset.payload.layerLocalPaths ?? [];
    let baseIdx = rawLayers.findIndex((l) => layerZIndex(l) === 0);
    if (baseIdx === -1) baseIdx = 0;
    const base = rawLayers[baseIdx];
    return layerLocalPaths[baseIdx] ?? base?.localPath ?? base?.url ?? rawLayers[0]?.url ?? null;
  }
  const local = asset.payload.localPaths?.[0];
  return local ?? asset.payload.urls?.[0] ?? null;
}

/** 同步版：从 GeneratedImage 拿"输入路径"（localPath 优先，回退 url） */
export function imageInput(img: GeneratedImage): string {
  return img.localPath ?? img.url;
}
