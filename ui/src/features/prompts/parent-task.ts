import type { Task } from "../../domain/types";

export type ParentTaskSource = "metadata" | "umbrella-line" | "description-id";

export interface ParentTaskReference {
  taskId: string;
  source: ParentTaskSource;
}

const taskIdPattern = /\bid=([A-Za-z0-9_-]+)/;

// Heuristic cascade for resolving a task's parent/umbrella task without a
// schema change: explicit metadata wins, then a description line that
// mentions "umbrella" alongside an id=... reference, then the first id=...
// reference anywhere in the description.
export function resolveParentTaskId(
  task: Pick<Task, "id" | "description" | "metadata">,
): ParentTaskReference | null {
  const metadataParent = task.metadata?.["parentTaskId"];
  if (typeof metadataParent === "string" && metadataParent.trim() && metadataParent !== task.id) {
    return { taskId: metadataParent.trim(), source: "metadata" };
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
