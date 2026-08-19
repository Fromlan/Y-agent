import { invoke } from "@tauri-apps/api/core";
import type { Project } from "@/lib/types";

export async function listProjects(): Promise<Project[]> {
  return await invoke<Project[]>("list_projects");
}

export async function createProject(name: string): Promise<Project> {
  return await invoke<Project>("create_project", { name });
}

export async function deleteProject(id: string): Promise<void> {
  await invoke("delete_project", { id });
}

export async function renameProject(id: string, name: string): Promise<Project> {
  return await invoke<Project>("rename_project", { id, name });
}
