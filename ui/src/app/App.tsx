import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../components/layout";
import type { AppRoute } from "./router";
import { defaultSettingsSection, parseRoute, routePath } from "./router";
import { useBoard, useHealth, useProjectTree, useTaskContexts, withCurrentTaskCounts } from "./hooks";
import { api } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { backgroundSyncIntervalMs, type TaskDraftsById } from "./sync";
import { persistTheme, storedTheme } from "../lib/theme";
import type { SearchResult, Theme, View } from "../domain/types";
import { BoardWorkspace } from "../features/boards";
import { ProjectsWorkspace } from "../features/projects";
import { SearchWorkspace } from "../features/search";
import { SettingsWorkspace } from "../features/settings";
import { PlannedWorkspace } from "../features/planned";
import { CreateBoardPanel, CreateProjectPanel } from "./CreateResourcePanels";

export function App() {
  const initialRoute = useMemo(() => parseRoute(), []);
  const [theme, setThemeState] = useState<Theme>(storedTheme);
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newTaskColumnId, setNewTaskColumnId] = useState<string | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<TaskDraftsById>({});

  const setTheme = (next: Theme) => {
    setThemeState(next);
    persistTheme(next);
  };

  const applyRoute = useCallback((nextRoute: AppRoute) => {
    setRoute(nextRoute);
  }, []);

  const navigate = useCallback(
    (nextRoute: AppRoute, mode: "push" | "replace" = "push") => {
      const nextPath = routePath(nextRoute);
      const currentPath = `${window.location.pathname}${window.location.search}`;
      if (currentPath !== nextPath) {
        window.history[mode === "replace" ? "replaceState" : "pushState"]({}, "", nextPath);
      }
      applyRoute(nextRoute);
    },
    [applyRoute],
  );

  useEffect(() => {
    const handlePopState = () => applyRoute(parseRoute());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyRoute]);

  const view = route.view;
  const activeProjectId = route.view === "board" || route.view === "projects" ? route.projectId : null;
  const activeBoardId = route.view === "board" ? route.boardId : null;
  const activeTaskId = route.view === "board" ? route.taskId : null;
  const health = useHealth();
  const {
    error: projectError,
    loadProjects,
    loadingProjects,
    projectTree,
    resolvedBoardId,
    resolvedProjectId,
    syncError: projectSyncError,
  } = useProjectTree({
    activeBoardId,
    activeProjectId,
    navigate,
    route,
  });

  const selectedProjectId = activeProjectId ?? resolvedProjectId;
  const selectedBoardId = activeBoardId ?? resolvedBoardId;
  const trackTaskDraft = useCallback(
    (taskId: string, fields: { title?: string; description?: string | null } | null) => {
      setTaskDrafts((current) => {
        if (!fields) {
          if (!current[taskId]) {
            return current;
          }
          const next = { ...current };
          delete next[taskId];
          return next;
        }

        return {
          ...current,
          [taskId]: {
            fields,
            localModifiedAt: Date.now(),
          },
        };
      });
    },
    [],
  );
  const {
    board,
    columns,
    error: boardError,
    loadBoard,
    loadingBoard,
    syncError: boardSyncError,
    tasks,
  } = useBoard(selectedProjectId, selectedBoardId, taskDrafts);
  const {
    error: taskError,
    loadTaskContext,
    loadingTask,
    syncError: taskSyncError,
    taskContext,
  } = useTaskContexts(activeTaskId);

  const activeProject = useMemo(
    () => projectTree.find((item) => item.project.id === selectedProjectId)?.project ?? null,
    [selectedProjectId, projectTree],
  );
  const activeBoard = board ?? projectTree.flatMap((item) => item.boards).find((item) => item.id === selectedBoardId) ?? null;
  const displayedProjectTree = withCurrentTaskCounts(projectTree, selectedBoardId, tasks);
  const error = projectError ?? boardError ?? taskError;
  const syncError = projectSyncError ?? boardSyncError ?? taskSyncError;

  const refreshAfterMutation = useCallback(
    async (taskId?: string | null) => {
      await Promise.all([loadProjects(selectedProjectId, selectedBoardId), loadBoard()]);
      if (taskId) {
        await loadTaskContext(taskId);
      }
    },
    [loadBoard, loadProjects, loadTaskContext, selectedBoardId, selectedProjectId],
  );

  const backgroundSync = useCallback(async () => {
    if (document.hidden) {
      return;
    }

    await Promise.all([
      loadProjects(selectedProjectId, selectedBoardId, { normalizeRoute: false, quiet: true }),
      loadBoard({ quiet: true }),
      activeTaskId ? loadTaskContext(activeTaskId, { quiet: true }) : Promise.resolve(),
    ]);
  }, [activeTaskId, loadBoard, loadProjects, loadTaskContext, selectedBoardId, selectedProjectId]);

  useEffect(() => {
    const sync = () => {
      void backgroundSync();
    };
    const intervalId = window.setInterval(sync, backgroundSyncIntervalMs);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        sync();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [backgroundSync]);

  const moveTask = useCallback(
    async (taskId: string, input: { columnId?: string; position?: number }) => {
      setMutationError(null);
      try {
        await api.moveTask(taskId, input);
        await refreshAfterMutation(activeTaskId === taskId ? taskId : null);
      } catch (err) {
        setMutationError(apiMessage(err));
      }
    },
    [activeTaskId, refreshAfterMutation],
  );

  const openTask = (taskId: string) => {
    navigate({
      view: "board",
      projectId: selectedProjectId,
      boardId: selectedBoardId,
      taskId,
    });
  };

  const selectView = (nextView: View) => {
    if (nextView === "board") {
      navigate({ view: "board", projectId: selectedProjectId, boardId: selectedBoardId, taskId: null });
      return;
    }
    if (nextView === "projects") {
      navigate({ view: "projects", projectId: null });
      return;
    }
    if (nextView === "settings") {
      navigate({ view: "settings", section: defaultSettingsSection });
      return;
    }
    if (nextView === "search") {
      navigate({ view: "search", query: null });
      return;
    }
    navigate({ view: nextView });
  };

  const openSearchResult = useCallback(
    (result: SearchResult) => {
      if (!result.projectId || !result.boardId) {
        return;
      }
      const taskId =
        result.sourceType === "board" ? null : result.taskId ?? result.sourceId;
      navigate({
        view: "board",
        projectId: result.projectId,
        boardId: result.boardId,
        taskId,
      });
    },
    [navigate],
  );

  const handleSearchSubmit = useCallback(
    (nextQuery: string) => {
      navigate({ view: "search", query: nextQuery });
    },
    [navigate],
  );

  const handleSearchQueryChange = useCallback(
    (nextQuery: string | null) => {
      navigate({ view: "search", query: nextQuery }, "replace");
    },
    [navigate],
  );

  return (
    <div className="tb app-shell" data-theme={theme}>
      <Sidebar
        activeBoardId={selectedBoardId}
        activeProjectId={selectedProjectId}
        health={health}
        loading={loadingProjects}
        onCreateBoard={() => setNewBoardOpen(true)}
        onCreateProject={() => setNewProjectOpen(true)}
        onOpenSearchResult={openSearchResult}
        onSearchSubmit={handleSearchSubmit}
        onSelectBoard={(projectId, boardId) => {
          navigate({ view: "board", projectId, boardId, taskId: null });
        }}
        onSelectProject={(projectId) => {
          navigate({ view: "projects", projectId });
        }}
        onSelectView={selectView}
        projectTree={displayedProjectTree}
        view={view}
      />
      <main className="workspace">
        {view === "board" && (
          <BoardWorkspace
            activeBoard={activeBoard}
            activeProject={activeProject}
            activeTaskContext={taskContext}
            activeTaskId={activeTaskId}
            columns={columns}
            error={error}
            loadingBoard={loadingBoard}
            loadingProjects={loadingProjects}
            loadingTask={loadingTask}
            mutationError={mutationError}
            newTaskColumnId={newTaskColumnId}
            onArchiveTask={async (taskId) => {
              setMutationError(null);
              try {
                await api.archiveTask(taskId);
                navigate({ view: "board", projectId: selectedProjectId, boardId: selectedBoardId, taskId: null }, "replace");
                await refreshAfterMutation(null);
              } catch (err) {
                setMutationError(apiMessage(err));
              }
            }}
            onCloseTask={() =>
              navigate({ view: "board", projectId: selectedProjectId, boardId: selectedBoardId, taskId: null })
            }
            onCreateBoard={() => setNewBoardOpen(true)}
            onCreateProject={() => setNewProjectOpen(true)}
            onCompleteTask={async (taskId) => {
              setMutationError(null);
              try {
                await api.completeTask(taskId);
                await refreshAfterMutation(taskId);
              } catch (err) {
                setMutationError(apiMessage(err));
              }
            }}
            onCreateTask={async (input) => {
              if (!selectedProjectId || !selectedBoardId) {
                throw new Error("Select a board before creating a task.");
              }
              setMutationError(null);
              const created = await api.createTask(selectedProjectId, selectedBoardId, input);
              setNewTaskColumnId(null);
              await refreshAfterMutation(null);
              navigate({
                view: "board",
                projectId: selectedProjectId,
                boardId: selectedBoardId,
                taskId: created.task.id,
              });
            }}
            onDeleteTaskAttachment={async (taskId, attachmentId) => {
              setMutationError(null);
              try {
                await api.deleteTaskAttachment(taskId, attachmentId);
                await refreshAfterMutation(taskId);
              } catch (err) {
                setMutationError(apiMessage(err));
                throw err;
              }
            }}
            onMoveTask={moveTask}
            onOpenCreateTask={(columnId) => setNewTaskColumnId(columnId)}
            onOpenTask={openTask}
            onPostComment={async (taskId, body) => {
              setMutationError(null);
              try {
                await api.createComment(taskId, { body });
                await refreshAfterMutation(taskId);
              } catch (err) {
                setMutationError(apiMessage(err));
              }
            }}
            onRefresh={refreshAfterMutation}
            onTaskDraftChange={trackTaskDraft}
            onUpdateTask={async (taskId, input) => {
              setMutationError(null);
              try {
                await api.updateTask(taskId, input);
                await refreshAfterMutation(taskId);
              } catch (err) {
                setMutationError(apiMessage(err));
                throw err;
              }
            }}
            onUploadTaskAttachment={async (taskId, file) => {
              setMutationError(null);
              try {
                const created = await api.uploadTaskAttachment(taskId, file);
                await refreshAfterMutation(taskId);
                return created.attachment;
              } catch (err) {
                setMutationError(apiMessage(err));
                throw err;
              }
            }}
            syncError={syncError}
            tasks={tasks}
          />
        )}
        {view === "projects" && (
          <ProjectsWorkspace
            activeProjectId={selectedProjectId}
            loading={loadingProjects}
            onCreateProject={() => setNewProjectOpen(true)}
            onSelectProject={(projectId) => {
              const project = projectTree.find((item) => item.project.id === projectId);
              if (project?.boards[0]) {
                navigate({
                  view: "board",
                  projectId,
                  boardId: project.boards[0].id,
                  taskId: null,
                });
              } else {
                navigate({ view: "projects", projectId });
              }
            }}
            projectTree={displayedProjectTree}
          />
        )}
        {view === "search" && (
          <SearchWorkspace
            initialQuery={route.view === "search" ? route.query : null}
            onOpenResult={openSearchResult}
            onQueryChange={handleSearchQueryChange}
            projectTree={displayedProjectTree}
          />
        )}
        {view === "maintenance" && <PlannedWorkspace icon="database" title="Maintenance" health={health} />}
        {view === "settings" && (
          <SettingsWorkspace
            health={health}
            onSectionChange={(section) => navigate({ view: "settings", section })}
            onThemeChange={setTheme}
            section={route.view === "settings" ? route.section : defaultSettingsSection}
            theme={theme}
          />
        )}
      </main>

      {newProjectOpen && (
        <CreateProjectPanel
          onCancel={() => setNewProjectOpen(false)}
          onSubmit={async (input) => {
            setMutationError(null);
            const project = await api.createProject(input);
            setNewProjectOpen(false);
            navigate({ view: "projects", projectId: project.id });
            await loadProjects(project.id, null);
          }}
        />
      )}
      {newBoardOpen && selectedProjectId && (
        <CreateBoardPanel
          onCancel={() => setNewBoardOpen(false)}
          onSubmit={async (input) => {
            setMutationError(null);
            const created = await api.createBoard(selectedProjectId, input);
            setNewBoardOpen(false);
            navigate({ view: "board", projectId: selectedProjectId, boardId: created.id, taskId: null });
            await loadProjects(selectedProjectId, created.id);
            await loadBoard();
          }}
        />
      )}
    </div>
  );
}
