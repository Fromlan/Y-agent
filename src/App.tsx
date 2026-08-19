import { useEffect, useState } from "react";
import Sidebar, { type Route } from "@/components/layout/Sidebar";
import Workspace from "@/components/workspace/Workspace";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { ToastProvider, useToast } from "@/components/shared/Toast";
import { SessionProvider, useSession } from "@/lib/session";
import { hasApiKey } from "@/lib/api-key";

function AppShell() {
  const [route, setRoute] = useState<Route>("projects");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const { currentProject, setCurrentProject } = useSession();
  const toast = useToast();

  useEffect(() => {
    hasApiKey()
      .then((ok) => setNeedsApiKey(!ok))
      .catch((e) => {
        console.error(e);
        toast.error("检查 API Key 失败");
      });
  }, []);

  // 选项目后自动跳到 project 路由
  useEffect(() => {
    if (currentProject && route !== "project") {
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
        {needsApiKey ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="panel max-w-md w-full p-6 text-center">
              <h2 className="text-lg font-semibold mb-2">需要配置即梦 API Key</h2>
              <p className="text-text-secondary text-sm mb-4">
                首次启动需要设置即梦（豆包 Seedream）API Key。Key 仅保存在本地，不会上传。
              </p>
              <button
                className="btn btn-primary w-full"
                onClick={() => setSettingsOpen(true)}
              >
                打开设置
              </button>
            </div>
          </div>
        ) : (
          <Workspace
            route={route}
            onBackFromProject={handleBackFromProject}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </main>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          hasApiKey().then((ok) => setNeedsApiKey(!ok));
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <AppShell />
      </SessionProvider>
    </ToastProvider>
  );
}
