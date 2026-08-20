import { describe, it, expect } from "vitest";
import { resolveActualFormat } from "@/components/workspace/tools/runTool";
import { resolveFormat } from "@/lib/asset-payload";

/**
 * runTool.ts 内的 resolveActualFormat 现在是 asset-payload.resolveFormat 的
 * thin wrapper（不传 modelId，所以不做模型兜底）。本文件保留为该 wrapper 的
 * 回归测试，并补充 resolveFormat 在 ToolsTab 典型场景下的行为。
 */
describe("resolveActualFormat — thin wrapper over resolveFormat", () => {
  it("响应里有 png 时返回 png（忽略请求值）", () => {
    expect(resolveActualFormat("png", undefined)).toBe("png");
    expect(resolveActualFormat("png", "jpeg")).toBe("png");
  });

  it("响应里有 jpeg 时返回 jpeg（修复 4.5/4.0 路径不读响应的 bug）", () => {
    // 4.5/4.0 不支持自定义，请求里没带，但响应会返 jpeg
    expect(resolveActualFormat("jpeg", undefined)).toBe("jpeg");
  });

  it("响应缺失时回退到请求值", () => {
    expect(resolveActualFormat(undefined, "png")).toBe("png");
    expect(resolveActualFormat(undefined, "jpeg")).toBe("jpeg");
  });

  it("响应和请求都没值时返回 undefined（不写库）", () => {
    expect(resolveActualFormat(undefined, undefined)).toBeUndefined();
  });

  it("未知字符串一律当 undefined（防 webp 等格式污染数据）", () => {
    expect(resolveActualFormat("webp", undefined)).toBeUndefined();
    expect(resolveActualFormat("PNG", undefined)).toBeUndefined(); // 大小写敏感
  });

  it("空串走严格 ===，跳过 resp 用 req 兜底（与旧 ?? 行为不同，更可预测）", () => {
    // 旧实现: "" ?? "png" = ""，最终 undefined
    // 新实现: "" !== "png"/"jpeg"，跳过 resp；"png" === "png"，返回 "png"
    // 行为差异：wrapper 现在更激进地用请求值兜底，避免外部传空串时漏写
    expect(resolveActualFormat("", "png")).toBe("png");
  });
});

describe("resolveFormat 在 ToolsTab 典型场景下", () => {
  it("5.0 Pro 同步：响应有 png → 用响应", () => {
    expect(
      resolveFormat({
        respFormat: "png",
        reqFormat: undefined,
        modelId: "doubao-seedream-5-0-pro-260628",
      })
    ).toBe("png");
  });

  it("5.0 Lite 流式 completed：响应缺失 + 请求缺失 → 模型兜底 png", () => {
    expect(
      resolveFormat({
        respFormat: undefined,
        reqFormat: undefined,
        modelId: "doubao-seedream-5-0-lite-260628",
      })
    ).toBe("png");
  });

  it("4.5 流式：响应缺失 + 请求缺失 → 保持 undefined（不兜底）", () => {
    expect(
      resolveFormat({
        respFormat: undefined,
        reqFormat: undefined,
        modelId: "jimeng-4.5",
      })
    ).toBeUndefined();
  });
});
