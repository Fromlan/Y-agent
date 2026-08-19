import { invoke } from "@tauri-apps/api/core";
import type { GeneratedImage } from "@/lib/types";

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
}

export interface GenerateImageResponse {
  images: GeneratedImage[];
  /** 是否走 demo 模式（不消耗 token） */
  isDemo: boolean;
}

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResponse> {
  return await invoke<GenerateImageResponse>("jimeng_generate", { params });
}

/** 把后端原始错误信息转成更友好的提示 */
export async function explainError(raw: string): Promise<string> {
  return await invoke<string>("explain_error", { raw });
}
