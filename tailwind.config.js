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
      // ===== Motion 系统（F1 引入）=====
      // 走 token（--dur-* / --ease-out），不写死毫秒
      // 详见 src/index.css 里 .anim-* 工具类
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-down": {
          from: { opacity: "0", transform: "translateY(-6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-right": {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "caret-pop": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.18)" },
          "100%": { transform: "scale(1)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "marquee": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "bounce-in": {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "70%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in var(--dur-base, 180ms) var(--ease-out, ease-out) both",
        "fade-up": "fade-up var(--dur-base, 180ms) var(--ease-out, ease-out) both",
        "fade-down": "fade-down var(--dur-base, 180ms) var(--ease-out, ease-out) both",
        "slide-right": "slide-right var(--dur-base, 180ms) var(--ease-out, ease-out) both",
        "caret-pop": "caret-pop var(--dur-fast, 120ms) var(--ease-out, ease-out)",
        "pulse-soft": "pulse-soft 1.6s var(--ease-out, ease-out) infinite",
        "marquee": "marquee 24s linear infinite",
        "bounce-in": "bounce-in var(--dur-base, 180ms) var(--ease-out, ease-out) both",
      },
      transitionTimingFunction: {
        out: "var(--ease-out, cubic-bezier(0.2, 0.8, 0.2, 1))",
      },
    },
  },
  plugins: [],
};
