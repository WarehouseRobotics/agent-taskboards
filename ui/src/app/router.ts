export const defaultSettingsSection = "general";

export type AppRoute =
  | { view: "board"; projectId: string | null; boardId: string | null; taskId: string | null }
  | { view: "projects"; projectId: string | null }
  | { view: "search" }
  | { view: "maintenance" }
  | { view: "settings"; section: string };

export function parseRoute(pathname = window.location.pathname): AppRoute {
  const parts = pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));

  if (parts[0] === "projects") {
    if (parts[1] && parts[2] === "boards" && parts[3]) {
      return {
        view: "board",
        projectId: parts[1],
        boardId: parts[3],
        taskId: parts[4] === "tasks" ? (parts[5] ?? null) : null,
      };
    }
    return { view: "projects", projectId: parts[1] ?? null };
  }

  if (parts[0] === "settings") {
    return { view: "settings", section: parts[1] ?? defaultSettingsSection };
  }

  if (parts[0] === "search") {
    return { view: "search" };
  }

  if (parts[0] === "maintenance") {
    return { view: "maintenance" };
  }

  return { view: "board", projectId: null, boardId: null, taskId: null };
}

export function routePath(route: AppRoute) {
  if (route.view === "projects") {
    return route.projectId ? `/projects/${encodeURIComponent(route.projectId)}` : "/projects";
  }
  if (route.view === "board") {
    if (route.projectId && route.boardId && route.taskId) {
      return `/projects/${encodeURIComponent(route.projectId)}/boards/${encodeURIComponent(
        route.boardId,
      )}/tasks/${encodeURIComponent(route.taskId)}`;
    }
    if (route.projectId && route.boardId) {
      return `/projects/${encodeURIComponent(route.projectId)}/boards/${encodeURIComponent(route.boardId)}`;
    }
    return "/";
  }
  if (route.view === "settings") {
    return `/settings/${encodeURIComponent(route.section)}`;
  }
  return `/${route.view}`;
}
