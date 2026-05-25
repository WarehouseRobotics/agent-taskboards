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

export function planTaskDrop({
  draggedTaskId,
  selectedTaskIds,
  targetColumnId,
  targetPosition,
  visibleTasks,
}: {
  draggedTaskId: string;
  selectedTaskIds: Iterable<string>;
  targetColumnId: string;
  targetPosition?: number;
  visibleTasks: Task[];
}): TaskMovePlan[] {
  const selected = new Set(selectedTaskIds);
  const draggedTask = visibleTasks.find((task) => task.id === draggedTaskId);
  if (!draggedTask) {
    return [];
  }

  if (!selected.has(draggedTaskId)) {
    return [movePlanForTask(draggedTaskId, targetColumnId, targetPosition)];
  }

  return selectedTasksInVisibleOrder(visibleTasks, selected)
    .filter((task) => task.columnId !== targetColumnId)
    .map((task, index) => movePlanForTask(
      task.id,
      targetColumnId,
      targetPosition === undefined ? undefined : targetPosition + index,
    ));
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
