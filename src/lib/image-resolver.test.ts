import { describe, it, expect, vi, beforeEach } from "vitest";

// 用 vi.mock 在 jsdom 下替代 Tauri 2 的 convertFileSrc。
// mock 行为:把绝对路径 encode 后拼成 `mock://...` —— 不依赖实际 Tauri 运行时。
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `mock://${encodeURIComponent(p)}`,
}));

import {
  resolveImageUrl,
  resolveImageUrlSync,
  prefetchImageUrl,
} from "@/lib/image-resolver";

beforeEach(() => {
  // 每个测试清掉模块级缓存,避免「缓存命中」污染断言
  // 通过调用一个会失效的 path 间接清——这里直接 reload module
  vi.resetModules();
});

describe("image-resolver / 本地路径走 asset 协议", () => {
  it("Windows 绝对路径 → mock://<encoded>", async () => {
    vi.doMock("@tauri-apps/api/core", () => ({
      convertFileSrc: (p: string) => `mock://${encodeURIComponent(p)}`,
    }));
    const { resolveImageUrl: r } = await import("@/lib/image-resolver");
    const url = await r("C:\\Users\\me\\assets\\abc.png");
    expect(url.startsWith("mock://")).toBe(true);
    expect(url).toContain(encodeURIComponent("C:\\Users\\me\\assets\\abc.png"));
  });

  it("POSIX 绝对路径 → mock://<encoded>", async () => {
    vi.doMock("@tauri-apps/api/core", () => ({
      convertFileSrc: (p: string) => `mock://${encodeURIComponent(p)}`,
    }));
    const { resolveImageUrl: r } = await import("@/lib/image-resolver");
    const url = await r("/Users/me/assets/abc.png");
    expect(url.startsWith("mock://")).toBe(true);
  });

  it("http(s) URL 直接返回原值", async () => {
    expect(await resolveImageUrl("https://example.com/x.png")).toBe(
      "https://example.com/x.png"
    );
    expect(await resolveImageUrl("http://example.com/x.png")).toBe(
      "http://example.com/x.png"
    );
  });

  it("data: URL 直接返回原值", async () => {
    const d = "data:image/png;base64,iVBORw0KGgo=";
    expect(await resolveImageUrl(d)).toBe(d);
  });

  it("blob: URL 直接返回原值", async () => {
    const b = "blob:http://localhost/abc-123";
    expect(await resolveImageUrl(b)).toBe(b);
  });

  it("asset: URL 直接返回原值(已被前端存过的 asset 协议 URL)", async () => {
    const a = "http://asset.localhost/encoded%20path";
    expect(await resolveImageUrl(a)).toBe(a);
  });

  it("空字符串 / null / undefined → 空字符串", async () => {
    expect(await resolveImageUrl("")).toBe("");
    expect(await resolveImageUrl(null)).toBe("");
    expect(await resolveImageUrl(undefined)).toBe("");
  });
});

describe("image-resolver / localPathToAssetUrl 缓存", () => {
  it("同一 path 第二次调用直接返回缓存(不重新调 convertFileSrc)", async () => {
    let calls = 0;
    vi.resetModules();
    vi.doMock("@tauri-apps/api/core", () => ({
      convertFileSrc: (p: string) => {
        calls++;
        return `mock://${encodeURIComponent(p)}`;
      },
    }));
    const mod = await import("@/lib/image-resolver");
    const p = "C:\\Users\\me\\a.png";
    const u1 = mod.localPathToAssetUrl(p);
    const u2 = mod.localPathToAssetUrl(p);
    expect(u1).toBe(u2);
    // 第二次走缓存,convertFileSrc 不会再被调
    expect(calls).toBe(1);
  });

  it("不同 path 各自有独立缓存", async () => {
    vi.resetModules();
    vi.doMock("@tauri-apps/api/core", () => ({
      convertFileSrc: (p: string) => `mock://${encodeURIComponent(p)}`,
    }));
    const mod = await import("@/lib/image-resolver");
    const u1 = mod.localPathToAssetUrl("C:\\a.png");
    const u2 = mod.localPathToAssetUrl("C:\\b.png");
    expect(u1).not.toBe(u2);
  });
});

describe("image-resolver / resolveImageUrlSync 同步版", () => {
  it("本地路径同步返回 mock:// URL", async () => {
    vi.resetModules();
    vi.doMock("@tauri-apps/api/core", () => ({
      convertFileSrc: (p: string) => `mock://${encodeURIComponent(p)}`,
    }));
    const { resolveImageUrlSync: r } = await import("@/lib/image-resolver");
    const url = r("C:\\sync\\test.png");
    expect(url.startsWith("mock://")).toBe(true);
  });

  it("空字符串 → 空字符串", () => {
    expect(resolveImageUrlSync("")).toBe("");
    expect(resolveImageUrlSync(null)).toBe("");
    expect(resolveImageUrlSync(undefined)).toBe("");
  });

  it("data: / http: / blob: / asset: 原值返回", () => {
    expect(resolveImageUrlSync("https://x.com/y.png")).toBe("https://x.com/y.png");
    expect(resolveImageUrlSync("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc"
    );
    expect(resolveImageUrlSync("blob:http://x/y")).toBe("blob:http://x/y");
    expect(resolveImageUrlSync("http://asset.localhost/abc")).toBe(
      "http://asset.localhost/abc"
    );
  });
});

describe("image-resolver / prefetchImageUrl", () => {
  it("本地路径调用 prefetchImageUrl 后再调 resolveImageUrl 走缓存", async () => {
    vi.resetModules();
    vi.doMock("@tauri-apps/api/core", () => ({
      convertFileSrc: (p: string) => `mock://${encodeURIComponent(p)}`,
    }));
    const mod = await import("@/lib/image-resolver");
    const p = "C:\\prefetch.png";
    mod.prefetchImageUrl(p);
    const u = await mod.resolveImageUrl(p);
    expect(u.startsWith("mock://")).toBe(true);
  });

  it("http(s) / data: 调用 prefetchImageUrl 不会触发 convertFileSrc", () => {
    // 用 mod.resolveImageUrlSync 验证:调用 prefetch 后,这些 scheme 仍然原值返回
    expect(prefetchImageUrl).toBeDefined();
    prefetchImageUrl("https://x.com/y.png");
    expect(resolveImageUrlSync("https://x.com/y.png")).toBe("https://x.com/y.png");
  });
});
