import type { Task } from "../../domain/types";

export type TaskMovePlan = {
  taskId: string;
  input: {
    columnId: string;
    position?: number;
  };
};

export function toggleTaskSelection(selectedTaskIds: Iterable<string>, taskId: string) {
  const nextSelection = new Set(selectedTaskIds);
  if (nextSelection.has(taskId)) {
    nextSelection.delete(taskId);
    return nextSelection;
  }

  nextSelection.add(taskId);
  return nextSelection;
}

export function selectTaskRange(
  selectedTaskIds: Iterable<string>,
  columnTasks: Task[],
  anchorTaskId: string | null,
  targetTaskId: string,
) {
  const nextSelection = new Set(selectedTaskIds);
  const targetIndex = columnTasks.findIndex((task) => task.id === targetTaskId);
  const anchorIndex = anchorTaskId
    ? columnTasks.findIndex((task) => task.id === anchorTaskId)
    : -1;

  if (targetIndex === -1 || anchorIndex === -1) {
    nextSelection.add(targetTaskId);
    return nextSelection;
  }

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  for (const task of columnTasks.slice(start, end + 1)) {
    nextSelection.add(task.id);
  }
  return nextSelection;
}

export function nextRangeSelectionAnchor(anchorTaskId: string | null, targetTaskId: string, range: boolean) {
  return range && anchorTaskId ? anchorTaskId : targetTaskId;
}

export function selectedTasksInVisibleOrder(tasks: Task[], selectedTaskIds: Iterable<string>) {
  const selected = new Set(selectedTaskIds);
  return tasks.filter((task) => selected.has(task.id));
}

// Drops name the card they landed on rather than a visible index, so the
// planner can tell direction and selection apart. A drop takes the target's
// slot: the server resolves `position` against the column with the moved task
// already taken out, so the target's index lands a card after the target when
// dragging down and before it when dragging up. No target appends.
//
// Same-column drops only reorder under manual (Position) sort. Under other
// sorts the visible index is not the stored order, so they do nothing.
export function planTaskDrop({
  draggedTaskId,
  manualOrder,
  selectedTaskIds,
  targetColumnId,
  targetTaskId,
  visibleTasks,
}: {
  draggedTaskId: string;
  manualOrder: boolean;
  selectedTaskIds: Iterable<string>;
  targetColumnId: string;
  targetTaskId?: string;
  visibleTasks: Task[];
}): TaskMovePlan[] {
  const selected = new Set(selectedTaskIds);
  const draggedTask = visibleTasks.find((task) => task.id === draggedTaskId);
  if (!draggedTask) {
    return [];
  }

  const columnTaskIds = visibleTasks
    .filter((task) => task.columnId === targetColumnId)
    .map((task) => task.id);
  const targetIndex = targetTaskId === undefined ? -1 : columnTaskIds.indexOf(targetTaskId);
  const targetPosition = targetIndex === -1 ? undefined : targetIndex;

  if (!selected.has(draggedTaskId)) {
    if (draggedTask.columnId === targetColumnId && !manualOrder) {
      return [];
    }
    return [movePlanForTask(draggedTaskId, targetColumnId, targetPosition)];
  }

  const selectedTasks = selectedTasksInVisibleOrder(visibleTasks, selected);
  if (selectedTasks.every((task) => task.columnId === targetColumnId)) {
    return manualOrder
      ? planBlockReorder(columnTaskIds, selected, draggedTaskId, targetColumnId, targetTaskId)
      : [];
  }

  return selectedTasks
    .filter((task) => task.columnId !== targetColumnId)
    .map((task, index) => movePlanForTask(
      task.id,
      targetColumnId,
      targetPosition === undefined ? undefined : targetPosition + index,
    ));
}

// Gathers the selected tasks of one column into a contiguous block that takes
// the target's slot, or goes to the end without a target. The moves are sent
// one at a time, so each position is resolved against the column as the
// server will see it after the previous moves: the first task goes right after
// the unselected task that precedes the block, every later one right after its
// predecessor. Moves that would leave a task in place are skipped.
function planBlockReorder(
  columnTaskIds: string[],
  selected: Set<string>,
  draggedTaskId: string,
  columnId: string,
  targetTaskId?: string,
): TaskMovePlan[] {
  const block = columnTaskIds.filter((id) => selected.has(id));
  const rest = columnTaskIds.filter((id) => !selected.has(id));

  let insertAt = rest.length;
  if (targetTaskId !== undefined && columnTaskIds.includes(targetTaskId)) {
    if (selected.has(targetTaskId)) {
      return [];
    }
    const draggingDown = columnTaskIds.indexOf(draggedTaskId) < columnTaskIds.indexOf(targetTaskId);
    insertAt = rest.indexOf(targetTaskId) + (draggingDown ? 1 : 0);
  }

  const moves: TaskMovePlan[] = [];
  let current = columnTaskIds;
  let previousId = insertAt === 0 ? undefined : rest[insertAt - 1];
  for (const taskId of block) {
    const others = current.filter((id) => id !== taskId);
    const position = previousId === undefined ? 0 : others.indexOf(previousId) + 1;
    if (current.indexOf(taskId) !== position) {
      moves.push(movePlanForTask(taskId, columnId, position));
      others.splice(position, 0, taskId);
      current = others;
    }
    previousId = taskId;
  }
  return moves;
}

function movePlanForTask(taskId: string, columnId: string, position?: number): TaskMovePlan {
  return {
    taskId,
    input: {
      columnId,
      ...(position === undefined ? {} : { position }),
    },
  };
}
