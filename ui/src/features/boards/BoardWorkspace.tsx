import { useMemo } from "react";
import type { Board, BoardColumn, Project, Task, TaskContext, TaskPriority } from "../../domain/types";
import { glyphForName } from "../../lib/task-display";
import { Button, EmptyState, Icon, InlineError, Mono } from "../../components/ui";
import { Topbar } from "../../components/layout";
import { TaskDetail } from "../tasks";
import { BoardColumnView } from "./BoardColumnView";

export function BoardWorkspace({
  activeBoard,
  activeProject,
  activeTaskContext,
  activeTaskId,
  columns,
  error,
  loadingBoard,
  loadingProjects,
  loadingTask,
  mutationError,
  newTaskColumnId,
  onArchiveTask,
  onCloseTask,
  onCreateBoard,
  onCreateProject,
  onCompleteTask,
  onCreateTask,
  onMoveTask,
  onOpenCreateTask,
  onOpenTask,
  onPostComment,
  onRefresh,
  syncError,
  tasks,
}: {
  activeBoard: Board | null;
  activeProject: Project | null;
  activeTaskContext?: TaskContext;
  activeTaskId: string | null;
  columns: BoardColumn[];
  error: string | null;
  loadingBoard: boolean;
  loadingProjects: boolean;
  loadingTask: boolean;
  mutationError: string | null;
  newTaskColumnId: string | null;
  onArchiveTask: (taskId: string) => Promise<void>;
  onCloseTask: () => void;
  onCreateBoard: () => void;
  onCreateProject: () => void;
  onCompleteTask: (taskId: string) => Promise<void>;
  onCreateTask: (input: {
    title: string;
    description?: string | null;
    columnId?: string;
    priority?: TaskPriority;
    labels?: string[];
  }) => Promise<void>;
  onMoveTask: (taskId: string, input: { columnId?: string; position?: number }) => Promise<void>;
  onOpenCreateTask: (columnId: string | null) => void;
  onOpenTask: (taskId: string) => void;
  onPostComment: (taskId: string, body: string) => Promise<void>;
  onRefresh: (taskId?: string | null) => Promise<void>;
  syncError: string | null;
  tasks: Task[];
}) {
  const tasksByColumn = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const column of columns) {
      map.set(column.id, []);
    }
    for (const task of [...tasks].sort((a, b) => a.position - b.position)) {
      map.get(task.columnId)?.push(task);
    }
    return map;
  }, [columns, tasks]);

  const loadingWorkspace = loadingProjects || loadingBoard;

  if (!activeProject) {
    return (
      <>
        <Topbar crumbs={[{ label: "Boards", icon: <Icon name="board" /> }]} />
        {loadingProjects ? (
          <div className="board-layout">
            <div className="board-main">
              <BoardColumnsSkeleton />
            </div>
          </div>
        ) : (
          <div className="workspace-pane">
            <EmptyState
              title="No project selected"
              body="Create a project from the sidebar to make the first working board."
              action={<Button icon={<Icon name="plus" />} onClick={onCreateProject} variant="primary">Create First Project</Button>}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <Topbar
        actions={
          <>
            <Button icon={<Icon name="refresh" />} onClick={() => onRefresh(activeTaskId)} variant="ghost">
              Sync
            </Button>
            <Button
              disabled={loadingWorkspace || !columns[0]}
              icon={<Icon name="plus" />}
              kbd="N"
              onClick={() => onOpenCreateTask(columns[0]?.id ?? null)}
              variant="primary"
            >
              New task
            </Button>
          </>
        }
        crumbs={[
          { label: activeProject.name, glyph: glyphForName(activeProject.name) },
          { label: activeBoard?.name ?? "No board", id: activeBoard?.id, icon: <Icon name="board" /> },
        ]}
      />
      <InlineError message={error ?? mutationError ?? (syncError ? `Background sync failed: ${syncError}` : null)} />
      {!activeBoard && !loadingWorkspace && (
        <div className="workspace-pane">
          <EmptyState
            title="No boards in this project"
            body="Use the sidebar board button to create a default Kanban workflow."
            action={<Button icon={<Icon name="plus" />} onClick={onCreateBoard} variant="primary">Create First Board</Button>}
          />
        </div>
      )}
      {(activeBoard || loadingWorkspace) && (
        <div className={activeTaskId ? "board-layout board-layout--detail" : "board-layout"}>
          <div className="board-main">
            <div className="subtoolbar">
              <div className="segmented">
                <span className="segmented__item segmented__item--active">Board</span>
                <span className="segmented__item">List</span>
                <span className="segmented__item">Timeline</span>
              </div>
              <Mono faded>
                {loadingWorkspace
                  ? "Loading board"
                  : `${tasks.length} tasks · ${columns.length} columns · ${tasks.filter((task) => task.completedAt).length} done`}
              </Mono>
              <span className="subtoolbar__spacer" />
              <span className="toolbar-label">Group by</span>
              <button className="small-select" type="button">Status <Icon name="down" size={12} /></button>
              <span className="toolbar-label">Sort</span>
              <button className="small-select" type="button">Position <Icon name="down" size={12} /></button>
            </div>
            {loadingWorkspace ? (
              <BoardColumnsSkeleton />
            ) : (
              <div className="board-columns">
                {columns.map((column) => (
                  <BoardColumnView
                    activeTaskId={activeTaskId}
                    column={column}
                    isCreating={newTaskColumnId === column.id}
                    key={column.id}
                    onArchiveTask={onArchiveTask}
                    onCreateTask={onCreateTask}
                    onMoveTask={onMoveTask}
                    onOpenCreateTask={onOpenCreateTask}
                    onOpenTask={onOpenTask}
                    tasks={tasksByColumn.get(column.id) ?? []}
                    totalColumns={columns}
                  />
                ))}
              </div>
            )}
          </div>
          {activeTaskId && (
            <TaskDetail
              columns={columns}
              context={activeTaskContext}
              loading={loadingTask}
              onArchiveTask={onArchiveTask}
              onClose={onCloseTask}
              onCompleteTask={onCompleteTask}
              onMoveTask={onMoveTask}
              onPostComment={onPostComment}
            />
          )}
        </div>
      )}
    </>
  );
}

function BoardColumnsSkeleton() {
  return (
    <div className="board-columns" aria-label="Loading board">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="column-skeleton" key={index} />
      ))}
    </div>
  );
}
