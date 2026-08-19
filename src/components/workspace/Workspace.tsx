import ProjectsPage from "@/components/workspace/ProjectsPage";
import ProjectDetail from "@/components/workspace/ProjectDetail";
import PlaceholderPage from "@/components/workspace/PlaceholderPage";

export type Route = "projects" | "project" | "assets" | "skills";

interface Props {
  route: Route;
  onBackFromProject: () => void;
  onOpenSettings: () => void;
}

export default function Workspace({ route, onBackFromProject, onOpenSettings }: Props) {
  switch (route) {
    case "projects":
      return <ProjectsPage />;
    case "project":
      return <ProjectDetail onBack={onBackFromProject} onOpenSettings={onOpenSettings} />;
    case "assets":
      return <PlaceholderPage title="资产中心" hint="跨项目复用的风格、参考图、提示词库（M5 阶段实现）" />;
    case "skills":
      return <PlaceholderPage title="Skill 中心" hint="可复用的提示词模板和工作流（M5 阶段实现）" />;
  }
}
