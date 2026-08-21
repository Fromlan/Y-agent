import { useEffect, useState } from "react";
import Sidebar, { type Route } from "@/components/layout/Sidebar";
import Workspace from "@/components/workspace/Workspace";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { ToastProvider, useToast } from "@/components/shared/Toast";
import { PromptProvider } from "@/components/shared/PromptProvider";
import { SessionProvider, useSession } from "@/lib/session";
import { log } from "@/lib/logger";
import { useTheme } from "@/lib/use-theme";

function AppShell() {
  // 挂载主题 hook：从 Rust KV 读取持久化值并同步到 <html>
  // （在 SettingsPanel 之外也需要调用一次以触发副作用）
  useTheme();
  const [route, setRoute] = useState<Route>("projects");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { currentProject, setCurrentProject } = useSession();
  const toast = useToast();

  /**
   * 全局未捕获错误兜底。
   * 业务里所有 await 都有 try/catch，但万一有遗漏的 Promise 拒绝 / 同步抛错，
   * 至少要让用户知道"出问题了"，而不是黑屏。
   */
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      log.error("app", "unhandled promise rejection:", e.reason);
      const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
      toast.error(`出错：${msg.slice(0, 80)}`);
    };
    const onError = (e: ErrorEvent) => {
      log.error("app", "uncaught error:", e.error ?? e.message);
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, [toast]);

  // 在「项目库」页选了项目后自动跳到 project 路由
  // - 只在 route === "projects" 时触发，避免把"资产中心 / Skill"等主动切换吞掉
  useEffect(() => {
    if (currentProject && route === "projects") {
      setRoute("project");
    }
  }, [currentProject, route]);

  const handleRoute = (r: Route) => {
    if (r === "projects") {
      setCurrentProject(null);
    }
    setRoute(r);
  };

  const handleBackFromProject = () => {
    setCurrentProject(null);
    setRoute("projects");
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base">
      <Sidebar
        route={route}
        onRoute={handleRoute}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Workspace
          route={route}
          onBackFromProject={handleBackFromProject}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </main>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <PromptProvider>
        <SessionProvider>
          <AppShell />
        </SessionProvider>
      </PromptProvider>
    </ToastProvider>
  );
}
