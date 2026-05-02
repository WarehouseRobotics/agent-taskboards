import type { BoardColumn, Task, TaskPriority } from "../../domain/types";

export type BoardDisplayMode = "board" | "list";

export type BoardSortKey = "position" | "priority" | "title" | "createdAt" | "updatedAt";

export const boardSortOptions = [
  { key: "position", label: "Position" },
  { key: "priority", label: "Priority" },
  { key: "title", label: "Title" },
  { key: "createdAt", label: "Created" },
  { key: "updatedAt", label: "Updated" },
] as const satisfies ReadonlyArray<{ key: BoardSortKey; label: string }>;

const boardDisplayModeStorageKey = "taskboards.board.displayMode";
const priorityRank = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
} as const satisfies Record<TaskPriority, number>;
const titleCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function storedBoardDisplayMode(): BoardDisplayMode {
  if (typeof window === "undefined") {
    return "board";
  }

  try {
    const stored = window.localStorage.getItem(boardDisplayModeStorageKey);
    return stored === "list" || stored === "board" ? stored : "board";
  } catch {
    return "board";
  }
}

export function persistBoardDisplayMode(mode: BoardDisplayMode) {
  try {
    window.localStorage.setItem(boardDisplayModeStorageKey, mode);
  } catch {
    // Preference persistence should never block the board UI.
  }
}

export function sortBoardTasks(tasks: Task[], columns: BoardColumn[], sortKey: BoardSortKey): Task[] {
  const columnPositions = new Map(columns.map((column, index) => [column.id, column.position ?? index]));
  return [...tasks].sort((a, b) => compareTasks(a, b, columnPositions, sortKey));
}

function compareTasks(
  a: Task,
  b: Task,
  columnPositions: Map<string, number>,
  sortKey: BoardSortKey,
) {
  const primary = compareTaskPrimary(a, b, columnPositions, sortKey);
  if (primary !== 0) {
    return primary;
  }

  const position = compareTaskPosition(a, b, columnPositions);
  if (position !== 0) {
    return position;
  }

  return a.id.localeCompare(b.id);
}

function compareTaskPrimary(
  a: Task,
  b: Task,
  columnPositions: Map<string, number>,
  sortKey: BoardSortKey,
) {
  if (sortKey === "position") {
    return compareTaskPosition(a, b, columnPositions);
  }
  if (sortKey === "priority") {
    return priorityRank[a.priority] - priorityRank[b.priority];
  }
  if (sortKey === "title") {
    return titleCollator.compare(a.title, b.title);
  }
  if (sortKey === "createdAt") {
    return timestampForSort(b.createdAt) - timestampForSort(a.createdAt);
  }
  return timestampForSort(b.updatedAt) - timestampForSort(a.updatedAt);
}

function compareTaskPosition(a: Task, b: Task, columnPositions: Map<string, number>) {
  const column = (columnPositions.get(a.columnId) ?? Number.MAX_SAFE_INTEGER)
    - (columnPositions.get(b.columnId) ?? Number.MAX_SAFE_INTEGER);
  if (column !== 0) {
    return column;
  }
  return a.position - b.position;
}

function timestampForSort(value: string | null) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}
