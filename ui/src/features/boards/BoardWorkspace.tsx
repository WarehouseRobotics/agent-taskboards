import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Board, BoardColumn, Project, Task, TaskAttachment, TaskContext, TaskPriority } from "../../domain/types";
import { columnStatus, glyphForName } from "../../lib/task-display";
import { formatDate } from "../../lib/format";
import { Button, EmptyState, Icon, InlineError, LabelChip, Mono, PriorityFlag, StatusIcon } from "../../components/ui";
import { Topbar } from "../../components/layout";
import { TaskDetail } from "../tasks";
import { BoardColumnView } from "./BoardColumnView";
import {
  boardSortOptions,
  persistBoardDisplayMode,
  sortBoardTasks,
  storedBoardDisplayMode,
  type BoardDisplayMode,
  type BoardSortKey,
} from "./board-view-state";

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
  onDeleteTaskAttachment,
  onMoveTask,
  onOpenCreateTask,
  onOpenTask,
  onPostComment,
  onRefresh,
  onRenameBoard,
  onRenameProject,
  onTaskDraftChange,
  onUpdateTask,
  onUploadTaskAttachment,
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
  onDeleteTaskAttachment: (taskId: string, attachmentId: string) => Promise<void>;
  onMoveTask: (taskId: string, input: { columnId?: string; position?: number }) => Promise<void>;
  onOpenCreateTask: (columnId: string | null) => void;
  onOpenTask: (taskId: string) => void;
  onPostComment: (taskId: string, body: string) => Promise<void>;
  onRefresh: (taskId?: string | null) => Promise<void>;
  onRenameBoard: () => void;
  onRenameProject: () => void;
  onTaskDraftChange: (taskId: string, fields: { title?: string; description?: string | null } | null) => void;
  onUpdateTask: (taskId: string, input: { title?: string; description?: string | null }) => Promise<void>;
  onUploadTaskAttachment: (taskId: string, file: File) => Promise<TaskAttachment>;
  syncError: string | null;
  tasks: Task[];
}) {
  const [displayMode, setDisplayMode] = useState<BoardDisplayMode>(storedBoardDisplayMode);
  const [sortKey, setSortKey] = useState<BoardSortKey>("position");
  const sortedTasks = useMemo(() => sortBoardTasks(tasks, columns, sortKey), [columns, sortKey, tasks]);
  const columnsById = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);
  const tasksByColumn = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const column of columns) {
      map.set(column.id, []);
    }
    for (const task of sortedTasks) {
      map.get(task.columnId)?.push(task);
    }
    return map;
  }, [columns, sortedTasks]);

  const loadingWorkspace = loadingProjects || loadingBoard;
  const setDisplayPreference = (mode: BoardDisplayMode) => {
    setDisplayMode(mode);
    persistBoardDisplayMode(mode);
  };

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
            <Button onClick={onRenameProject} variant="ghost">
              Rename project
            </Button>
            <Button disabled={!activeBoard} onClick={onRenameBoard} variant="ghost">
              Rename board
            </Button>
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
                <button
                  className={displayMode === "board" ? "segmented__item segmented__item--active" : "segmented__item"}
                  onClick={() => setDisplayPreference("board")}
                  type="button"
                >
                  Board
                </button>
                <button
                  className={displayMode === "list" ? "segmented__item segmented__item--active" : "segmented__item"}
                  onClick={() => setDisplayPreference("list")}
                  type="button"
                >
                  List
                </button>
              </div>
              <Mono faded>
                {loadingWorkspace
                  ? "Loading board"
                  : `${tasks.length} tasks · ${columns.length} columns · ${tasks.filter((task) => task.completedAt).length} done`}
              </Mono>
              <span className="subtoolbar__spacer" />
              <span className="toolbar-label">Sort</span>
              <select
                aria-label="Sort tasks"
                className="small-select"
                onChange={(event) => setSortKey(event.target.value as BoardSortKey)}
                value={sortKey}
              >
                {boardSortOptions.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </div>
            {loadingWorkspace ? (
              <BoardColumnsSkeleton />
            ) : displayMode === "list" ? (
              <BoardTaskList
                activeTaskId={activeTaskId}
                columnsById={columnsById}
                onOpenTask={onOpenTask}
                tasks={sortedTasks}
              />
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
              onDeleteTaskAttachment={onDeleteTaskAttachment}
              onMoveTask={onMoveTask}
              onPostComment={onPostComment}
              onTaskDraftChange={onTaskDraftChange}
              onUpdateTask={onUpdateTask}
              onUploadTaskAttachment={onUploadTaskAttachment}
            />
          )}
        </div>
      )}
    </>
  );
}

function BoardTaskList({
  activeTaskId,
  columnsById,
  onOpenTask,
  tasks,
}: {
  activeTaskId: string | null;
  columnsById: Map<string, BoardColumn>;
  onOpenTask: (taskId: string) => void;
  tasks: Task[];
}) {
  if (tasks.length === 0) {
    return <div className="board-list-empty">No tasks</div>;
  }

  return (
    <div className="board-list" role="region" aria-label="Board task list">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Priority</th>
            <th>ID</th>
            <th>Title</th>
            <th>Labels</th>
            <th>Created</th>
            <th>Updated</th>
            <th>Done</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const column = columnsById.get(task.columnId);
            const status = columnStatus(column);
            return (
              <tr
                className={task.id === activeTaskId ? "board-list__row board-list__row--active" : "board-list__row"}
                key={task.id}
                onClick={() => onOpenTask(task.id)}
                onKeyDown={(event: ReactKeyboardEvent<HTMLTableRowElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenTask(task.id);
                  }
                }}
                tabIndex={0}
              >
                <td>
                  <span className="board-list__status">
                    <StatusIcon status={status} size={12} />
                    {column?.name ?? "Unknown"}
                  </span>
                </td>
                <td><PriorityFlag priority={task.priority} /></td>
                <td><Mono faded>{task.id}</Mono></td>
                <td className="board-list__title">{task.title}</td>
                <td>
                  <span className="board-list__labels">
                    {task.labels.slice(0, 3).map((label) => (
                      <LabelChip key={label} label={label} />
                    ))}
                  </span>
                </td>
                <td>{formatDate(task.createdAt)}</td>
                <td>{formatDate(task.updatedAt)}</td>
                <td>{task.completedAt ? <StatusIcon status="done" size={12} /> : <span className="board-list__dash">-</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
