import { KeyboardEvent, useState } from "react";
import type { BoardColumn, Task } from "../../domain/types";
import { columnStatus } from "../../lib/task-display";
import { Icon, LabelChip, Mono, PriorityFlag, StatusIcon } from "../../components/ui";

export function TaskCard({
  active,
  column,
  columns,
  index,
  onArchiveTask,
  onMoveTask,
  onOpenTask,
  task,
}: {
  active: boolean;
  column: BoardColumn;
  columns: BoardColumn[];
  index: number;
  onArchiveTask: (taskId: string) => Promise<void>;
  onMoveTask: (taskId: string, input: { columnId?: string; position?: number }) => Promise<void>;
  onOpenTask: (taskId: string) => void;
  task: Task;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = columnStatus(column);
  const columnIndex = columns.findIndex((item) => item.id === column.id);
  const doneColumn = columns.find((item) => item.isDone);
  const moveAdjacent = (direction: -1 | 1) => {
    const nextColumn = columns[columnIndex + direction];
    if (nextColumn) {
      onMoveTask(task.id, { columnId: nextColumn.id });
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter") {
      onOpenTask(task.id);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveAdjacent(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveAdjacent(1);
    }
  };

  return (
    <article
      className={active ? "task-card task-card--active" : "task-card"}
      draggable
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen((current) => !current);
      }}
      onClick={() => onOpenTask(task.id)}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/task-id", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const taskId = event.dataTransfer.getData("text/task-id");
        if (taskId && taskId !== task.id) {
          onMoveTask(taskId, { columnId: column.id, position: index });
        }
      }}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <div className="task-card__meta">
        <PriorityFlag priority={task.priority} />
        <Mono faded>{task.id}</Mono>
        {task.completedAt && (
          <span className="task-card__done">
            <StatusIcon status="done" size={10} /> done
          </span>
        )}
        <span className="task-card__spacer" />
        <button
          className="icon-btn"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((current) => !current);
          }}
          title="Task actions"
        >
          <Icon name="more" strokeWidth={2.3} />
        </button>
      </div>
      <h3>{task.title}</h3>
      {(task.labels.length > 0 || status === "blocked") && (
        <div className="task-card__footer">
          {task.labels.slice(0, 3).map((label) => (
            <LabelChip key={label} label={label} />
          ))}
          <span className="task-card__spacer" />
          {status === "blocked" && <Mono>blocked</Mono>}
        </div>
      )}
      {menuOpen && (
        <div className="task-card__menu" onClick={(event) => event.stopPropagation()}>
          <button disabled={columnIndex <= 0} onClick={() => moveAdjacent(-1)}>Move left</button>
          <button disabled={columnIndex >= columns.length - 1} onClick={() => moveAdjacent(1)}>Move right</button>
          <button disabled={!doneColumn} onClick={() => doneColumn && onMoveTask(task.id, { columnId: doneColumn.id })}>Move to done</button>
          <button className="danger-text" onClick={() => onArchiveTask(task.id)}>Archive</button>
        </div>
      )}
    </article>
  );
}
