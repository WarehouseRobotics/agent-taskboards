import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { BoardColumn, Task } from "../../domain/types";
import { columnStatus } from "../../lib/task-display";
import {
  Icon,
  Kbd,
  LabelChip,
  Mono,
  PriorityFlag,
  StatusIcon,
} from "../../components/ui";
import {
  isArchiveMenuHotkey,
  isMoveToDoneMenuHotkey,
} from "./task-card-menu-hotkeys";

export function TaskCard({
  active,
  column,
  columns,
  index,
  onArchiveTask,
  onDropTask,
  onMoveTask,
  onOpenTask,
  onSelectTask,
  selected,
  task,
}: {
  active: boolean;
  column: BoardColumn;
  columns: BoardColumn[];
  index: number;
  onArchiveTask: (taskId: string) => Promise<void>;
  onDropTask: (taskId: string, columnId: string, position?: number) => Promise<void>;
  onMoveTask: (taskId: string, input: { columnId?: string; position?: number }) => Promise<void>;
  onOpenTask: (taskId: string) => void;
  onSelectTask: (taskId: string, columnId: string, range: boolean) => void;
  selected: boolean;
  task: Task;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const status = columnStatus(column);
  const columnIndex = columns.findIndex((item) => item.id === column.id);
  const doneColumn = columns.find((item) => item.isDone);
  const menuId = `task-menu-${task.id}`;
  const archiveDisabled = Boolean(task.archivedAt);
  const moveToDoneDisabled = !doneColumn;

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (isArchiveMenuHotkey(event, archiveDisabled)) {
        event.preventDefault();
        setMenuOpen(false);
        void onArchiveTask(task.id);
        return;
      }
      if (isMoveToDoneMenuHotkey(event, moveToDoneDisabled) && doneColumn) {
        event.preventDefault();
        setMenuOpen(false);
        void onMoveTask(task.id, { columnId: doneColumn.id });
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", handleMenuKeyDown);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", handleMenuKeyDown);
    };
  }, [
    archiveDisabled,
    doneColumn,
    menuOpen,
    moveToDoneDisabled,
    onArchiveTask,
    onMoveTask,
    task.id,
  ]);

  const moveAdjacent = (direction: -1 | 1) => {
    const nextColumn = columns[columnIndex + direction];
    if (nextColumn) {
      onMoveTask(task.id, { columnId: nextColumn.id });
    }
  };
  const closeAndRun = (action: () => void | Promise<void>) => {
    setMenuOpen(false);
    void action();
  };
  const selectFromGesture = (event: ReactMouseEvent<HTMLElement | HTMLInputElement>) => {
    onSelectTask(task.id, column.id, event.shiftKey);
  };
  const clickOpensTask = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.defaultPrevented) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      selectFromGesture(event);
      return;
    }
    onOpenTask(task.id);
  };
  const cardClassName = [
    "task-card",
    active ? "task-card--active" : null,
    selected ? "task-card--selected" : null,
    menuOpen ? "task-card--menu-open" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter") {
      if (menuOpen) {
        return;
      }
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
      className={cardClassName}
      draggable
      ref={cardRef}
      onContextMenu={(event) => {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          selectFromGesture(event);
          return;
        }
        setMenuOpen((current) => !current);
      }}
      onClick={clickOpensTask}
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
          void onDropTask(taskId, column.id, index);
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
        <input
          aria-label={`Select ${task.title}`}
          checked={selected}
          className="task-card__select"
          onClick={(event) => {
            event.stopPropagation();
            selectFromGesture(event);
          }}
          onChange={() => {
            // Selection is handled on click so Shift-click can use the native mouse event.
          }}
          type="checkbox"
        />
        <button
          aria-controls={menuOpen ? menuId : undefined}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="icon-btn"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((current) => !current);
          }}
          title="Task actions"
          type="button"
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
        <div className="task-card__menu" id={menuId} onClick={(event) => event.stopPropagation()} role="menu">
          <button
            disabled={columnIndex <= 0}
            onClick={() => closeAndRun(() => moveAdjacent(-1))}
            role="menuitem"
            type="button"
          >
            Move left
          </button>
          <button
            disabled={columnIndex >= columns.length - 1}
            onClick={() => closeAndRun(() => moveAdjacent(1))}
            role="menuitem"
            type="button"
          >
            Move right
          </button>
          <button
            disabled={moveToDoneDisabled}
            onClick={() => closeAndRun(() => doneColumn && onMoveTask(task.id, { columnId: doneColumn.id }))}
            role="menuitem"
            type="button"
          >
            <span>Move to done</span>
            <Kbd>D</Kbd>
          </button>
          <button
            className="danger-text"
            disabled={archiveDisabled}
            onClick={() => closeAndRun(() => onArchiveTask(task.id))}
            role="menuitem"
            type="button"
          >
            <span>Archive</span>
            <Kbd>A</Kbd>
          </button>
        </div>
      )}
    </article>
  );
}
