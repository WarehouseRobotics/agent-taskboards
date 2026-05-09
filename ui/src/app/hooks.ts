import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { routePath, type AppRoute } from "./router";
import type { Board, Health, ProjectTreeItem, Task, TaskContext } from "../domain/types";
import { mergeBoard, mergeProjectTree, type TaskDraftsById } from "./sync";

const maxTaskContextCacheSize = 25;

interface LoadOptions {
  ignoreDrafts?: boolean;
  normalizeRoute?: boolean;
  quiet?: boolean;
}

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
  const [syncError, setSyncError] = useState<string | null>(null);
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(activeProjectId);
  const [resolvedBoardId, setResolvedBoardId] = useState<string | null>(activeBoardId);
  const activeBoardIdRef = useRef(activeBoardId);
  const activeProjectIdRef = useRef(activeProjectId);
  const loadProjectsRef = useRef<Promise<void> | null>(null);
  const navigateRef = useRef(navigate);
  const routeRef = useRef(route);

  useEffect(() => {
    activeBoardIdRef.current = activeBoardId;
    activeProjectIdRef.current = activeProjectId;
    navigateRef.current = navigate;
    routeRef.current = route;
  }, [activeBoardId, activeProjectId, navigate, route]);

  const loadProjects = useCallback(async (
    preferredProjectId?: string | null,
    preferredBoardId?: string | null,
    options: LoadOptions = {},
  ) => {
    if (loadProjectsRef.current) {
      return loadProjectsRef.current.catch(() => undefined);
    }

    const loadPromise = (async () => {
      if (!options.quiet) {
        setLoadingProjects(true);
      }
      const nextPreferredProjectId = preferredProjectId === undefined ? activeProjectIdRef.current : preferredProjectId;
      const nextPreferredBoardId = preferredBoardId === undefined ? activeBoardIdRef.current : preferredBoardId;
      const projects = await api.listProjects();
      const tree = await Promise.all(
        projects.map(async (project) => ({
          project,
          boards: await api.listBoards(project.id),
          taskCount: null,
        })),
      );
      setProjectTree((current) => mergeProjectTree(current, tree, { preserveEmptyIncoming: options.quiet }));
      if (options.quiet && tree.length === 0) {
        setError(null);
        setSyncError(null);
        return;
      }
      setError(null);
      setSyncError(null);

      const currentProject = nextPreferredProjectId
        ? tree.find((item) => item.project.id === nextPreferredProjectId)
        : null;
      const nextProject = currentProject ?? tree[0] ?? null;
      const currentBoard = nextPreferredBoardId
        ? nextProject?.boards.find((item) => item.id === nextPreferredBoardId)
        : null;
      const nextBoard = currentBoard ?? nextProject?.boards[0] ?? null;

      setResolvedProjectId(nextProject?.project.id ?? null);
      setResolvedBoardId(nextBoard?.id ?? null);

      const currentRoute = routeRef.current;
      const routeTaskId = currentRoute.view === "board" ? currentRoute.taskId : null;
      if (options.normalizeRoute !== false && currentRoute.view === "board") {
        const routeBoardStillValid =
          currentRoute.projectId === nextProject?.project.id && currentRoute.boardId === nextBoard?.id;
        const normalizedRoute: AppRoute = {
          view: "board",
          projectId: nextProject?.project.id ?? null,
          boardId: nextBoard?.id ?? null,
          taskId: routeBoardStillValid ? routeTaskId : null,
        };
        if (window.location.pathname !== routePath(normalizedRoute)) {
          navigateRef.current(normalizedRoute, "replace");
        }
      }
    })();

    loadProjectsRef.current = loadPromise;
    try {
      await loadPromise;
    } catch (err) {
      if (options.quiet) {
        setSyncError(apiMessage(err));
      } else {
        setError(apiMessage(err));
      }
    } finally {
      if (loadProjectsRef.current === loadPromise) {
        loadProjectsRef.current = null;
      }
      if (!options.quiet) {
        setLoadingProjects(false);
      }
    }
  }, []);

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
    syncError,
  };
}

export function useBoard(
  activeProjectId: string | null,
  activeBoardId: string | null,
  taskDrafts: TaskDraftsById = {},
) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const activeBoardIdRef = useRef(activeBoardId);
  const activeProjectIdRef = useRef(activeProjectId);
  const loadBoardRef = useRef<Record<string, Promise<void> | undefined>>({});
  const taskDraftsRef = useRef(taskDrafts);

  useEffect(() => {
    activeBoardIdRef.current = activeBoardId;
    activeProjectIdRef.current = activeProjectId;
  }, [activeBoardId, activeProjectId]);

  useEffect(() => {
    taskDraftsRef.current = taskDrafts;
  }, [taskDrafts]);

  const loadBoard = useCallback(async (options: LoadOptions = {}) => {
    if (!activeProjectId || !activeBoardId) {
      if (!options.quiet) {
        setBoard(null);
      }
      return;
    }

    const boardKey = `${activeProjectId}:${activeBoardId}`;
    const existingLoad = loadBoardRef.current[boardKey];
    if (existingLoad) {
      return existingLoad.catch(() => undefined);
    }

    const loadPromise = (async () => {
      if (!options.quiet) {
        setLoadingBoard(true);
      }
      const nextBoard = await api.getBoard(activeProjectId, activeBoardId);
      if (activeProjectIdRef.current !== activeProjectId || activeBoardIdRef.current !== activeBoardId) {
        return;
      }
      setBoard((current) =>
        mergeBoard(
          current,
          nextBoard,
          options.ignoreDrafts ? {} : taskDraftsRef.current,
        ),
      );
      setError(null);
      setSyncError(null);
    })();

    loadBoardRef.current[boardKey] = loadPromise;
    try {
      await loadPromise;
    } catch (err) {
      if (options.quiet) {
        setSyncError(apiMessage(err));
      } else {
        setError(apiMessage(err));
        setBoard(null);
      }
    } finally {
      if (loadBoardRef.current[boardKey] === loadPromise) {
        delete loadBoardRef.current[boardKey];
      }
      if (!options.quiet) {
        setLoadingBoard(false);
      }
    }
  }, [activeBoardId, activeProjectId]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const selectedBoard =
    board?.projectId === activeProjectId && board.id === activeBoardId ? board : null;
  const loadingSelectedBoard = Boolean(activeProjectId && activeBoardId && !selectedBoard && !error);
  const columns = useMemo(
    () => [...(selectedBoard?.columns ?? [])].sort((a, b) => a.position - b.position),
    [selectedBoard?.columns],
  );
  const tasks = selectedBoard?.tasks ?? [];

  return {
    board: selectedBoard,
    columns,
    error,
    loadBoard,
    loadingBoard: loadingBoard || loadingSelectedBoard,
    syncError,
    tasks,
  };
}

export function useTaskContexts(activeTaskId: string | null) {
  const [taskContexts, setTaskContexts] = useState<Record<string, TaskContext>>({});
  const [loadingTask, setLoadingTask] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const loadTaskContextRef = useRef<Record<string, Promise<void> | undefined>>({});

  const loadTaskContext = useCallback(async (taskId: string, options: LoadOptions = {}) => {
    const existing = loadTaskContextRef.current[taskId];
    if (existing) {
      return existing.catch(() => undefined);
    }

    const loadPromise = (async () => {
      if (!options.quiet) {
        setLoadingTask(true);
      }
      const context = await api.getTaskContext(taskId);
      setTaskContexts((current) => {
        const next = { ...current };
        delete next[taskId];
        next[taskId] = context;

        const cachedTaskIds = Object.keys(next);
        const staleTaskIds = cachedTaskIds.slice(0, Math.max(0, cachedTaskIds.length - maxTaskContextCacheSize));
        for (const staleTaskId of staleTaskIds) {
          delete next[staleTaskId];
        }
        return next;
      });
      setError(null);
      setSyncError(null);
    })();

    loadTaskContextRef.current[taskId] = loadPromise;
    try {
      await loadPromise;
    } catch (err) {
      if (options.quiet) {
        setSyncError(apiMessage(err));
      } else {
        setError(apiMessage(err));
      }
    } finally {
      if (loadTaskContextRef.current[taskId] === loadPromise) {
        delete loadTaskContextRef.current[taskId];
      }
      if (!options.quiet) {
        setLoadingTask(false);
      }
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
    syncError,
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
