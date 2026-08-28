import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { DatabaseClient } from "../db/client.js";
import {
  boardColumns,
  taskAttachments,
  taskComments,
  searchDocuments,
  type BoardColumn,
  taskActivity,
  tasks,
} from "../db/schema.js";
import { ApiError } from "../http/errors.js";
import type {
  TaskCreateInput,
  TaskMoveInput,
  TaskUpdateInput,
} from "../models/request-schemas.js";
import { runBestEffortIndex } from "./best-effort-index.js";
import type { BoardService } from "./board-service.js";
import type { ProjectService } from "./project-service.js";
import type { SearchService } from "./search-service.js";
import {
  createHumanizedTaskId,
  generateTaskIdSuffix,
  TASK_ID_RETRY_LIMIT,
  type TaskIdSuffixGenerator,
} from "./task-id.js";

export type TaskServiceOptions = {
  taskIdSuffixGenerator?: TaskIdSuffixGenerator;
};

export class TaskService {
  private readonly db: DatabaseClient["db"];
  private readonly sqlite: DatabaseClient["sqlite"];
  private readonly taskIdSuffixGenerator: TaskIdSuffixGenerator;

  constructor(
    databaseClient: DatabaseClient,
    private readonly projectService: ProjectService,
    private readonly boardService: BoardService,
    private readonly searchService: SearchService,
    options: TaskServiceOptions = {},
  ) {
    this.db = databaseClient.db;
    this.sqlite = databaseClient.sqlite;
    this.taskIdSuffixGenerator =
      options.taskIdSuffixGenerator ?? generateTaskIdSuffix;
  }

  listBoardTasks(projectId: string, boardId: string, includeArchived: boolean) {
    this.projectService.getProject(projectId, includeArchived);
    const board = this.boardService.getBoard(
      projectId,
      boardId,
      includeArchived,
    );

    const taskRows = includeArchived
      ? this.db
          .select()
          .from(tasks)
          .where(eq(tasks.boardId, board.id))
          .orderBy(
            asc(tasks.columnId),
            asc(tasks.position),
            asc(tasks.createdAt),
          )
          .all()
      : this.db
          .select()
          .from(tasks)
          .where(and(eq(tasks.boardId, board.id), isNull(tasks.archivedAt)))
          .orderBy(
            asc(tasks.columnId),
            asc(tasks.position),
            asc(tasks.createdAt),
          )
          .all();

    return { board, tasks: taskRows };
  }

  async createTask(projectId: string, boardId: string, input: TaskCreateInput) {
    const project = this.projectService.getProject(projectId, false);
    const board = this.boardService.getBoard(project.id, boardId, false);
    const column = this.resolveTaskColumn(board.id, {
      columnId: input.columnId,
      columnKey: input.columnKey,
    });
    const position = this.nextTaskPosition(board.id, column.id);
    const now = new Date();
    const taskId = this.createUniqueTaskId(input.title);

    const created = this.db.transaction((tx) => {
      const task = tx
        .insert(tasks)
        .values({
          id: taskId,
          projectId: project.id,
          boardId: board.id,
          columnId: column.id,
          title: input.title,
          description: input.description,
          position,
          priority: input.priority,
          labels: input.labels,
          externalReferences: input.externalReferences,
          metadata: input.metadata,
          completedAt: column.isDone ? now : undefined,
        })
        .returning()
        .get();

      const activity = tx
        .insert(taskActivity)
        .values({
          projectId: project.id,
          boardId: board.id,
          taskId: task.id,
          eventType: "task.created",
          summary: "Task was created",
          data: {
            columnId: column.id,
            columnKey: column.key,
            position,
          },
        })
        .returning()
        .get();

      return { task, activity };
    });

    await runBestEffortIndex(
      { sourceType: "task", sourceId: created.task.id },
      () => this.searchService.indexTask(created.task),
    );
    return created;
  }

  getTask(taskId: string, includeArchived: boolean) {
    const task = includeArchived
      ? this.db.select().from(tasks).where(eq(tasks.id, taskId)).get()
      : this.db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, taskId), isNull(tasks.archivedAt)))
          .get();

    if (!task) {
      throw new ApiError(404, "not_found", "Task not found");
    }

    return task;
  }

  async updateTask(taskId: string, input: TaskUpdateInput) {
    const task = this.getTask(taskId, false);

    const updated = this.db.transaction((tx) => {
      const nextTask = tx
        .update(tasks)
        .set(input)
        .where(eq(tasks.id, task.id))
        .returning()
        .get();

      const activity = tx
        .insert(taskActivity)
        .values({
          projectId: task.projectId,
          boardId: task.boardId,
          taskId: task.id,
          eventType: "task.updated",
          summary: "Task was updated",
          data: { fields: Object.keys(input) },
        })
        .returning()
        .get();

      return { task: nextTask, activity };
    });

    await runBestEffortIndex(
      { sourceType: "task", sourceId: updated.task.id },
      () => this.searchService.indexTask(updated.task),
    );
    return updated;
  }

  moveTask(taskId: string, input: TaskMoveInput) {
    const task = this.getTask(taskId, false);
    const sourceColumn = this.db
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.id, task.columnId))
      .get();

    if (!sourceColumn) {
      throw new ApiError(
        409,
        "invalid_state",
        "Task source column no longer exists",
      );
    }

    const targetBoardId = input.boardId
      ? this.boardService.getBoard(task.projectId, input.boardId, false).id
      : task.boardId;
    const targetColumn = input.columnId || input.columnKey
      ? this.resolveTaskColumn(targetBoardId, {
          columnId: input.columnId,
          columnKey: input.columnKey,
        })
      : this.resolveTaskColumnForBoardMove(targetBoardId, sourceColumn.key);
    const changesBoard = targetBoardId !== task.boardId;

    return this.db.transaction((tx) => {
      const destinationTasks = tx
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.boardId, targetBoardId),
            eq(tasks.columnId, targetColumn.id),
            isNull(tasks.archivedAt),
            ne(tasks.id, task.id),
          ),
        )
        .orderBy(asc(tasks.position), asc(tasks.createdAt))
        .all();

      const position =
        input.position === undefined
          ? destinationTasks.length
          : Math.min(input.position, destinationTasks.length);
      const destinationTaskIds = destinationTasks.map((item) => item.id);
      destinationTaskIds.splice(position, 0, task.id);

      if (changesBoard || sourceColumn.id !== targetColumn.id) {
        const sourceTasks = tx
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.boardId, task.boardId),
              eq(tasks.columnId, sourceColumn.id),
              isNull(tasks.archivedAt),
              ne(tasks.id, task.id),
            ),
          )
          .orderBy(asc(tasks.position), asc(tasks.createdAt))
          .all();

        for (const [index, sourceTask] of sourceTasks.entries()) {
          tx.update(tasks)
            .set({ position: index })
            .where(eq(tasks.id, sourceTask.id))
            .run();
        }
      }

      const completedAt = targetColumn.isDone
        ? (task.completedAt ?? new Date())
        : null;

      for (const [index, movedTaskId] of destinationTaskIds.entries()) {
        if (movedTaskId === task.id) {
          tx.update(tasks)
            .set({
              columnId: targetColumn.id,
              boardId: targetBoardId,
              position: index,
              completedAt,
            })
            .where(eq(tasks.id, task.id))
            .run();
          continue;
        }

        tx.update(tasks)
          .set({ position: index })
          .where(eq(tasks.id, movedTaskId))
          .run();
      }

      if (changesBoard) {
        tx.update(taskComments)
          .set({ boardId: targetBoardId })
          .where(eq(taskComments.taskId, task.id))
          .run();
        tx.update(taskActivity)
          .set({ boardId: targetBoardId })
          .where(eq(taskActivity.taskId, task.id))
          .run();
        tx.update(taskAttachments)
          .set({ boardId: targetBoardId })
          .where(eq(taskAttachments.taskId, task.id))
          .run();
        tx.update(searchDocuments)
          .set({ boardId: targetBoardId })
          .where(eq(searchDocuments.taskId, task.id))
          .run();
        this.moveTaskSearchVectors(task.id, targetBoardId);
      }

      const nextTask = tx
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.id))
        .get();

      if (!nextTask) {
        throw new ApiError(404, "not_found", "Task not found");
      }

      const activity = tx
        .insert(taskActivity)
        .values({
          projectId: task.projectId,
          boardId: targetBoardId,
          taskId: task.id,
          eventType: "task.moved",
          summary: changesBoard
            ? `Task moved to another board in ${targetColumn.name}`
            : `Task moved to ${targetColumn.name}`,
          data: {
            fromBoardId: task.boardId,
            fromColumnId: sourceColumn.id,
            fromColumnKey: sourceColumn.key,
            toBoardId: targetBoardId,
            toColumnId: targetColumn.id,
            toColumnKey: targetColumn.key,
            position,
          },
        })
        .returning()
        .get();

      return { task: nextTask, activity };
    });
  }

  completeTask(taskId: string) {
    const task = this.getTask(taskId, false);
    const completedAt = task.completedAt ?? new Date();

    return this.db.transaction((tx) => {
      const nextTask = tx
        .update(tasks)
        .set({ completedAt })
        .where(eq(tasks.id, task.id))
        .returning()
        .get();

      const activity = tx
        .insert(taskActivity)
        .values({
          projectId: task.projectId,
          boardId: task.boardId,
          taskId: task.id,
          eventType: "task.completed",
          summary: "Task was completed",
          data: { completedAt: completedAt.toISOString() },
        })
        .returning()
        .get();

      return { task: nextTask, activity };
    });
  }

  archiveTask(taskId: string) {
    const task = this.getTask(taskId, false);
    const archivedAt = new Date();

    return this.db.transaction((tx) => {
      const nextTask = tx
        .update(tasks)
        .set({ archivedAt })
        .where(eq(tasks.id, task.id))
        .returning()
        .get();

      const activity = tx
        .insert(taskActivity)
        .values({
          projectId: task.projectId,
          boardId: task.boardId,
          taskId: task.id,
          eventType: "task.archived",
          summary: "Task was archived",
          data: { archivedAt: archivedAt.toISOString() },
        })
        .returning()
        .get();

      tx.delete(searchDocuments)
        .where(eq(searchDocuments.taskId, task.id))
        .run();

      return { task: nextTask, activity };
    });
  }

  resolveTaskColumn(
    boardId: string,
    value: { columnId?: string; columnKey?: string },
  ) {
    let column: BoardColumn | undefined;

    if (value.columnId) {
      column = this.db
        .select()
        .from(boardColumns)
        .where(
          and(
            eq(boardColumns.id, value.columnId),
            eq(boardColumns.boardId, boardId),
          ),
        )
        .get();
    } else if (value.columnKey) {
      column = this.db
        .select()
        .from(boardColumns)
        .where(
          and(
            eq(boardColumns.key, value.columnKey),
            eq(boardColumns.boardId, boardId),
          ),
        )
        .get();
    } else {
      column = this.db
        .select()
        .from(boardColumns)
        .where(eq(boardColumns.boardId, boardId))
        .orderBy(asc(boardColumns.position))
        .get();
    }

    if (!column) {
      throw new ApiError(404, "not_found", "Board column not found");
    }

    return column;
  }

  private resolveTaskColumnForBoardMove(boardId: string, sourceColumnKey: string) {
    const matchingColumn = this.db
      .select()
      .from(boardColumns)
      .where(
        and(
          eq(boardColumns.boardId, boardId),
          eq(boardColumns.key, sourceColumnKey),
        ),
      )
      .get();

    return matchingColumn ?? this.resolveTaskColumn(boardId, {});
  }

  private moveTaskSearchVectors(taskId: string, boardId: string) {
    const vectors = this.sqlite
      .prepare(
        `SELECT project_id, task_id, source_type, search_document_id, embedding
         FROM search_document_vectors
         WHERE task_id = ?`,
      )
      .all(taskId) as Array<{
        project_id: string;
        task_id: string;
        source_type: string;
        search_document_id: string;
        embedding: Buffer;
      }>;

    for (const vector of vectors) {
      this.sqlite
        .prepare("DELETE FROM search_document_vectors WHERE search_document_id = ?")
        .run(vector.search_document_id);
      this.sqlite
        .prepare(
          `INSERT INTO search_document_vectors (
             project_id, board_id, task_id, source_type,
             search_document_id, embedding
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          vector.project_id,
          boardId,
          vector.task_id,
          vector.source_type,
          vector.search_document_id,
          vector.embedding,
        );
    }
  }

  private nextTaskPosition(boardId: string, columnId: string) {
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.boardId, boardId),
          eq(tasks.columnId, columnId),
          isNull(tasks.archivedAt),
        ),
      )
      .all().length;
  }

  private createUniqueTaskId(title: string) {
    for (let attempt = 0; attempt < TASK_ID_RETRY_LIMIT; attempt += 1) {
      const taskId = createHumanizedTaskId(title, this.taskIdSuffixGenerator);
      const existing = this.db
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .get();

      if (!existing) {
        return taskId;
      }
    }

    throw new ApiError(
      500,
      "internal_error",
      "Unable to generate unique task ID",
    );
  }
}
