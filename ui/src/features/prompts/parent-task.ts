import type { Task } from "../../domain/types";

export type ParentTaskSource = "metadata" | "umbrella-line" | "description-id";

export interface ParentTaskReference {
  taskId: string;
  source: ParentTaskSource;
}

const taskIdPattern = /\bid=([A-Za-z0-9_-]+)/;
const taskIdShape = /^[A-Za-z0-9_-]+$/;

// Metadata keys that have been used for the same "this task's parent" idea.
// `parentTaskId` is the documented key (see skills/tasks-management/SKILL.md);
// the others are accepted so tasks created before it was documented still
// resolve.
const parentMetadataKeys = [
  "parentTaskId",
  "parentTask",
  "umbrellaTaskId",
  "umbrella",
];

// Heuristic cascade for resolving a task's parent/umbrella task without a
// schema change: explicit metadata wins, then a description line that
// mentions "umbrella" alongside an id=... reference, then the first id=...
// reference anywhere in the description.
export function resolveParentTaskId(
  task: Pick<Task, "id" | "description" | "metadata">,
): ParentTaskReference | null {
  for (const key of parentMetadataKeys) {
    const value = task.metadata?.[key];
    if (typeof value !== "string") {
      continue;
    }
    // A value that is not shaped like a task id (a title, a flag) would only
    // produce a nonsense reference, so fall through to the description.
    const candidate = value.trim();
    if (candidate && candidate !== task.id && taskIdShape.test(candidate)) {
      return { taskId: candidate, source: "metadata" };
    }
  }

  const description = task.description ?? "";

  for (const line of description.split("\n")) {
    if (!/umbrella/i.test(line)) {
      continue;
    }
    const match = taskIdPattern.exec(line);
    if (match && match[1] !== task.id) {
      return { taskId: match[1], source: "umbrella-line" };
    }
  }

  for (const match of description.matchAll(new RegExp(taskIdPattern, "g"))) {
    if (match[1] !== task.id) {
      return { taskId: match[1], source: "description-id" };
    }
  }

  return null;
}
