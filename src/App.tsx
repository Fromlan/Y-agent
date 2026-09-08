import { useEffect, useState } from "react";
import Sidebar, { type Route } from "@/components/layout/Sidebar";
import Workspace from "@/components/workspace/Workspace";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { ToastProvider, useToast } from "@/components/shared/Toast";
import { PromptProvider } from "@/components/shared/PromptProvider";
import CommandPalette from "@/components/shared/CommandPalette";
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

  // M-6: Skill 中心 → 在项目里用
  const handleJumpToProject = () => {
    if (currentProject) {
      setRoute("project");
    }
  };

  // A-3: 全局快捷键(Ctrl/Cmd + ...)
  // 注意:CommandPalette 内部已注册 ⌘K,这里补 N / , / 1-4
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      // 输入框里不抢快捷键
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) {
        return;
      }
      if (key === "n") {
        e.preventDefault();
        handleRoute("projects");
        setCurrentProject(null);
      } else if (key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (key === "1") {
        e.preventDefault();
        handleRoute("projects");
      } else if (key === "2") {
        e.preventDefault();
        handleRoute("project");
      } else if (key === "3") {
        e.preventDefault();
        handleRoute("assets");
      } else if (key === "4") {
        e.preventDefault();
        handleRoute("skills");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleRoute, setCurrentProject]);

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
          onJumpToProject={handleJumpToProject}
        />
      </main>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      {/* M-2: 全局 ⌘K 命令面板 */}
      <CommandPalette
        onRoute={handleRoute}
        onOpenSettings={() => setSettingsOpen(true)}
        onUseSkill={(skillId) => {
          if (!currentProject) return;
          // 复用 M-6 逻辑:写 pendingSkill + 切路由
          try {
            localStorage.setItem(
              "y-agent.pendingSkill",
              JSON.stringify({ id: skillId, ts: Date.now() })
            );
          } catch {
            // ignore
          }
          handleJumpToProject();
        }}
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
