import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Bug 2 回归测试
// ============================================================================
// 之前 `startAssetEventListener` 用单 callback 变量，第二个调用是 no-op，
// 导致订阅者集合里只有第一个 callback 会被调用。修复后第二个 callback
// 也必须被调用，且 stop 不会影响其它订阅者。
// ============================================================================

// 记录被调用的 callback 列表
const invokeListeners: Array<(e: { payload: unknown }) => void> = [];
let nextUnlistenId = 0;
const unlistenRefs = new Map<number, () => void>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, cb: (e: { payload: unknown }) => void) => {
    const id = nextUnlistenId++;
    invokeListeners.push(cb);
    const unlisten = () => {
      const i = invokeListeners.indexOf(cb);
      if (i >= 0) invokeListeners.splice(i, 1);
    };
    unlistenRefs.set(id, unlisten);
    return unlisten;
  }),
}));

import {
  startAssetEventListener,
  stopAssetEventListener,
  __resetForTests,
} from "@/lib/asset-events";

beforeEach(() => {
  invokeListeners.length = 0;
  nextUnlistenId = 0;
  unlistenRefs.clear();
  __resetForTests();
});

afterEach(() => {
  __resetForTests();
});

/** 模拟一个后端事件抵达。 */
function fireEvent(payload: unknown) {
  for (const cb of [...invokeListeners]) {
    cb({ payload });
  }
}

describe("Bug 2 回归 — asset-events 多订阅者", () => {
  it("两个订阅者都被注册（之前只有第一个生效）", async () => {
    const a = vi.fn();
    const b = vi.fn();
    await startAssetEventListener(a);
    await startAssetEventListener(b);

    fireEvent({ assetId: "x", projectId: "p", localPaths: ["C:/a.png"] });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith({
      assetId: "x",
      projectId: "p",
      localPaths: ["C:/a.png"],
    });
    expect(b).toHaveBeenCalledWith({
      assetId: "x",
      projectId: "p",
      localPaths: ["C:/a.png"],
    });
  });

  it("同一 apply 多次 start 是 no-op（set 去重）", async () => {
    const a = vi.fn();
    await startAssetEventListener(a);
    await startAssetEventListener(a);
    await startAssetEventListener(a);

    fireEvent({ assetId: "x", projectId: "p" });

    expect(a).toHaveBeenCalledTimes(1);
  });

  it("一个订阅者 stop 后，其它订阅者继续收到事件", async () => {
    const a = vi.fn();
    const b = vi.fn();
    await startAssetEventListener(a);
    await startAssetEventListener(b);

    await stopAssetEventListener(a);

    fireEvent({ assetId: "x", projectId: "p" });

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("最后一个订阅者 stop 后才真正 unlisten", async () => {
    const a = vi.fn();
    const b = vi.fn();
    await startAssetEventListener(a);
    await startAssetEventListener(b);

    // 中间停掉 a，Tauri listener 还在
    await stopAssetEventListener(a);
    expect(invokeListeners.length).toBe(1);

    // 全部 stop 之后 Tauri listener 才释放
    await stopAssetEventListener(b);
    expect(invokeListeners.length).toBe(0);
  });

  it("某 apply 抛错不影响其它 apply 收到事件", async () => {
    const a = vi.fn();
    const b = vi.fn(() => {
      throw new Error("boom");
    });
    const c = vi.fn();
    await startAssetEventListener(a);
    await startAssetEventListener(b);
    await startAssetEventListener(c);

    // 不应抛错；console.error 被调用但事件循环继续
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fireEvent({ assetId: "x", projectId: "p" });
    errSpy.mockRestore();

    expect(a).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });
});
