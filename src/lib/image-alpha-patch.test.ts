import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ensureHasTransparentPixel } from "@/lib/image-alpha-patch";

/**
 * 1×1 透明 PNG：4 字节宽高 + 灰度 + alpha 全 0
 * 实际是从 canvas toDataURL("image/png") 出来的最小有效透明 PNG。
 * 头 8 字节是 PNG signature：89 50 4E 47 0D 0A 1A 0A
 */
const TRANSPARENT_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==";

/**
 * 1×1 不透明白色 PNG（真字节）。
 */
const OPAQUE_WHITE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZyK0W0AAAAASUVORK5CYII=";

/**
 * 1×1 JPEG（真字节）。`ensureHasTransparentPixel` 应该快速回退——非 PNG data URL 不处理。
 */
const JPEG_DATA_URL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A//2Q==";

describe("ensureHasTransparentPixel", () => {
  beforeEach(() => {
    // 重置模块级缓存（不同测试间互不污染）
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("非 PNG data URL（image/jpeg）→ 快速回退原 URL，不触发 decode", async () => {
    const result = await ensureHasTransparentPixel(JPEG_DATA_URL);
    expect(result).toBe(JPEG_DATA_URL);
  });

  it("非 data URL（远端 https）→ 快速回退原 URL", async () => {
    const remoteUrl = "https://example.com/foo.png";
    const result = await ensureHasTransparentPixel(remoteUrl);
    expect(result).toBe(remoteUrl);
  });

  it("非图 data URL（data:text/plain）→ 快速回退原 URL", async () => {
    const textUrl = "data:text/plain,hello";
    const result = await ensureHasTransparentPixel(textUrl);
    expect(result).toBe(textUrl);
  });

  it("空字符串 → 回退原值（空串）", async () => {
    const result = await ensureHasTransparentPixel("");
    expect(result).toBe("");
  });

  it("不透明 PNG data URL → 走完整处理（左上角 alpha 改 0）", async () => {
    // mock Image / OffscreenCanvas / Blob 链路
    const mockBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
    const mockDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1;
      naturalHeight = 1;
      set src(_v: string) {
        // 异步触发 onload
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { Image: unknown }).Image = MockImage;

    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext(_type: string) {
        return {
          drawImage: () => undefined,
          getImageData: (_x: number, _y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255].slice(0, w * h * 4)),
          }),
          putImageData: () => undefined,
        };
      }
      convertToBlob(_opts: { type: string }): Promise<Blob> {
        return Promise.resolve(mockBlob);
      }
    }
    (globalThis as { OffscreenCanvas: unknown }).OffscreenCanvas = MockOffscreenCanvas;

    class MockFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result: string | ArrayBuffer | null = null;
      readAsDataURL(_b: Blob) {
        queueMicrotask(() => {
          this.result = mockDataUrl;
          this.onload?.();
        });
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = MockFileReader;

    // 用 vi.resetModules 重新 import，确保缓存空
    vi.resetModules();
    const mod = await import("@/lib/image-alpha-patch");
    const result = await mod.ensureHasTransparentPixel(OPAQUE_WHITE_PNG_DATA_URL);

    expect(result).toBe(mockDataUrl);
    expect(result).not.toBe(OPAQUE_WHITE_PNG_DATA_URL);
    expect(result.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("解码失败 → 静默回退原 URL（不抛）", async () => {
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    (globalThis as { Image: unknown }).Image = FailingImage;

    vi.resetModules();
    const mod = await import("@/lib/image-alpha-patch");
    const result = await mod.ensureHasTransparentPixel(OPAQUE_WHITE_PNG_DATA_URL);
    expect(result).toBe(OPAQUE_WHITE_PNG_DATA_URL);
  });

  it("同 sourceUrl 第二次调用 → 命中缓存（只 decode 一次）", async () => {
    let decodeCount = 0;
    const mockDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    class CountingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1;
      naturalHeight = 1;
      set src(_v: string) {
        decodeCount++;
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { Image: unknown }).Image = CountingImage;

    class MockOC {
      width = 1;
      height = 1;
      getContext() {
        return {
          drawImage: () => undefined,
          getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
          putImageData: () => undefined,
        };
      }
      convertToBlob() {
        return Promise.resolve(new Blob([new Uint8Array([1])]));
      }
    }
    (globalThis as { OffscreenCanvas: unknown }).OffscreenCanvas = MockOC;

    class MockFR {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        queueMicrotask(() => {
          this.result = mockDataUrl;
          this.onload?.();
        });
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = MockFR;

    vi.resetModules();
    const mod = await import("@/lib/image-alpha-patch");
    const a = await mod.ensureHasTransparentPixel(OPAQUE_WHITE_PNG_DATA_URL);
    const b = await mod.ensureHasTransparentPixel(OPAQUE_WHITE_PNG_DATA_URL);
    expect(a).toBe(b);
    expect(decodeCount).toBe(1);
  });

  it("已经是透明 PNG → 仍走完整处理（左上角 alpha 本就是 0，输出仍是合法 PNG）", async () => {
    const mockDataUrl = "data:image/png;base64,TRANSPARENT_PROCESSED";

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1;
      naturalHeight = 1;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { Image: unknown }).Image = MockImage;
    (globalThis as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
      width = 1;
      height = 1;
      getContext() {
        return {
          drawImage: () => undefined,
          getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) }),
          putImageData: () => undefined,
        };
      }
      convertToBlob() {
        return Promise.resolve(new Blob([new Uint8Array([1])]));
      }
    };
    (globalThis as { FileReader: unknown }).FileReader = class {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        queueMicrotask(() => {
          this.result = mockDataUrl;
          this.onload?.();
        });
      }
    };

    vi.resetModules();
    const mod = await import("@/lib/image-alpha-patch");
    const result = await mod.ensureHasTransparentPixel(TRANSPARENT_PNG_DATA_URL);
    expect(result).toBe(mockDataUrl);
  });
});
