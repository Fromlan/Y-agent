/**
 * 主题清单。
 *
 * - id 必须与 index.css 里的 [data-theme="xxx"] 选择器一致
 * - swatches 用于设置面板的色板预览（不参与实际渲染）
 * - 新增主题：往 THEMES 加一条 + 在 index.css 加一段 [data-theme="xxx"] 定义
 */

export interface ThemeMeta {
  /** 用于 <html data-theme="xxx"> */
  id: "dark" | "light" | "cyber" | "forest";
  /** 中文名（设置面板显示） */
  name: string;
  /** 一句话说明 */
  description: string;
  /** 6 块色板：base / panel / elev / accent / accent-hover / text-primary */
  swatches: [string, string, string, string, string, string];
}

export const THEMES: ThemeMeta[] = [
  {
    id: "dark",
    name: "暗夜",
    description: "Y-agent 品牌默认主题：炭灰底 + 珊瑚红强调",
    swatches: ["#0e0f13", "#16181e", "#1e2128", "#ff5c4d", "#ff7568", "#f2ebdb"],
  },
  {
    id: "light",
    name: "晨光",
    description: "米白底 + 珊瑚红强调，截图分享友好",
    swatches: ["#f2ebdb", "#ffffff", "#faf7f0", "#ff5c4d", "#e54738", "#0e0f13"],
  },
  {
    id: "cyber",
    name: "赛博",
    description: "霓虹青+暗紫，强对比氛围感",
    swatches: ["#050510", "#0a0a18", "#111126", "#00f0ff", "#50f8ff", "#e8f0ff"],
  },
  {
    id: "forest",
    name: "森林",
    description: "苔藓绿治愈系，低饱和不刺眼",
    swatches: ["#0e1410", "#141c16", "#1c2620", "#6cd28e", "#8ee2a8", "#e8efe8"],
  },
];

export const DEFAULT_THEME_ID: ThemeMeta["id"] = "dark";

export function isThemeId(v: unknown): v is ThemeMeta["id"] {
  return typeof v === "string" && THEMES.some((t) => t.id === v);
}
