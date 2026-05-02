import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../components/layout";
import type { AppRoute } from "./router";
import { defaultSettingsSection, parseRoute, routePath, viewFromRoute } from "./router";
import { useBoard, useHealth, useProjectTree, useTaskContexts, withCurrentTaskCounts } from "./hooks";
import { api } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { persistTheme, storedTheme } from "../lib/theme";
import type { Theme, View } from "../domain/types";
import { BoardWorkspace } from "../features/boards";
import { ProjectsWorkspace } from "../features/projects";
import { SettingsWorkspace } from "../features/settings";
import { PlannedWorkspace } from "../features/planned";
import { CreateBoardPanel, CreateProjectPanel } from "./CreateResourcePanels";

export function App() {
  const initialRoute = useMemo(() => parseRoute(), []);
  const [theme, setThemeState] = useState<Theme>(storedTheme);
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const [view, setView] = useState<View>(() => viewFromRoute(initialRoute));
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    initialRoute.view === "board" || initialRoute.view === "projects" ? initialRoute.projectId : null,
  );
  const [activeBoardId, setActiveBoardId] = useState<string | null>(
    initialRoute.view === "board" ? initialRoute.boardId : null,
  );
  const [activeTaskId, setActiveTaskId] = useState<string | null>(
    initialRoute.view === "board" ? initialRoute.taskId : null,
  );
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newTaskColumnId, setNewTaskColumnId] = useState<string | null>(null);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    persistTheme(next);
  };

  const applyRoute = useCallback((nextRoute: AppRoute) => {
    setRoute(nextRoute);
    setView(nextRoute.view);
    if (nextRoute.view === "board") {
      setActiveProjectId(nextRoute.projectId);
      setActiveBoardId(nextRoute.boardId);
      setActiveTaskId(nextRoute.taskId);
      return;
    }
    if (nextRoute.view === "projects") {
      setActiveProjectId(nextRoute.projectId);
      setActiveBoardId(null);
      setActiveTaskId(null);
      return;
    }
    setActiveTaskId(null);
  }, []);

  const navigate = useCallback(
    (nextRoute: AppRoute, mode: "push" | "replace" = "push") => {
      const nextPath = routePath(nextRoute);
      if (window.location.pathname !== nextPath) {
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

  const health = useHealth();
  const {
    error: projectError,
    loadProjects,
    loadingProjects,
    projectTree,
    resolvedBoardId,
    resolvedProjectId,
  } = useProjectTree({
    activeBoardId,
    activeProjectId,
    navigate,
    route,
  });

  const selectedProjectId = activeProjectId ?? resolvedProjectId;
  const selectedBoardId = activeBoardId ?? resolvedBoardId;
  const {
    board,
    columns,
    error: boardError,
    loadBoard,
    loadingBoard,
    tasks,
  } = useBoard(selectedProjectId, selectedBoardId);
  const {
    error: taskError,
    loadTaskContext,
    loadingTask,
    taskContext,
  } = useTaskContexts(activeTaskId);

  const activeProject = useMemo(
    () => projectTree.find((item) => item.project.id === selectedProjectId)?.project ?? null,
    [selectedProjectId, projectTree],
  );
  const activeBoard = board ?? projectTree.flatMap((item) => item.boards).find((item) => item.id === selectedBoardId) ?? null;
  const displayedProjectTree = withCurrentTaskCounts(projectTree, selectedBoardId, tasks);
  const error = projectError ?? boardError ?? taskError;

  const refreshAfterMutation = useCallback(
    async (taskId?: string | null) => {
      await Promise.all([loadProjects(selectedProjectId, selectedBoardId), loadBoard()]);
      if (taskId) {
        await loadTaskContext(taskId);
      }
    },
    [loadBoard, loadProjects, loadTaskContext, selectedBoardId, selectedProjectId],
  );

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
    navigate({ view: nextView });
  };

  return (
    <div className="tb app-shell" data-theme={theme}>
      <Sidebar
        activeBoardId={selectedBoardId}
        activeProjectId={selectedProjectId}
        health={health}
        loading={loadingProjects}
        onCreateBoard={() => setNewBoardOpen(true)}
        onCreateProject={() => setNewProjectOpen(true)}
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
                return;
              }
              setMutationError(null);
              try {
                const created = await api.createTask(selectedProjectId, selectedBoardId, input);
                setNewTaskColumnId(null);
                await refreshAfterMutation(null);
                navigate({
                  view: "board",
                  projectId: selectedProjectId,
                  boardId: selectedBoardId,
                  taskId: created.task.id,
                });
              } catch (err) {
                setMutationError(apiMessage(err));
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
        {view === "search" && <PlannedWorkspace icon="search" title="Search" health={health} />}
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
