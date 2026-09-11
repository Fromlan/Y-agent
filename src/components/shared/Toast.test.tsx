/**
 * Toast 组件示范测试
 *
 * 目标: 验证前端组件单测框架( @testing-library/react + @testing-library/jest-dom )
 * 走通, 后续 P0 计划(2 Anchor 组件 4 个测试) 走相同模式。
 *
 * 测试要点:
 * - 4 种 level(success / error / warn / info) 都触发对应图标
 * - error 默认 persistent(不自动消失)
 * - success / info 默认 3.5s 后自动消失
 * - dismiss(id) 立刻移除某条 toast
 * - action 按钮点击触发回调
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/shared/Toast";

/**
 * 用 hook 触发 toast 的最小组件
 */
function TriggerButton() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success("操作成功")}>ok</button>
      <button onClick={() => toast.error("出错了")}>err</button>
      <button onClick={() => toast.warn("警告")}>warn</button>
      <button onClick={() => toast.info("提示")}>info</button>
      <button
        onClick={() =>
          toast.error("带重试", {
            action: { label: "重试", onClick: () => window.dispatchEvent(new Event("retry")) },
          })
        }
      >
        err-action
      </button>
    </>
  );
}

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function setup() {
    return render(
      <ToastProvider>
        <TriggerButton />
      </ToastProvider>
    );
  }

  it("success 触发后立刻显示", () => {
    setup();
    fireEvent.click(screen.getByText("ok"));
    expect(screen.getByText("操作成功")).toBeInTheDocument();
  });

  it("error 默认 persistent(3.5s 还在)", () => {
    setup();
    fireEvent.click(screen.getByText("err"));
    expect(screen.getByText("出错了")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("出错了")).toBeInTheDocument();
  });

  it("info 默认 3.5s 后消失", () => {
    setup();
    fireEvent.click(screen.getByText("info"));
    expect(screen.getByText("提示")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText("提示")).not.toBeInTheDocument();
  });

  it("warn 触发后立刻显示", () => {
    setup();
    fireEvent.click(screen.getByText("warn"));
    expect(screen.getByText("警告")).toBeInTheDocument();
  });

  it("action 按钮触发回调", () => {
    const onRetry = vi.fn();
    window.addEventListener("retry", onRetry);
    setup();
    fireEvent.click(screen.getByText("err-action"));
    const retryBtn = screen.getByText("重试");
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalled();
    window.removeEventListener("retry", onRetry);
  });

  it("useToast 在 ToastProvider 外抛错", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TriggerButton />)).toThrow(
      /useToast must be used within ToastProvider/
    );
    consoleSpy.mockRestore();
  });
});