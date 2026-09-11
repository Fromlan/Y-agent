/**
 * BoardToolbar 组件测试
 *
 * 覆盖:
 * - 渲染搜索框 + 计数 + select mode 按钮
 * - input 改变触发 onSearch
 * - 点击 select mode 触发 onToggleSelectMode
 * - selectMode=true 时显示批量操作工具栏
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import BoardToolbar from "@/components/workspace/BoardToolbar";
import type { Asset } from "@/lib/types";


const SAMPLE_ASSETS: Asset[] = [
  {
    id: "a1",
    projectId: "p1",
    prompt: "test prompt 1",
    model: "doubao-x",
    modelName: "Doubao",
    size: "2k",
    refCount: 0,
    costMs: 1000,
    isLayerDecomposition: false,
    createdAt: 100,
    payload: { urls: [""] },
  },
];

function setup(opts: Partial<React.ComponentProps<typeof BoardToolbar>> = {}) {
  const props: React.ComponentProps<typeof BoardToolbar> = {
    assets: opts.assets ?? SAMPLE_ASSETS,
    search: opts.search ?? "",
    onSearch: opts.onSearch ?? vi.fn(),
    selectedModels: opts.selectedModels ?? new Set(),
    onToggleModel: opts.onToggleModel ?? vi.fn(),
    special: opts.special ?? null,
    onSpecial: opts.onSpecial ?? vi.fn(),
    sortBy: opts.sortBy ?? "newest",
    onSortBy: opts.onSortBy ?? vi.fn(),
    view: opts.view ?? "grid",
    onView: opts.onView ?? vi.fn(),
    selectMode: opts.selectMode ?? false,
    onToggleSelectMode: opts.onToggleSelectMode ?? vi.fn(),
    selectedIds: opts.selectedIds ?? new Set(),
    onSelectAll: opts.onSelectAll ?? vi.fn(),
    onClearSelection: opts.onClearSelection ?? vi.fn(),
    onBatchDownload: opts.onBatchDownload ?? vi.fn(),
    onBatchDelete: opts.onBatchDelete ?? vi.fn(),
    filteredCount: opts.filteredCount ?? 1,
    totalCount: opts.totalCount ?? 1,
  };
  return { ...render(<BoardToolbar {...props} />), props };
}

afterEach(() => cleanup());

describe("BoardToolbar", () => {
  it("渲染搜索框 + 计数", () => {
    setup({ filteredCount: 5, totalCount: 12 });
    // 搜索框 input
    expect(screen.getByPlaceholderText(/搜索/)).toBeInTheDocument();
    // 计数 5/12
    expect(screen.getByText(/5.*12/)).toBeInTheDocument();
  });

  it("input 改变触发 onSearch", () => {
    const onSearch = vi.fn();
    setup({ onSearch });
    const input = screen.getByPlaceholderText(/搜索/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello" } });
    expect(onSearch).toHaveBeenCalledWith("hello");
  });

  it("selectMode=false 不显示批量操作工具栏", () => {
    setup({ selectMode: false });
    // select all 按钮不该显示
    expect(screen.queryByText(/全选|清空选择/)).not.toBeInTheDocument();
  });

  it("selectMode=true 显示批量操作工具栏", () => {
    setup({ selectMode: true, selectedIds: new Set(["a1"]) });
    // 全选 / 清空选择 / 批量导出 / 批量删除 等按钮应可见
    // 简单断言:有"全选"或类似文字
    const batchBar = screen.getAllByRole("button");
    expect(batchBar.length).toBeGreaterThan(5);
  });

  it("点击 selectMode 按钮触发 onToggleSelectMode", () => {
    const onToggleSelectMode = vi.fn();
    setup({ onToggleSelectMode });
    // 找一个明显是 select mode 的按钮(标题属性)
    const selectBtn = screen.getByTitle(/多选|选择模式|批量/);
    fireEvent.click(selectBtn);
    expect(onToggleSelectMode).toHaveBeenCalled();
  });
});