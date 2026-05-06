import { and, asc, eq } from "drizzle-orm";
import type { DatabaseClient } from "../db/client.js";
import { searchDocuments, taskActivity, taskComments } from "../db/schema.js";
import { ApiError } from "../http/errors.js";
import type { CommentCreateInput } from "../models/request-schemas.js";
import { runBestEffortIndex } from "./best-effort-index.js";
import type { BoardService } from "./board-service.js";
import type { ProjectService } from "./project-service.js";
import type { SearchService } from "./search-service.js";
import type { TaskService } from "./task-service.js";

export class CommentService {
  private readonly db: DatabaseClient["db"];

  constructor(
    databaseClient: DatabaseClient,
    private readonly projectService: ProjectService,
    private readonly boardService: BoardService,
    private readonly taskService: TaskService,
    private readonly searchService: SearchService,
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

  async createComment(taskId: string, input: CommentCreateInput) {
    const task = this.taskService.getTask(taskId, false);

    const created = this.db.transaction((tx) => {
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

    await runBestEffortIndex(
      { sourceType: "comment", sourceId: created.comment.id },
      () => this.searchService.indexComment(created.comment),
    );
    return created;
  }

  deleteComment(taskId: string, commentId: string) {
    const task = this.taskService.getTask(taskId, false);
    const comment = this.db
      .select()
      .from(taskComments)
      .where(
        and(eq(taskComments.id, commentId), eq(taskComments.taskId, task.id)),
      )
      .get();

    if (!comment) {
      throw new ApiError(404, "not_found", "Comment not found");
    }

    return this.db.transaction((tx) => {
      tx.delete(taskComments).where(eq(taskComments.id, comment.id)).run();

      tx.delete(searchDocuments)
        .where(
          and(
            eq(searchDocuments.sourceType, "comment"),
            eq(searchDocuments.sourceId, comment.id),
          ),
        )
        .run();

      const activity = tx
        .insert(taskActivity)
        .values({
          projectId: task.projectId,
          boardId: task.boardId,
          taskId: task.id,
          eventType: "comment.deleted",
          summary: "Comment was deleted",
          data: {
            commentId: comment.id,
            authorType: comment.authorType,
            authorName: comment.authorName,
            authorRef: comment.authorRef,
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
    const board = this.boardService.getBoard(
      task.projectId,
      task.boardId,
      true,
    );
    const columns = this.boardService.listBoardColumns(board.id);
    const comments = this.listTaskComments(task.id);
    const activity = this.listTaskActivity(task.id);

    return { project, board, columns, task, comments, activity };
  }
}
