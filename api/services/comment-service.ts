import { asc, eq } from "drizzle-orm";
import type { DatabaseClient } from "../db/client.js";
import { taskActivity, taskComments } from "../db/schema.js";
import type { CommentCreateInput } from "../models/request-schemas.js";
import type { BoardService } from "./board-service.js";
import type { ProjectService } from "./project-service.js";
import type { TaskService } from "./task-service.js";

export class CommentService {
  private readonly db: DatabaseClient["db"];

  constructor(
    databaseClient: DatabaseClient,
    private readonly projectService: ProjectService,
    private readonly boardService: BoardService,
    private readonly taskService: TaskService,
  ) {
    this.db = databaseClient.db;
  }

  listTaskComments(taskId: string) {
    this.taskService.getTask(taskId, true);
    return this.db
      .select()
      .from(taskComments)
      .where(eq(taskComments.taskId, taskId))
      .orderBy(asc(taskComments.createdAt))
      .all();
  }

  createComment(taskId: string, input: CommentCreateInput) {
    const task = this.taskService.getTask(taskId, false);

    return this.db.transaction((tx) => {
      const comment = tx
        .insert(taskComments)
        .values({
          projectId: task.projectId,
          boardId: task.boardId,
          taskId: task.id,
          authorType: input.authorType,
          authorName: input.authorName,
          authorRef: input.authorRef,
          body: input.body,
          metadata: input.metadata,
        })
        .returning()
        .get();

      const activity = tx
        .insert(taskActivity)
        .values({
          projectId: task.projectId,
          boardId: task.boardId,
          taskId: task.id,
          eventType: "comment.created",
          summary: "Comment was added",
          data: {
            commentId: comment.id,
            authorType: comment.authorType,
          },
        })
        .returning()
        .get();

      return { comment, activity };
    });
  }

  listTaskActivity(taskId: string) {
    this.taskService.getTask(taskId, true);
    return this.db
      .select()
      .from(taskActivity)
      .where(eq(taskActivity.taskId, taskId))
      .orderBy(asc(taskActivity.createdAt))
      .all();
  }

  getTaskContext(taskId: string) {
    const task = this.taskService.getTask(taskId, true);
    const project = this.projectService.getProject(task.projectId, true);
    const board = this.boardService.getBoard(task.projectId, task.boardId, true);
    const columns = this.boardService.listBoardColumns(board.id);
    const comments = this.listTaskComments(task.id);
    const activity = this.listTaskActivity(task.id);

    return { project, board, columns, task, comments, activity };
  }
}
