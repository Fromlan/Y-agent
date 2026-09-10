import {
  Layers,
  Search,
  Droplet,
  Brush,
  Grid3x3,
  Scissors,
} from "lucide-react";
import type { Asset } from "@/lib/types";

export type ToolKind =
  | "batch"
  | "websearch"
  | "transparent"
  | "layers"
  | "localedit"
  | "splitsprite";

export interface ToolDef {
  id: ToolKind;
  title: string;
  desc: string;
  icon: typeof Layers;
  tag: string;
}

export const TOOLS: ToolDef[] = [
  {
    id: "batch",
    title: "批量组图",
    desc: "一次出 N 张同 prompt（适合挑选用）",
    icon: Grid3x3,
    tag: "5.0 Lite / 4.5 / 4.0",
  },
  {
    id: "websearch",
    title: "联网出图",
    desc: "模型先搜互联网再画（天气、商品等实时信息）",
    icon: Search,
    tag: "5.0 Lite",
  },
  {
    id: "transparent",
    title: "背景去背",
    desc: "把已有图导出为 PNG 透明背景（UI 图标 / 素材）",
    icon: Droplet,
    tag: "5.0 Pro",
  },
  {
    id: "layers",
    title: "图层拆分",
    desc: "把一张图拆为底图 + 多个可编辑图层",
    icon: Layers,
    tag: "5.0 Pro",
  },
  {
    id: "localedit",
    title: "局部编辑",
    desc: "在图上画框 + 改写 prompt 重画局部",
    icon: Brush,
    tag: "5.0 Pro",
  },
  {
    id: "splitsprite",
    title: "雪碧图切分",
    desc: "把网格状雪碧图切成多张 PNG + ZIP",
    icon: Scissors,
    tag: "本地工具",
  },
];

/** 5.0 Pro / 5.0 Lite 模型的固定 ID（避免被 MODEL_OPTIONS 别名变更影响） */
export const PRO_ID = "doubao-seedream-5-0-pro-260628";
export const LITE_ID = "doubao-seedream-5-0-lite-260128";
export const PRO_NAME = "Seedream 5.0 Pro";

/** 判断资产主图是否为 JPEG —— 5.0 Pro「背景透明」必须用 PNG。 */
export function isAssetJpeg(asset: Asset): boolean {
  const url = asset.payload?.urls?.[0] ?? "";
  const stripped = url.split("?")[0].split("#")[0].toLowerCase();
  return /\.(jpe?g)(\.|$)/i.test(stripped);
}
