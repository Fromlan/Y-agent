import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { applyInitialTheme } from "@/lib/use-theme";
import "./index.css";

// 兜底：万一 index.html 的 inline script 失败，这里再同步一次
applyInitialTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* ErrorBoundary 包裹 App,任何组件 throw 都会在 UI 上显示红字堆栈,
        避免白屏 + 没开 devtools 时也能看到错误 */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// 兜底:未捕获的 async 错误也打到 console(不开 devtools 也能在
// y-agent.exe 的 stderr 看到)— 比如 IPC invoke 抛出的非 React 错误。
window.addEventListener("unhandledrejection", (e) => {
  // eslint-disable-next-line no-console
  console.error("[unhandledrejection]", e.reason);
});
window.addEventListener("error", (e) => {
  // eslint-disable-next-line no-console
  console.error("[window.error]", e.error ?? e.message);
});
