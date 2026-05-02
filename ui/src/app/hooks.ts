import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { routePath, type AppRoute } from "./router";
import type { Board, Health, ProjectTreeItem, Task, TaskContext } from "../domain/types";

export function useHealth() {
  const [health, setHealth] = useState<Health | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await api.health());
    } catch {
      setHealth({ ok: false, database: { ok: false, error: "API unavailable" } });
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const id = window.setInterval(loadHealth, 15000);
    return () => window.clearInterval(id);
  }, [loadHealth]);

  return health;
}

export function useProjectTree({
  activeBoardId,
  activeProjectId,
  navigate,
  route,
}: {
  activeBoardId: string | null;
  activeProjectId: string | null;
  navigate: (route: AppRoute, mode?: "push" | "replace") => void;
  route: AppRoute;
}) {
  const [projectTree, setProjectTree] = useState<ProjectTreeItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(activeProjectId);
  const [resolvedBoardId, setResolvedBoardId] = useState<string | null>(activeBoardId);
  const routeTaskId = route.view === "board" ? route.taskId : null;

  const loadProjects = useCallback(async (preferredProjectId = activeProjectId, preferredBoardId = activeBoardId) => {
    setLoadingProjects(true);
    try {
      const projects = await api.listProjects();
      const tree = await Promise.all(
        projects.map(async (project) => ({
          project,
          boards: await api.listBoards(project.id),
          taskCount: null,
        })),
      );
      setProjectTree(tree);
      setError(null);

      const currentProject = preferredProjectId
        ? tree.find((item) => item.project.id === preferredProjectId)
        : null;
      const nextProject = currentProject ?? tree[0] ?? null;
      const currentBoard = preferredBoardId
        ? nextProject?.boards.find((item) => item.id === preferredBoardId)
        : null;
      const nextBoard = currentBoard ?? nextProject?.boards[0] ?? null;

      setResolvedProjectId(nextProject?.project.id ?? null);
      setResolvedBoardId(nextBoard?.id ?? null);

      if (route.view === "board" && !routeTaskId && nextProject?.project.id && nextBoard?.id) {
        const normalizedRoute: AppRoute = {
          view: "board",
          projectId: nextProject.project.id,
          boardId: nextBoard.id,
          taskId: null,
        };
        if (window.location.pathname !== routePath(normalizedRoute)) {
          navigate(normalizedRoute, "replace");
        }
      }
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setLoadingProjects(false);
    }
  }, [activeBoardId, activeProjectId, navigate, route.view, routeTaskId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return {
    error,
    loadProjects,
    loadingProjects,
    projectTree,
    resolvedBoardId,
    resolvedProjectId,
    setError,
  };
}

export function useBoard(activeProjectId: string | null, activeBoardId: string | null) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    if (!activeProjectId || !activeBoardId) {
      setBoard(null);
      return;
    }

    setLoadingBoard(true);
    try {
      const nextBoard = await api.getBoard(activeProjectId, activeBoardId);
      setBoard(nextBoard);
      setError(null);
    } catch (err) {
      setError(apiMessage(err));
      setBoard(null);
    } finally {
      setLoadingBoard(false);
    }
  }, [activeBoardId, activeProjectId]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const columns = useMemo(
    () => [...(board?.columns ?? [])].sort((a, b) => a.position - b.position),
    [board?.columns],
  );
  const tasks = board?.tasks ?? [];

  return { board, columns, error, loadBoard, loadingBoard, tasks };
}

export function useTaskContexts(activeTaskId: string | null) {
  const [taskContexts, setTaskContexts] = useState<Record<string, TaskContext>>({});
  const [loadingTask, setLoadingTask] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTaskContext = useCallback(async (taskId: string) => {
    setLoadingTask(true);
    try {
      const context = await api.getTaskContext(taskId);
      setTaskContexts((current) => ({ ...current, [taskId]: context }));
      setError(null);
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setLoadingTask(false);
    }
  }, []);

  useEffect(() => {
    if (activeTaskId) {
      loadTaskContext(activeTaskId);
    }
  }, [activeTaskId, loadTaskContext]);

  return {
    error,
    loadTaskContext,
    loadingTask,
    taskContext: activeTaskId ? taskContexts[activeTaskId] : undefined,
  };
}

export function withCurrentTaskCounts(tree: ProjectTreeItem[], boardId: string | null, tasks: Task[]) {
  return tree.map((item) => ({
    ...item,
    taskCount:
      item.boards.some((board) => board.id === boardId) && boardId
        ? tasks.filter((task) => !task.archivedAt).length
        : item.taskCount,
  }));
}
