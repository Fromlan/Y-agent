export interface ModelOption {
  id: string;
  name: string;
  supportsLayerDecomposition: boolean;
  supportsGroupGeneration: boolean;
  hint?: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "doubao-seedream-5-0-lite-260128",
    name: "Seedream 5.0 Lite（默认）",
    supportsLayerDecomposition: false,
    supportsGroupGeneration: true,
    hint: "支持组图和联网搜索，能力最全，多数账号默认开通",
  },
  {
    id: "doubao-seedream-4-5-251128",
    name: "Seedream 4.5",
    supportsLayerDecomposition: false,
    supportsGroupGeneration: true,
  },
  {
    id: "doubao-seedream-4-0-250828",
    name: "Seedream 4.0",
    supportsLayerDecomposition: false,
    supportsGroupGeneration: true,
  },
  {
    id: "doubao-seedream-5-0-pro-260628",
    name: "Seedream 5.0 Pro（需开通）",
    supportsLayerDecomposition: true,
    supportsGroupGeneration: false,
    hint: "支持图层拆分和交互编辑——需在方舟控制台开通",
  },
  {
    id: "CUSTOM",
    name: "自定义 ID…",
    supportsLayerDecomposition: false,
    supportsGroupGeneration: true,
  },
];

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  assetCount: number;
}

export interface GeneratedImage {
  url: string;
  isBase64?: boolean;
  zIndex?: number;
  name?: string;
  description?: string;
}

export interface AssetPayload {
  /** 单图/组图时所有图的 url 列表 */
  urls: string[];
  /** 图层拆分时的图层（按 zIndex 升序，0 是底图） */
  layers?: GeneratedImage[];
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
    return [...asset.payload.layers].sort((a, b) => layerZIndex(a) - layerZIndex(b));
  }
  return (asset.payload.urls ?? []).map((u) => ({ url: u }));
}

/** 取资产的主图：图层拆分取底图（zIndex=0），否则取 urls[0] */
export function assetMainImage(asset: Asset): string | null {
  if (asset.isLayerDecomposition && asset.payload.layers?.length) {
    const base = [...asset.payload.layers].find((l) => layerZIndex(l) === 0);
    return base?.url ?? asset.payload.layers[0].url;
  }
  return asset.payload.urls?.[0] ?? null;
}
