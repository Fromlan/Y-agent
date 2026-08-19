import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { Project } from "@/lib/types";

interface SessionState {
  currentProject: Project | null;
  setCurrentProject: (p: Project | null) => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProjectRaw] = useState<Project | null>(null);
  const setCurrentProject = useCallback((p: Project | null) => {
    setCurrentProjectRaw(p);
  }, []);
  return (
    <SessionContext.Provider value={{ currentProject, setCurrentProject }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
