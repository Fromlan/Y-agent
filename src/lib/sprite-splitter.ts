/**
 * 雪碧图切分器（P2）
 *
 * 把一张"网格状"雪碧图按 rows × cols 切成 N 个独立 PNG。
 * 后端 Rust 端用 `image` crate 读图 + crop + save，再用 `zip` crate 打包。
 *
 * 用法：
 *   const result = await splitSpriteSheet({
 *     inputPath: 'C:/.../sprite.png',
 *     rows: 3,
 *     cols: 3,
 *     outputDir: 'C:/.../tiles',
 *     baseName: 'icon',
 *     outputZip: true,
 *   });
 *   // result.tiles = [{ index, row, col, path, width, height }, ...]
 *   // result.zipPath = 'C:/.../tiles/icon.zip'
 *
 * 与 ui-component-breakdown 的关系：
 *  - ui-component-breakdown 输出"独立组件"（无需切图）
 *  - 本工具处理"一张网格图 → 多个独立 PNG"（典型用例：图标合集 / UI 元素拼版）
 */
import { invoke } from "@tauri-apps/api/core";

export interface SplitSpriteSheetParams {
  /** 源 PNG/JPG 绝对路径 */
  inputPath: string;
  /** 行数（≥1） */
  rows: number;
  /** 列数（≥1） */
  cols: number;
  /** 输出目录（不存在会创建） */
  outputDir: string;
  /** 输出文件名前缀（默认 "tile"） */
  baseName?: string;
  /** 是否同时打包成 ZIP */
  outputZip?: boolean;
}

export interface SplitTile {
  index: number;
  row: number;
  col: number;
  path: string;
  width: number;
  height: number;
}

export interface SplitResult {
  sourceWidth: number;
  sourceHeight: number;
  rows: number;
  cols: number;
  tiles: SplitTile[];
  zipPath: string | null;
}

/**
 * 调用 Rust 端 split_sprite_sheet 命令。
 * 出错时抛 Error，错误信息含 Rust 端的具体原因（尺寸不整除等）。
 */
export async function splitSpriteSheet(
  params: SplitSpriteSheetParams
): Promise<SplitResult> {
  return await invoke<SplitResult>("split_sprite_sheet", {
    inputPath: params.inputPath,
    rows: params.rows,
    cols: params.cols,
    outputDir: params.outputDir,
    baseName: params.baseName ?? null,
    outputZip: params.outputZip ?? false,
  });
}
