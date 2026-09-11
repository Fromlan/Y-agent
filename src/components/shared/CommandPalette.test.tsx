/**
 * CommandPalette 组件测试
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { SessionProvider } from "@/lib/session";

vi.mock("@/lib/projects", () => ({
  listProjects: () => Promise.resolve([]),
}));
vi.mock("@/lib/character-archive", () => ({
  listCharacterArchives: () => Promise.resolve([]),
}));
vi.mock("@/lib/skill", () => ({
  loadBuiltinSkills: () => Promise.resolve([]),
}));

import CommandPalette from "@/components/shared/CommandPalette";

afterEach(() => cleanup());

function setup() {
  return render(
    <SessionProvider>
      <CommandPalette
        onRoute={vi.fn()}
        onOpenSettings={vi.fn()}
        onUseSkill={vi.fn()}
      />
    </SessionProvider>
  );
}

describe("CommandPalette", () => {
  it("默认不渲染面板", () => {
    setup();
    expect(screen.queryByPlaceholderText(/搜/)).not.toBeInTheDocument();
  });

  it("Ctrl+K 快捷键打开面板", () => {
    setup();
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    expect(screen.queryByPlaceholderText(/搜/)).toBeInTheDocument();
  });

  it("Cmd+K (Mac) 也应触发", () => {
    setup();
    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(screen.queryByPlaceholderText(/搜/)).toBeInTheDocument();
  });

  it("打开后按 Esc 关闭面板", () => {
    setup();
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    expect(screen.queryByPlaceholderText(/搜/)).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByPlaceholderText(/搜/)).not.toBeInTheDocument();
  });

  it("大写 K 也能触发(e.key.toLowerCase() 归一)", () => {
    setup();
    act(() => {
      fireEvent.keyDown(window, { key: "K", ctrlKey: true });
    });
    expect(screen.queryByPlaceholderText(/搜/)).toBeInTheDocument();
  });
});