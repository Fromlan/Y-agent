/* ESLint v8 配置
 * - 主要兜 react-hooks 规则（项目里之前靠 `tsc -b` 抓不到 useEffect 依赖问题）
 * - TS 规则保持轻量，避免跟 IDE / tsc 冲突
 * - 暂时 warn 级而不是 error，给项目一个迁移窗口
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: "18" } },
  plugins: ["@typescript-eslint", "react-hooks", "react-refresh"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  rules: {
    // React Hooks 规则（核心）
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    // React Refresh 兼容性（Vite HMR 需要的命名导出）
    // 关闭：项目里有不少"hook 工具 + 组件"混在一个文件的模式（如 Toast.tsx / session.tsx / PromptProvider.tsx），
    // 拆文件得不偿失。HMR 偶尔不刷新组件在 dev 期可接受。
    "react-refresh/only-export-components": "off",
    // TS 推荐规则里有些项目里太吵，关掉
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "off", // 项目里 any 较多
    "@typescript-eslint/no-empty-function": "off",
    // 一些基础推荐规则关掉（项目风格偏好）
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-useless-escape": "off",
  },
  ignorePatterns: [
    "dist",
    "node_modules",
    "src-tauri/target",
    "src-tauri/gen",
    "*.config.js",
    "*.config.ts",
    "vite.config.*",
  ],
};
