import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyInitialTheme } from "@/lib/use-theme";
import "./index.css";

// 兜底：万一 index.html 的 inline script 失败，这里再同步一次
applyInitialTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
