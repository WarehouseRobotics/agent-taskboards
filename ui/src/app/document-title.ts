import type { Board, Project, Task } from "../domain/types";
import type { AppRoute } from "./router";

export const defaultDocumentTitle = "Agent Taskboards";

export function documentTitleForRoute({
  board,
  project,
  route,
  task,
}: {
  board: Pick<Board, "name"> | null;
  project: Pick<Project, "name"> | null;
  route: AppRoute;
  task: Pick<Task, "title"> | null;
}) {
  if (route.view !== "board" || !project || !board) {
    return defaultDocumentTitle;
  }

  const boardTitle = `${project.name} / ${board.name}`;
  if (!route.taskId) {
    return boardTitle;
  }

  return task ? `${board.name} / ${task.title}` : boardTitle;
}
