import type { DatabaseClient } from "../db/client.js";
import { BoardService } from "./board-service.js";
import { CommentService } from "./comment-service.js";
import { ProjectService } from "./project-service.js";
import { TaskService } from "./task-service.js";

export interface ApiServices {
  projects: ProjectService;
  boards: BoardService;
  tasks: TaskService;
  comments: CommentService;
}

export function createServices(databaseClient: DatabaseClient): ApiServices {
  const projects = new ProjectService(databaseClient);
  const boards = new BoardService(databaseClient, projects);
  const tasks = new TaskService(databaseClient, projects, boards);
  const comments = new CommentService(databaseClient, projects, boards, tasks);

  return { projects, boards, tasks, comments };
}
