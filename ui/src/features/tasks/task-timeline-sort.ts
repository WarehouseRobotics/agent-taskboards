import type { ActorType, TaskActivity, TaskComment } from "../../domain/types";

export type TaskTimelineSortOrder = "asc" | "desc";

export type TaskTimelineItem =
  | { kind: "comment"; id: string; at: string | null; authorType: ActorType; authorName: string | null; body: string }
  | { kind: "activity"; id: string; at: string | null; actorType: ActorType; actorName: string | null; summary: string; eventType: string };

const timelineSortOrderStorageKey = "taskboards.task.timelineSortOrder";

export function storedTaskTimelineSortOrder(): TaskTimelineSortOrder {
  if (typeof window === "undefined") {
    return "asc";
  }

  try {
    const stored = window.localStorage.getItem(timelineSortOrderStorageKey);
    return stored === "asc" || stored === "desc" ? stored : "asc";
  } catch {
    return "asc";
  }
}

export function persistTaskTimelineSortOrder(order: TaskTimelineSortOrder) {
  try {
    window.localStorage.setItem(timelineSortOrderStorageKey, order);
  } catch {
    // Preference persistence should never block the task UI.
  }
}

export function mergeTaskTimeline(
  comments: TaskComment[],
  activity: TaskActivity[],
  order: TaskTimelineSortOrder,
): TaskTimelineItem[] {
  const direction = order === "asc" ? 1 : -1;

  return [
    ...comments.map((comment) => ({
      kind: "comment" as const,
      id: comment.id,
      at: comment.createdAt,
      authorType: comment.authorType,
      authorName: comment.authorName,
      body: comment.body,
    })),
    ...activity.map((item) => ({
      kind: "activity" as const,
      id: item.id,
      at: item.createdAt,
      actorType: item.actorType,
      actorName: item.actorName,
      summary: item.summary,
      eventType: item.eventType,
    })),
  ].sort((a, b) => direction * (new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime()));
}
