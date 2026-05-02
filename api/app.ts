import { and, asc, eq, isNull, ne } from "drizzle-orm";
import express, {
  type ErrorRequestHandler,
  type Request,
} from "express";
import { z } from "zod";
import type { DatabaseClient } from "./db/client.js";
import type { MigrationResult } from "./db/migrate.js";
import {
  actorTypes,
  boardColumns,
  boards,
  type Board,
  type BoardColumn,
  type JsonArray,
  type JsonObject,
  projects,
  type Project,
  taskActivity,
  type Task,
  taskComments,
  type TaskActivity,
  type TaskComment,
  taskPriorities,
  tasks,
} from "./db/schema.js";

export interface CreateAppOptions {
  databaseClient: DatabaseClient;
  migrationResult: MigrationResult;
}

const defaultBoardColumns = [
  { key: "backlog", name: "Backlog", isDone: false },
  { key: "ready", name: "Ready", isDone: false },
  { key: "in_progress", name: "In Progress", isDone: false },
  { key: "blocked", name: "Blocked", isDone: false },
  { key: "review", name: "Review", isDone: false },
  { key: "done", name: "Done", isDone: true },
] as const;

const jsonObjectSchema = z.record(z.unknown());
const jsonArraySchema = z.array(z.unknown());
const requiredString = z.string().trim().min(1);
const nullableString = z.string().trim().min(1).nullable();

const includeArchivedQuerySchema = z.object({
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

const projectCreateSchema = z.object({
  name: requiredString,
  description: nullableString.optional(),
  repositoryPath: nullableString.optional(),
  defaultBranch: nullableString.optional(),
  metadata: jsonObjectSchema.optional(),
});

const projectUpdateSchema = projectCreateSchema.partial();

const boardColumnInputSchema = z.object({
  key: requiredString.regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: requiredString,
  isDone: z.boolean().optional(),
});

const boardCreateSchema = z
  .object({
    name: requiredString,
    description: nullableString.optional(),
    metadata: jsonObjectSchema.optional(),
    columns: z.array(boardColumnInputSchema).min(1).optional(),
  })
  .superRefine((value, context) => {
    if (!value.columns) {
      return;
    }

    const keys = new Set<string>();
    for (const [index, column] of value.columns.entries()) {
      if (keys.has(column.key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["columns", index, "key"],
          message: "Column keys must be unique within a board",
        });
      }

      keys.add(column.key);
    }
  });

const boardUpdateSchema = z.object({
  name: requiredString.optional(),
  description: nullableString.optional(),
  metadata: jsonObjectSchema.optional(),
});

const taskCreateSchema = z
  .object({
    title: requiredString,
    description: nullableString.optional(),
    columnId: requiredString.optional(),
    columnKey: requiredString.optional(),
    priority: z.enum(taskPriorities).optional(),
    labels: z.array(z.string().trim().min(1)).optional(),
    externalReferences: jsonArraySchema.optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .refine((value) => !(value.columnId && value.columnKey), {
    path: ["columnKey"],
    message: "Provide either columnId or columnKey, not both",
  });

const taskUpdateSchema = z.object({
  title: requiredString.optional(),
  description: nullableString.optional(),
  priority: z.enum(taskPriorities).optional(),
  labels: z.array(z.string().trim().min(1)).optional(),
  externalReferences: jsonArraySchema.optional(),
  metadata: jsonObjectSchema.optional(),
});

const taskMoveSchema = z
  .object({
    columnId: requiredString.optional(),
    columnKey: requiredString.optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((value) => value.columnId || value.columnKey, {
    path: ["columnId"],
    message: "Provide columnId or columnKey",
  })
  .refine((value) => !(value.columnId && value.columnKey), {
    path: ["columnKey"],
    message: "Provide either columnId or columnKey, not both",
  });

const commentCreateSchema = z.object({
  authorType: z.enum(actorTypes),
  authorName: nullableString.optional(),
  authorRef: nullableString.optional(),
  body: requiredString,
  metadata: jsonObjectSchema.optional(),
});

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: JsonObject = {},
  ) {
    super(message);
  }
}

export function createApp({
  databaseClient,
  migrationResult,
}: CreateAppOptions) {
  const app = express();
  const { db } = databaseClient;

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    try {
      databaseClient.sqlite.prepare("SELECT 1").get();
      res.json({
        ok: true,
        database: {
          ok: true,
          path: databaseClient.databasePath,
          migrations: migrationResult,
        },
      });
    } catch (error) {
      res.status(503).json({
        ok: false,
        database: {
          ok: false,
          error:
            error instanceof Error ? error.message : "Unknown database error",
        },
      });
    }
  });

  app.get("/api/projects", (req, res) => {
    const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
    const rows = includeArchived
      ? db.select().from(projects).orderBy(asc(projects.name)).all()
      : db
          .select()
          .from(projects)
          .where(isNull(projects.archivedAt))
          .orderBy(asc(projects.name))
          .all();

    res.json({ projects: rows.map(serializeProject) });
  });

  app.post("/api/projects", (req, res) => {
    const body = parseBody(req, projectCreateSchema);
    const project = db
      .insert(projects)
      .values({
        name: body.name,
        description: body.description,
        repositoryPath: body.repositoryPath,
        defaultBranch: body.defaultBranch,
        metadata: body.metadata,
      })
      .returning()
      .get();

    res.status(201).json({ project: serializeProject(project) });
  });

  app.get("/api/projects/:projectId", (req, res) => {
    const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
    const project = requireProject(req.params.projectId, includeArchived);
    res.json({ project: serializeProject(project) });
  });

  app.patch("/api/projects/:projectId", (req, res) => {
    requireProject(req.params.projectId, false);
    const body = parseNonEmptyBody(req, projectUpdateSchema);
    const project = db
      .update(projects)
      .set(body)
      .where(eq(projects.id, req.params.projectId))
      .returning()
      .get();

    res.json({ project: serializeProject(project) });
  });

  app.post("/api/projects/:projectId/archive", (req, res) => {
    requireProject(req.params.projectId, false);
    const project = db
      .update(projects)
      .set({ archivedAt: new Date() })
      .where(eq(projects.id, req.params.projectId))
      .returning()
      .get();

    res.json({ project: serializeProject(project) });
  });

  app.get("/api/projects/:projectId/boards", (req, res) => {
    const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
    requireProject(req.params.projectId, includeArchived);
    const rows = includeArchived
      ? db
          .select()
          .from(boards)
          .where(eq(boards.projectId, req.params.projectId))
          .orderBy(asc(boards.name))
          .all()
      : db
          .select()
          .from(boards)
          .where(
            and(
              eq(boards.projectId, req.params.projectId),
              isNull(boards.archivedAt),
            ),
          )
          .orderBy(asc(boards.name))
          .all();

    res.json({ boards: rows.map((board) => serializeBoard(board)) });
  });

  app.post("/api/projects/:projectId/boards", (req, res) => {
    const project = requireProject(req.params.projectId, false);
    const body = parseBody(req, boardCreateSchema);
    const inputColumns = body.columns ?? defaultBoardColumns;

    const created = db.transaction((tx) => {
      const board = tx
        .insert(boards)
        .values({
          projectId: project.id,
          name: body.name,
          description: body.description,
          metadata: body.metadata,
        })
        .returning()
        .get();

      const columns = inputColumns.map((column, position) =>
        tx
          .insert(boardColumns)
          .values({
            boardId: board.id,
            key: column.key,
            name: column.name,
            position,
            isDone: column.isDone ?? false,
          })
          .returning()
          .get(),
      );

      return { board, columns };
    });

    res.status(201).json({
      board: serializeBoard(created.board, { columns: created.columns }),
    });
  });

  app.get("/api/projects/:projectId/boards/:boardId", (req, res) => {
    const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
    requireProject(req.params.projectId, includeArchived);
    const board = requireBoard(
      req.params.projectId,
      req.params.boardId,
      includeArchived,
    );
    const columns = listBoardColumns(board.id);
    const includeTasks = req.query.includeTasks === "true";
    const taskRows = includeTasks ? listBoardTasks(board.id, includeArchived) : [];

    res.json({
      board: serializeBoard(board, {
        columns,
        tasks: includeTasks ? taskRows : undefined,
      }),
    });
  });

  app.patch("/api/projects/:projectId/boards/:boardId", (req, res) => {
    requireProject(req.params.projectId, false);
    requireBoard(req.params.projectId, req.params.boardId, false);
    const body = parseNonEmptyBody(req, boardUpdateSchema);
    const board = db
      .update(boards)
      .set(body)
      .where(eq(boards.id, req.params.boardId))
      .returning()
      .get();

    res.json({
      board: serializeBoard(board, { columns: listBoardColumns(board.id) }),
    });
  });

  app.post("/api/projects/:projectId/boards/:boardId/archive", (req, res) => {
    requireProject(req.params.projectId, false);
    requireBoard(req.params.projectId, req.params.boardId, false);
    const board = db
      .update(boards)
      .set({ archivedAt: new Date() })
      .where(eq(boards.id, req.params.boardId))
      .returning()
      .get();

    res.json({
      board: serializeBoard(board, { columns: listBoardColumns(board.id) }),
    });
  });

  app.get("/api/projects/:projectId/boards/:boardId/tasks", (req, res) => {
    const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
    requireProject(req.params.projectId, includeArchived);
    const board = requireBoard(
      req.params.projectId,
      req.params.boardId,
      includeArchived,
    );
    const rows = listBoardTasks(board.id, includeArchived);

    res.json({ tasks: rows.map(serializeTask) });
  });

  app.post("/api/projects/:projectId/boards/:boardId/tasks", (req, res) => {
    const project = requireProject(req.params.projectId, false);
    const board = requireBoard(project.id, req.params.boardId, false);
    const body = parseBody(req, taskCreateSchema);
    const column = resolveTaskColumn(board.id, {
      columnId: body.columnId,
      columnKey: body.columnKey,
    });
    const position = nextTaskPosition(board.id, column.id);
    const now = new Date();

    const created = db.transaction((tx) => {
      const task = tx
        .insert(tasks)
        .values({
          projectId: project.id,
          boardId: board.id,
          columnId: column.id,
          title: body.title,
          description: body.description,
          position,
          priority: body.priority,
          labels: body.labels,
          externalReferences: body.externalReferences,
          metadata: body.metadata,
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

    res.status(201).json({
      task: serializeTask(created.task),
      activity: serializeActivity(created.activity),
    });
  });

  app.get("/api/tasks/:taskId", (req, res) => {
    const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
    const task = requireTask(req.params.taskId, includeArchived);
    res.json({ task: serializeTask(task) });
  });

  app.patch("/api/tasks/:taskId", (req, res) => {
    const task = requireTask(req.params.taskId, false);
    const body = parseNonEmptyBody(req, taskUpdateSchema);

    const updated = db.transaction((tx) => {
      const nextTask = tx
        .update(tasks)
        .set(body)
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
          data: { fields: Object.keys(body) },
        })
        .returning()
        .get();

      return { task: nextTask, activity };
    });

    res.json({
      task: serializeTask(updated.task),
      activity: serializeActivity(updated.activity),
    });
  });

  app.post("/api/tasks/:taskId/move", (req, res) => {
    const task = requireTask(req.params.taskId, false);
    const body = parseBody(req, taskMoveSchema);
    const targetColumn = resolveTaskColumn(task.boardId, {
      columnId: body.columnId,
      columnKey: body.columnKey,
    });

    const moved = db.transaction((tx) => {
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
        body.position === undefined
          ? destinationTasks.length
          : Math.min(body.position, destinationTasks.length);
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

      for (const [index, taskId] of destinationTaskIds.entries()) {
        if (taskId === task.id) {
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
          .where(eq(tasks.id, taskId))
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

    res.json({
      task: serializeTask(moved.task),
      activity: serializeActivity(moved.activity),
    });
  });

  app.post("/api/tasks/:taskId/complete", (req, res) => {
    const task = requireTask(req.params.taskId, false);
    const completedAt = task.completedAt ?? new Date();

    const completed = db.transaction((tx) => {
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

    res.json({
      task: serializeTask(completed.task),
      activity: serializeActivity(completed.activity),
    });
  });

  app.post("/api/tasks/:taskId/archive", (req, res) => {
    const task = requireTask(req.params.taskId, false);
    const archivedAt = new Date();

    const archived = db.transaction((tx) => {
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

    res.json({
      task: serializeTask(archived.task),
      activity: serializeActivity(archived.activity),
    });
  });

  app.get("/api/tasks/:taskId/comments", (req, res) => {
    requireTask(req.params.taskId, true);
    const rows = db
      .select()
      .from(taskComments)
      .where(eq(taskComments.taskId, req.params.taskId))
      .orderBy(asc(taskComments.createdAt))
      .all();

    res.json({ comments: rows.map(serializeComment) });
  });

  app.post("/api/tasks/:taskId/comments", (req, res) => {
    const task = requireTask(req.params.taskId, false);
    const body = parseBody(req, commentCreateSchema);

    const created = db.transaction((tx) => {
      const comment = tx
        .insert(taskComments)
        .values({
          projectId: task.projectId,
          boardId: task.boardId,
          taskId: task.id,
          authorType: body.authorType,
          authorName: body.authorName,
          authorRef: body.authorRef,
          body: body.body,
          metadata: body.metadata,
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

    res.status(201).json({
      comment: serializeComment(created.comment),
      activity: serializeActivity(created.activity),
    });
  });

  app.get("/api/tasks/:taskId/activity", (req, res) => {
    requireTask(req.params.taskId, true);
    const rows = db
      .select()
      .from(taskActivity)
      .where(eq(taskActivity.taskId, req.params.taskId))
      .orderBy(asc(taskActivity.createdAt))
      .all();

    res.json({ activity: rows.map(serializeActivity) });
  });

  app.get("/api/tasks/:taskId/context", (req, res) => {
    const task = requireTask(req.params.taskId, true);
    const project = requireProject(task.projectId, true);
    const board = requireBoard(task.projectId, task.boardId, true);
    const columns = listBoardColumns(board.id);
    const comments = db
      .select()
      .from(taskComments)
      .where(eq(taskComments.taskId, task.id))
      .orderBy(asc(taskComments.createdAt))
      .all();
    const activity = db
      .select()
      .from(taskActivity)
      .where(eq(taskActivity.taskId, task.id))
      .orderBy(asc(taskActivity.createdAt))
      .all();

    res.json({
      project: serializeProject(project),
      board: serializeBoard(board, { columns }),
      task: serializeTask(task),
      comments: comments.map(serializeComment),
      activity: activity.map(serializeActivity),
    });
  });

  app.use(errorHandler);

  function requireProject(projectId: string, includeArchived: boolean) {
    const row = includeArchived
      ? db.select().from(projects).where(eq(projects.id, projectId)).get()
      : db
          .select()
          .from(projects)
          .where(and(eq(projects.id, projectId), isNull(projects.archivedAt)))
          .get();

    if (!row) {
      throw new ApiError(404, "not_found", "Project not found");
    }

    return row;
  }

  function requireBoard(
    projectId: string,
    boardId: string,
    includeArchived: boolean,
  ) {
    const row = includeArchived
      ? db
          .select()
          .from(boards)
          .where(and(eq(boards.id, boardId), eq(boards.projectId, projectId)))
          .get()
      : db
          .select()
          .from(boards)
          .where(
            and(
              eq(boards.id, boardId),
              eq(boards.projectId, projectId),
              isNull(boards.archivedAt),
            ),
          )
          .get();

    if (!row) {
      throw new ApiError(404, "not_found", "Board not found");
    }

    return row;
  }

  function requireTask(taskId: string, includeArchived: boolean) {
    const row = includeArchived
      ? db.select().from(tasks).where(eq(tasks.id, taskId)).get()
      : db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, taskId), isNull(tasks.archivedAt)))
          .get();

    if (!row) {
      throw new ApiError(404, "not_found", "Task not found");
    }

    return row;
  }

  function listBoardColumns(boardId: string) {
    return db
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.boardId, boardId))
      .orderBy(asc(boardColumns.position))
      .all();
  }

  function listBoardTasks(boardId: string, includeArchived: boolean) {
    return includeArchived
      ? db
          .select()
          .from(tasks)
          .where(eq(tasks.boardId, boardId))
          .orderBy(asc(tasks.columnId), asc(tasks.position), asc(tasks.createdAt))
          .all()
      : db
          .select()
          .from(tasks)
          .where(and(eq(tasks.boardId, boardId), isNull(tasks.archivedAt)))
          .orderBy(asc(tasks.columnId), asc(tasks.position), asc(tasks.createdAt))
          .all();
  }

  function resolveTaskColumn(
    boardId: string,
    value: { columnId?: string; columnKey?: string },
  ) {
    let column: BoardColumn | undefined;

    if (value.columnId) {
      column = db
        .select()
        .from(boardColumns)
        .where(
          and(eq(boardColumns.id, value.columnId), eq(boardColumns.boardId, boardId)),
        )
        .get();
    } else if (value.columnKey) {
      column = db
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
      column = db
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

  function nextTaskPosition(boardId: string, columnId: string) {
    return db
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

  return app;
}

function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T) {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new ApiError(400, "invalid_request", "Request body is invalid", {
      issues: result.error.issues,
    });
  }

  return result.data as z.infer<T>;
}

function parseNonEmptyBody<T extends z.ZodType<JsonObject>>(
  req: Request,
  schema: T,
) {
  const body = parseBody(req, schema);
  if (Object.keys(body).length === 0) {
    throw new ApiError(400, "invalid_request", "Request body cannot be empty");
  }

  return body;
}

function parseQuery<T extends z.ZodTypeAny>(req: Request, schema: T) {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw new ApiError(400, "invalid_request", "Query parameters are invalid", {
      issues: result.error.issues,
    });
  }

  return result.data as z.infer<T>;
}

function serializeProject(project: Project) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    repositoryPath: project.repositoryPath,
    defaultBranch: project.defaultBranch,
    metadata: project.metadata,
    archivedAt: serializeDate(project.archivedAt),
    createdAt: serializeDate(project.createdAt),
    updatedAt: serializeDate(project.updatedAt),
  };
}

function serializeBoard(
  board: Board,
  includes: { columns?: BoardColumn[]; tasks?: Task[] } = {},
) {
  return {
    id: board.id,
    projectId: board.projectId,
    name: board.name,
    description: board.description,
    metadata: board.metadata,
    archivedAt: serializeDate(board.archivedAt),
    createdAt: serializeDate(board.createdAt),
    updatedAt: serializeDate(board.updatedAt),
    ...(includes.columns
      ? { columns: includes.columns.map(serializeBoardColumn) }
      : {}),
    ...(includes.tasks ? { tasks: includes.tasks.map(serializeTask) } : {}),
  };
}

function serializeBoardColumn(column: BoardColumn) {
  return {
    id: column.id,
    boardId: column.boardId,
    key: column.key,
    name: column.name,
    position: column.position,
    isDone: column.isDone,
    createdAt: serializeDate(column.createdAt),
    updatedAt: serializeDate(column.updatedAt),
  };
}

function serializeTask(task: Task) {
  return {
    id: task.id,
    projectId: task.projectId,
    boardId: task.boardId,
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    position: task.position,
    priority: task.priority,
    labels: task.labels as string[],
    externalReferences: task.externalReferences as JsonArray,
    metadata: task.metadata,
    completedAt: serializeDate(task.completedAt),
    archivedAt: serializeDate(task.archivedAt),
    createdAt: serializeDate(task.createdAt),
    updatedAt: serializeDate(task.updatedAt),
  };
}

function serializeComment(comment: TaskComment) {
  return {
    id: comment.id,
    projectId: comment.projectId,
    boardId: comment.boardId,
    taskId: comment.taskId,
    authorType: comment.authorType,
    authorName: comment.authorName,
    authorRef: comment.authorRef,
    body: comment.body,
    metadata: comment.metadata,
    createdAt: serializeDate(comment.createdAt),
  };
}

function serializeActivity(activity: TaskActivity) {
  return {
    id: activity.id,
    projectId: activity.projectId,
    boardId: activity.boardId,
    taskId: activity.taskId,
    actorType: activity.actorType,
    actorName: activity.actorName,
    actorRef: activity.actorRef,
    eventType: activity.eventType,
    summary: activity.summary,
    data: activity.data,
    createdAt: serializeDate(activity.createdAt),
  };
}

function serializeDate(value: Date | null) {
  return value?.toISOString() ?? null;
}

const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  void next;

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Internal server error",
      details: {},
    },
  });
};
