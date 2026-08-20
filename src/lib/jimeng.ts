import { invoke } from "@tauri-apps/api/core";
import type { GeneratedImage, Usage, ImageError } from "@/lib/types";

export interface GenerateImageParams {
  model: string;
  prompt: string;
  image?: string[];
  size?: string;
  /** 仅当需要组图时设置；不要传 "disabled" */
  sequential?: "auto";
  maxImages?: number;
  layerDecomposition?: boolean;
  /**
   * 是否在生成图右下角加 "AI生成" 水印。
   * 留空走 Y-agent 默认（不加）；Seedream API 默认 true，Y-agent 后端会显式补 false 关闭。
   * 如未来需要 UI 开关，往这里传 true/false 即可。
   */
  watermark?: boolean;
  /** 输出文件格式：png | jpeg。仅 5.0 Pro / 5.0 Lite 支持。 */
  outputFormat?: "png" | "jpeg";
  /** 工具调用。当前仅支持 web_search（5.0 Lite 专属）。 */
  tools?: Array<"web_search">;
  /** 提示词优化模式：standard | fast。fast 仅 5.0 Pro / 4.0 支持。 */
  optimizePromptMode?: "standard" | "fast";
  /** 背景透明：transparent | opaque。仅 5.0 Pro 专属。 */
  background?: "transparent" | "opaque";
}

export interface GenerateImageResponse {
  images: GeneratedImage[];
  /** 是否走 demo 模式（不消耗 token） */
  isDemo: boolean;
  /** API 顶层 usage（生成张数 / token / 工具调用次数） */
  usage?: Usage;
  /** API 顶层 error（整个请求都失败时） */
  error?: ImageError;
}

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResponse> {
  return await invoke<GenerateImageResponse>("jimeng_generate", { params });
}

/** 把后端原始错误信息转成更友好的提示 */
export async function explainError(raw: string): Promise<string> {
  return await invoke<string>("explain_error", { raw });
}
