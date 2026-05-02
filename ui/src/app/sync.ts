import type { Board, ProjectTreeItem, Task } from "../domain/types";

export const backgroundSyncIntervalMs = 10000;

type EditableTaskFields = Pick<Task, "description" | "labels" | "priority" | "title">;

export interface TaskDraftState {
  fields?: Partial<EditableTaskFields>;
  localModifiedAt: number;
}

export type TaskDraftsById = Record<string, TaskDraftState | undefined>;

export function mergeProjectTree(current: ProjectTreeItem[], incoming: ProjectTreeItem[]) {
  const currentByProjectId = new Map(current.map((item) => [item.project.id, item]));

  return incoming.map((item) => {
    const currentItem = currentByProjectId.get(item.project.id);
    return {
      ...item,
      boards: item.boards,
      taskCount: item.taskCount ?? currentItem?.taskCount ?? null,
    };
  });
}

export function mergeBoard(current: Board | null, incoming: Board, taskDrafts: TaskDraftsById = {}) {
  if (!current) {
    return incoming;
  }

  const currentTasksById = new Map((current.tasks ?? []).map((task) => [task.id, task]));
  const mergedTasks = (incoming.tasks ?? []).map((serverTask) => {
    const currentTask = currentTasksById.get(serverTask.id);
    return mergeTask(currentTask, serverTask, taskDrafts[serverTask.id]);
  });

  return {
    ...incoming,
    columns: incoming.columns,
    tasks: mergedTasks,
  };
}

export function mergeTask(current: Task | undefined, serverTask: Task, draft?: TaskDraftState) {
  if (!draft || !current) {
    return serverTask;
  }

  return {
    ...serverTask,
    ...draft.fields,
  };
}
