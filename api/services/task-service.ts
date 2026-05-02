import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { DatabaseClient } from "../db/client.js";
import {
  boardColumns,
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

export class TaskService {
  private readonly db: DatabaseClient["db"];

  constructor(
    databaseClient: DatabaseClient,
    private readonly projectService: ProjectService,
    private readonly boardService: BoardService,
    private readonly searchService: SearchService,
  ) {
    this.db = databaseClient.db;
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

    const created = this.db.transaction((tx) => {
      const task = tx
        .insert(tasks)
        .values({
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
    const targetColumn = this.resolveTaskColumn(task.boardId, {
      columnId: input.columnId,
      columnKey: input.columnKey,
    });

    return this.db.transaction((tx) => {
      const sourceColumn = tx
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

      const destinationTasks = tx
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.boardId, task.boardId),
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

      if (sourceColumn.id !== targetColumn.id) {
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
          boardId: task.boardId,
          taskId: task.id,
          eventType: "task.moved",
          summary: `Task moved to ${targetColumn.name}`,
          data: {
            fromColumnId: sourceColumn.id,
            fromColumnKey: sourceColumn.key,
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
}
