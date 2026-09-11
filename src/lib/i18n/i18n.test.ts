/**
 * i18n 基础包单元测试
 *
 * 覆盖:
 * - translate(locale, key) 双语资源加载 + fallback
 * - getLocale / setLocale / restoreLocale 单例状态
 * - useT() hook 在 locale 切换时实时更新
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  translate,
  loadResource,
  getLocale,
  setLocale,
  restoreLocale,
  useT,
  RESOURCES,
} from "@/lib/i18n";

describe("loadResource", () => {
  it("zh-CN 返回中文资源", () => {
    const r = loadResource("zh-CN");
    expect(r["app.title"]).toBe("Y-agent");
    expect(r["sidebar.projects"]).toBe("项目");
  });

  it("en-US 返回英文资源", () => {
    const r = loadResource("en-US");
    expect(r["app.title"]).toBe("Y-agent");
    expect(r["sidebar.projects"]).toBe("Projects");
  });
});

describe("translate", () => {
  it("zh-CN 返回中文", () => {
    expect(translate("zh-CN", "common.cancel")).toBe("取消");
  });

  it("en-US 返回英文", () => {
    expect(translate("en-US", "common.cancel")).toBe("Cancel");
  });

  it("未知 key 返回 key 本身(便于发现漏翻译)", () => {
    expect(translate("zh-CN", "unknown.key" as unknown as never)).toBe("unknown.key");
  });

  it("en-US 缺某 key 时 fallback 到 zh-CN", () => {
    const orig = RESOURCES["en-US"]["common.cancel"];
    delete (RESOURCES["en-US"] as Record<string, unknown>)["common.cancel"];
    expect(translate("en-US", "common.cancel")).toBe("取消");
    (RESOURCES["en-US"] as Record<string, unknown>)["common.cancel"] = orig;
  });
});

// placeholder 类型,只为 unknown.key 测试用例绕过严格类型


describe("getLocale / setLocale / restoreLocale", () => {
  beforeEach(() => {
    setLocale("zh-CN");
    localStorage.removeItem("y-agent.locale");
  });

  it("getLocale 默认 zh-CN", () => {
    expect(getLocale()).toBe("zh-CN");
  });

  it("setLocale 切换并通知 listeners", () => {
    const { result } = renderHook(() => useT());
    act(() => {
      setLocale("en-US");
    });
    expect(result.current.locale).toBe("en-US");
    expect(localStorage.getItem("y-agent.locale")).toBe("en-US");
  });

  it("setLocale 相同 locale 不触发额外副作用", () => {
    const { result } = renderHook(() => useT());
    const t1 = result.current.t;
    act(() => {
      setLocale("zh-CN");
    });
    expect(result.current.t).toBe(t1);
  });

  it("restoreLocale 从 localStorage 恢复", () => {
    localStorage.setItem("y-agent.locale", "en-US");
    const restored = restoreLocale();
    expect(restored).toBe("en-US");
    expect(getLocale()).toBe("en-US");
  });

  it("restoreLocale 无效值不变更 locale", () => {
    localStorage.setItem("y-agent.locale", "klingon");
    const restored = restoreLocale();
    expect(restored).toBe("zh-CN");
  });
});

describe("useT hook", () => {
  beforeEach(() => {
    setLocale("zh-CN");
    localStorage.removeItem("y-agent.locale");
  });

  it("返回当前 locale + t 函数", () => {
    const { result } = renderHook(() => useT());
    expect(result.current.locale).toBe("zh-CN");
    expect(result.current.t("common.cancel")).toBe("取消");
  });

  it("setLocale 后 t 返回新 locale 文本", () => {
    const { result } = renderHook(() => useT());
    expect(result.current.t("common.cancel")).toBe("取消");
    act(() => {
      setLocale("en-US");
    });
    expect(result.current.locale).toBe("en-US");
    expect(result.current.t("common.cancel")).toBe("Cancel");
  });

  it("多个 hook 实例共享 locale 状态", () => {
    const a = renderHook(() => useT());
    const b = renderHook(() => useT());
    act(() => {
      setLocale("en-US");
    });
    expect(a.result.current.locale).toBe("en-US");
    expect(b.result.current.locale).toBe("en-US");
  });

  it("组件卸载后 listener 清理,不影响其他实例", () => {
    const a = renderHook(() => useT());
    const b = renderHook(() => useT());
    a.unmount();
    act(() => {
      setLocale("en-US");
    });
    expect(b.result.current.locale).toBe("en-US");
  });
});