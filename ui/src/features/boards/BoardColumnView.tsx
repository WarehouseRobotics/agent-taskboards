import type { BoardColumn, Task, TaskPriority } from "../../domain/types";
import { columnStatus } from "../../lib/task-display";
import { Icon, Mono, StatusIcon } from "../../components/ui";
import { CreateTaskForm } from "./CreateTaskForm";
import { TaskCard } from "./TaskCard";

export function BoardColumnView({
  activeTaskId,
  column,
  isCreating,
  onArchiveTask,
  onCreateTask,
  onMoveTask,
  onOpenCreateTask,
  onOpenTask,
  tasks,
  totalColumns,
}: {
  activeTaskId: string | null;
  column: BoardColumn;
  isCreating: boolean;
  onArchiveTask: (taskId: string) => Promise<void>;
  onCreateTask: (input: { title: string; description?: string | null; columnId?: string; priority?: TaskPriority; labels?: string[] }) => Promise<void>;
  onMoveTask: (taskId: string, input: { columnId?: string; position?: number }) => Promise<void>;
  onOpenCreateTask: (columnId: string | null) => void;
  onOpenTask: (taskId: string) => void;
  tasks: Task[];
  totalColumns: BoardColumn[];
}) {
  const status = columnStatus(column);
  return (
    <section
      className="board-column"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const taskId = event.dataTransfer.getData("text/task-id");
        if (taskId) {
          onMoveTask(taskId, { columnId: column.id });
        }
      }}
    >
      <header className="board-column__header">
        <StatusIcon status={status} size={12} />
        <strong>{column.name}</strong>
        <Mono faded>{tasks.length}</Mono>
        <span className="board-column__spacer" />
        <button className="icon-btn" title="Add task" onClick={() => onOpenCreateTask(column.id)}>
          <Icon name="plus" />
        </button>
      </header>
      <div className="board-column__tasks">
        {tasks.map((task, index) => (
          <TaskCard
            active={task.id === activeTaskId}
            column={column}
            columns={totalColumns}
            index={index}
            key={task.id}
            onArchiveTask={onArchiveTask}
            onMoveTask={onMoveTask}
            onOpenTask={onOpenTask}
            task={task}
          />
        ))}
        {tasks.length === 0 && <div className="column-empty">No tasks</div>}
        {isCreating ? (
          <CreateTaskForm
            columnId={column.id}
            onCancel={() => onOpenCreateTask(null)}
            onSubmit={onCreateTask}
          />
        ) : (
          <button className="new-task-button" onClick={() => onOpenCreateTask(column.id)}>
            <Icon name="plus" /> New task
          </button>
        )}
      </div>
    </section>
  );
}
