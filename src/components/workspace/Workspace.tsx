import ProjectsPage from "@/components/workspace/ProjectsPage";
import ProjectDetail from "@/components/workspace/ProjectDetail";
import AssetCenterPage from "@/components/workspace/AssetCenterPage";
import SkillCenterPage from "@/components/workspace/SkillCenterPage";

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
      return <AssetCenterPage />;
    case "skills":
      return <SkillCenterPage />;
  }
}
