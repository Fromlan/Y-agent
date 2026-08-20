/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  // 主题切换走 [data-theme="xxx"] 属性（html 根），不是 .dark 类
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // 全部走 CSS 变量，变量在 index.css 里按 [data-theme] 切换
        bg: {
          base: "var(--bg-base)",
          panel: "var(--bg-panel)",
          elev: "var(--bg-elev)",
          hover: "var(--bg-hover)",
          // 半透明遮罩（设置弹窗背景等）
          overlay: "var(--bg-overlay)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          // 反色（用于亮色主题下显示在暗色按钮上等）
          inverse: "var(--text-inverse)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          dim: "var(--accent-dim)",
          // 状态色（成功/警告/危险），也走主题
          success: "var(--status-success)",
          warn: "var(--status-warn)",
          danger: "var(--status-danger)",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
