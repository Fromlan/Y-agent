/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0a0a0c",
          panel: "#131318",
          elev: "#1a1a20",
          hover: "#22222a",
        },
        border: {
          DEFAULT: "#2a2a32",
          strong: "#3a3a44",
        },
        text: {
          primary: "#e8e8ec",
          secondary: "#a0a0a8",
          muted: "#6a6a72",
        },
        accent: {
          DEFAULT: "#7c5cff",
          hover: "#9077ff",
          dim: "#3a2a8a",
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
