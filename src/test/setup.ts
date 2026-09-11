/**
 * Vitest 全局 setup
 *
 * 加载 @testing-library/jest-dom 扩展(toBeInTheDocument 等匹配器),
 * 让所有 *.test.tsx 自动可用。
 */
import "@testing-library/jest-dom/vitest";