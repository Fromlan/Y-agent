/**
 * Sidebar 组件测试
 *
 * 覆盖:
 * - 渲染 3 个导航项 + 设置按钮
 * - 点击 nav item 触发 onRoute
 * - 点击设置按钮触发 onOpenSettings
 * - 当前路由的 nav item 有视觉激活样式
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SessionProvider } from "@/lib/session";

// mock hasApiKey 避免 invoke Tauri
vi.mock("@/lib/api-key", () => ({
  hasApiKey: () => Promise.resolve(true),
}));

// mock listProjects 避免 invoke Tauri
vi.mock("@/lib/projects", () => ({
  listProjects: () => Promise.resolve([]),
}));

import Sidebar from "@/components/layout/Sidebar";


afterEach(() => cleanup());

describe("Sidebar", () => {
  it("渲染 3 个导航项 + 设置按钮", () => {
    render(
      <SessionProvider>
        <Sidebar route="projects" onRoute={() => {}} onOpenSettings={() => {}} />
      </SessionProvider>
    );
    expect(screen.getAllByText("项目库")[0]).toBeInTheDocument();
    expect(screen.getAllByText("资产中心")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Skill")[0]).toBeInTheDocument();
    expect(screen.getAllByText("设置")[0]).toBeInTheDocument();
  });

  it("点击 '资产中心' 触发 onRoute('assets')", () => {
    const onRoute = vi.fn();
    render(
      <SessionProvider>
        <Sidebar route="projects" onRoute={onRoute} onOpenSettings={() => {}} />
      </SessionProvider>
    );
    const btn = screen.getAllByText("资产中心")[0].closest("button")!;
    fireEvent.click(btn);
    expect(onRoute).toHaveBeenCalledWith("assets");
  });

  it("点击 'Skill' 触发 onRoute('skills')", () => {
    const onRoute = vi.fn();
    render(
      <SessionProvider>
        <Sidebar route="projects" onRoute={onRoute} onOpenSettings={() => {}} />
      </SessionProvider>
    );
    const btn = screen.getAllByText("Skill")[0].closest("button")!;
    fireEvent.click(btn);
    expect(onRoute).toHaveBeenCalledWith("skills");
  });

  it("点击 '项目库' 触发 onRoute('projects')", () => {
    const onRoute = vi.fn();
    render(
      <SessionProvider>
        <Sidebar route="assets" onRoute={onRoute} onOpenSettings={() => {}} />
      </SessionProvider>
    );
    const btn = screen.getAllByText("项目库")[0].closest("button")!;
    fireEvent.click(btn);
    expect(onRoute).toHaveBeenCalledWith("projects");
  });

  it("点击设置按钮触发 onOpenSettings", () => {
    const onOpenSettings = vi.fn();
    render(
      <SessionProvider>
        <Sidebar route="projects" onRoute={() => {}} onOpenSettings={onOpenSettings} />
      </SessionProvider>
    );
    const btn = screen.getAllByText("设置")[0].closest("button")!;
    fireEvent.click(btn);
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("当前路由的 nav item 有视觉激活样式", () => {
    render(
      <SessionProvider>
        <Sidebar route="assets" onRoute={() => {}} onOpenSettings={() => {}} />
      </SessionProvider>
    );
    const activeBtn = screen.getAllByText("资产中心")[0].closest("button")!;
    const inactiveBtn = screen.getAllByText("项目库")[0].closest("button")!;
    expect(activeBtn.className).not.toBe(inactiveBtn.className);
  });
});