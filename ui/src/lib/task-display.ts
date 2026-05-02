import type { BoardColumn, TaskPriority } from "../domain/types";

export type ColumnStatus = "backlog" | "ready" | "in-progress" | "blocked" | "review" | "done";

export function columnStatus(column: BoardColumn | undefined): ColumnStatus {
  if (!column) {
    return "backlog";
  }
  if (column.isDone) {
    return "done";
  }
  if (column.key === "in_progress" || column.key === "progress") {
    return "in-progress";
  }
  if (column.key === "ready" || column.key === "blocked" || column.key === "review") {
    return column.key;
  }
  return "backlog";
}

export function priorityToLevel(priority: TaskPriority) {
  const map = {
    urgent: "p0",
    high: "p1",
    normal: "p2",
    low: "p3",
  } as const satisfies Record<TaskPriority, "p0" | "p1" | "p2" | "p3">;
  return map[priority];
}

export function labelColor(label: string) {
  const colors = [
    "oklch(0.72 0.13 250)",
    "oklch(0.74 0.13 295)",
    "oklch(0.74 0.08 145)",
    "oklch(0.74 0.14 65)",
    "oklch(0.7 0.12 200)",
    "oklch(0.7 0.16 25)",
  ];
  let hash = 0;
  for (const char of label) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return colors[hash % colors.length];
}

export function glyphForName(name: string) {
  const parts = name.split(/[^a-z0-9]+/i).filter(Boolean);
  const text = (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
  return text || "PR";
}
