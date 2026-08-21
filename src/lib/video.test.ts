/**
 * 视频场景判定 / 比例规则 / 参数校验单测。
 *
 * 覆盖：
 * - detectVideoScenario：t2va / i2va / r2va / invalid 四种输入
 * - validateAndFixParams：合法参数（三种场景）+ 非法参数（缺 text、t2va 缺 ratio、t2va ratio=adaptive、duration 越界）
 * - i2va ratio 强制 adaptive 修正
 * - r2va ratio 默认 adaptive
 */
import { describe, it, expect } from "vitest";
import {
  detectVideoScenario,
  validateAndFixParams,
  type ContentItem,
  type SubmitVideoParams,
} from "@/lib/video";

const baseParams = (overrides: Partial<SubmitVideoParams> = {}): SubmitVideoParams => ({
  model: "MiniMax-H3",
  content: [{ type: "text", text: "test prompt" }],
  resolution: "2K",
  duration: 5,
  ...overrides,
});

describe("detectVideoScenario", () => {
  it("t2va: 仅 text", () => {
    const content: ContentItem[] = [{ type: "text", text: "x" }];
    expect(detectVideoScenario(content)).toBe("t2va");
  });

  it("i2va: 1 张 first_frame", () => {
    const content: ContentItem[] = [
      { type: "text", text: "x" },
      { type: "image_url", image_url: { url: "data:," }, role: "first_frame" },
    ];
    expect(detectVideoScenario(content)).toBe("i2va");
  });

  it("i2va: first_frame + last_frame", () => {
    const content: ContentItem[] = [
      { type: "text", text: "x" },
      { type: "image_url", image_url: { url: "data:," }, role: "first_frame" },
      { type: "image_url", image_url: { url: "data:," }, role: "last_frame" },
    ];
    expect(detectVideoScenario(content)).toBe("i2va");
  });

  it("r2va: reference_image", () => {
    const content: ContentItem[] = [
      { type: "text", text: "x" },
      { type: "image_url", image_url: { url: "data:," }, role: "reference_image" },
    ];
    expect(detectVideoScenario(content)).toBe("r2va");
  });

  it("r2va: reference_video + reference_audio", () => {
    const content: ContentItem[] = [
      { type: "text", text: "x" },
      { type: "video_url", video_url: { url: "https://x/y.mp4" }, role: "reference_video" },
      { type: "audio_url", audio_url: { url: "https://x/y.mp3" }, role: "reference_audio" },
    ];
    expect(detectVideoScenario(content)).toBe("r2va");
  });

  it("invalid: i2va 和 r2va 混用", () => {
    const content: ContentItem[] = [
      { type: "text", text: "x" },
      { type: "image_url", image_url: { url: "data:," }, role: "first_frame" },
      { type: "image_url", image_url: { url: "data:," }, role: "reference_image" },
    ];
    expect(detectVideoScenario(content)).toBe("invalid");
  });

  it("t2va: text + 没 role 的 image（视为参考图，但不识别）", () => {
    const content: ContentItem[] = [
      { type: "text", text: "x" },
      { type: "image_url", image_url: { url: "data:," } },
    ];
    // 没 role 字段 → 不被识别为 first_frame / reference_image
    expect(detectVideoScenario(content)).toBe("t2va");
  });
});

describe("validateAndFixParams", () => {
  it("t2va: 合法（text + ratio=16:9）", () => {
    const result = validateAndFixParams(baseParams({ ratio: "16:9" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fixed.ratio).toBe("16:9");
    }
  });

  it("t2va: 缺 ratio → reject", () => {
    const result = validateAndFixParams(baseParams({ content: [{ type: "text", text: "x" }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/ratio/);
    }
  });

  it("t2va: ratio=adaptive → reject", () => {
    const result = validateAndFixParams(baseParams({ ratio: "adaptive" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/adaptive/);
    }
  });

  it("i2va: ratio=16:9 会被修正成 adaptive", () => {
    const result = validateAndFixParams(
      baseParams({
        ratio: "16:9",
        content: [
          { type: "text", text: "x" },
          { type: "image_url", image_url: { url: "data:," }, role: "first_frame" },
        ],
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fixed.ratio).toBe("adaptive");
    }
  });

  it("r2va: ratio 缺省 → 自动填 adaptive", () => {
    const result = validateAndFixParams(
      baseParams({
        content: [
          { type: "text", text: "x" },
          { type: "image_url", image_url: { url: "data:," }, role: "reference_image" },
        ],
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fixed.ratio).toBe("adaptive");
    }
  });

  it("r2va: 显式 ratio=9:16 → 保留", () => {
    const result = validateAndFixParams(
      baseParams({
        ratio: "9:16",
        content: [
          { type: "text", text: "x" },
          { type: "image_url", image_url: { url: "data:," }, role: "reference_image" },
        ],
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fixed.ratio).toBe("9:16");
    }
  });

  it("content 缺 text → reject", () => {
    const result = validateAndFixParams(baseParams({ content: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/prompt|text/);
    }
  });

  it("text 全空白 → reject", () => {
    const result = validateAndFixParams(
      baseParams({ content: [{ type: "text", text: "   " }] })
    );
    expect(result.ok).toBe(false);
  });

  it("duration < 4 → reject", () => {
    const result = validateAndFixParams(baseParams({ duration: 3 }));
    expect(result.ok).toBe(false);
  });

  it("duration > 15 → reject", () => {
    const result = validateAndFixParams(baseParams({ duration: 16 }));
    expect(result.ok).toBe(false);
  });

  it("resolution 非法 → reject", () => {
    const result = validateAndFixParams(
      baseParams({ resolution: "4K" as never, ratio: "16:9" })
    );
    expect(result.ok).toBe(false);
  });

  it("i2va + r2va 混用 → reject", () => {
    const result = validateAndFixParams(
      baseParams({
        content: [
          { type: "text", text: "x" },
          { type: "image_url", image_url: { url: "data:," }, role: "first_frame" },
          { type: "image_url", image_url: { url: "data:," }, role: "reference_image" },
        ],
      })
    );
    expect(result.ok).toBe(false);
  });

  it("model 错误 → reject", () => {
    const result = validateAndFixParams(
      baseParams({ model: "doubao-seedream-5-0-lite" as never, ratio: "16:9" })
    );
    expect(result.ok).toBe(false);
  });
});
