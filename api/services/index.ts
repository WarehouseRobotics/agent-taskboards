import { AttachmentService } from "./attachment-service.js";
import { ActivityService } from "./activity-service.js";
import type { DatabaseClient } from "../db/client.js";
import { BoardService } from "./board-service.js";
import { CommentService } from "./comment-service.js";
import { ProjectService } from "./project-service.js";
import { SearchService, type EmbeddingModel } from "./search-service.js";
import { TaskService } from "./task-service.js";

export interface ApiServices {
  projects: ProjectService;
  boards: BoardService;
  tasks: TaskService;
  comments: CommentService;
  attachments: AttachmentService;
  activity: ActivityService;
  search: SearchService;
}

export type CreateServicesOptions = {
  embeddingModel?: EmbeddingModel;
};

export function createServices(
  databaseClient: DatabaseClient,
  options: CreateServicesOptions = {},
): ApiServices {
  const search = new SearchService(databaseClient, options.embeddingModel);
  const projects = new ProjectService(databaseClient);
  const boards = new BoardService(databaseClient, projects, search);
  const tasks = new TaskService(databaseClient, projects, boards, search);
  const attachments = new AttachmentService(databaseClient, tasks);
  const activity = new ActivityService(databaseClient, projects);
  const comments = new CommentService(
    databaseClient,
    projects,
    boards,
    tasks,
    search,
  );

  return { projects, boards, tasks, comments, attachments, activity, search };
}
