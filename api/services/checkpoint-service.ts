import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { DatabaseClient } from "../db/client.js";
import {
  boardCheckpoints,
  boardColumns,
  boards,
  searchDocuments,
  taskActivity,
  taskAttachments,
  taskComments,
  tasks,
  type Board,
  type BoardColumn,
  type JsonArray,
  type JsonObject,
  type Task,
  type TaskComment,
} from "../db/schema.js";
import { ApiError } from "../http/errors.js";
import type { CheckpointCreateInput } from "../models/request-schemas.js";
import { getUploadsPath } from "./attachment-service.js";
import { runBestEffortIndex } from "./best-effort-index.js";
import type { BoardService } from "./board-service.js";
import type { ProjectService } from "./project-service.js";
import type { SearchService } from "./search-service.js";

export const BOARD_CHECKPOINT_SNAPSHOT_VERSION = 1;

type CheckpointWarning = {
  type: string;
  message: string;
  attachmentId?: string;
  taskId?: string;
  relativePath?: string;
};

type RestoreIdMappings = Record<string, Record<string, string>>;

type SnapshotDate = string | null;

type BoardSnapshot = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  metadata: JsonObject;
  archivedAt: SnapshotDate;
  createdAt: string;
  updatedAt: string;
};

type ColumnSnapshot = {
  id: string;
  boardId: string;
  key: string;
  name: string;
  position: number;
  isDone: boolean;
  createdAt: string;
  updatedAt: string;
};

type TaskSnapshot = {
  id: string;
  projectId: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  position: number;
  priority: Task["priority"];
  labels: JsonArray;
  externalReferences: JsonArray;
  metadata: JsonObject;
  completedAt: SnapshotDate;
  archivedAt: SnapshotDate;
  createdAt: string;
  updatedAt: string;
};

type CommentSnapshot = {
  id: string;
  projectId: string;
  boardId: string;
  taskId: string;
  authorType: TaskComment["authorType"];
  authorName: string | null;
  authorRef: string | null;
  body: string;
  metadata: JsonObject;
  createdAt: string;
};

type ActivitySnapshot = {
  id: string;
  projectId: string;
  boardId: string;
  taskId: string;
  actorType: "human" | "agent" | "system";
  actorName: string | null;
  actorRef: string | null;
  eventType: string;
  summary: string;
  data: JsonObject;
  createdAt: string;
};

type AttachmentSnapshot = {
  id: string;
  projectId: string;
  boardId: string;
  taskId: string;
  relativePath: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

type BoardCheckpointSnapshot = {
  version: typeof BOARD_CHECKPOINT_SNAPSHOT_VERSION;
  projectId: string;
  boardId: string;
  board: BoardSnapshot;
  columns: ColumnSnapshot[];
  tasks: TaskSnapshot[];
  comments: CommentSnapshot[];
  activity: ActivitySnapshot[];
  attachments: AttachmentSnapshot[];
};

const actorSchema = z.enum(["human", "agent", "system"]);
const jsonObjectSchema = z.record(z.unknown());
const jsonArraySchema = z.array(z.unknown());
const nullableStringSchema = z.string().nullable();

const checkpointSnapshotSchema: z.ZodType<BoardCheckpointSnapshot> = z.object({
  version: z.literal(BOARD_CHECKPOINT_SNAPSHOT_VERSION),
  projectId: z.string().min(1),
  boardId: z.string().min(1),
  board: z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    name: z.string().min(1),
    description: nullableStringSchema,
    metadata: jsonObjectSchema,
    archivedAt: nullableStringSchema,
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  }),
  columns: z.array(
    z.object({
      id: z.string().min(1),
      boardId: z.string().min(1),
      key: z.string().min(1),
      name: z.string().min(1),
      position: z.number().int().min(0),
      isDone: z.boolean(),
      createdAt: z.string().min(1),
      updatedAt: z.string().min(1),
    }),
  ),
  tasks: z.array(
    z.object({
      id: z.string().min(1),
      projectId: z.string().min(1),
      boardId: z.string().min(1),
      columnId: z.string().min(1),
      title: z.string().min(1),
      description: nullableStringSchema,
      position: z.number().int().min(0),
      priority: z.enum(["low", "normal", "high", "urgent"]),
      labels: jsonArraySchema,
      externalReferences: jsonArraySchema,
      metadata: jsonObjectSchema,
      completedAt: nullableStringSchema,
      archivedAt: nullableStringSchema,
      createdAt: z.string().min(1),
      updatedAt: z.string().min(1),
    }),
  ),
  comments: z.array(
    z.object({
      id: z.string().min(1),
      projectId: z.string().min(1),
      boardId: z.string().min(1),
      taskId: z.string().min(1),
      authorType: actorSchema,
      authorName: nullableStringSchema,
      authorRef: nullableStringSchema,
      body: z.string().min(1),
      metadata: jsonObjectSchema,
      createdAt: z.string().min(1),
    }),
  ),
  activity: z.array(
    z.object({
      id: z.string().min(1),
      projectId: z.string().min(1),
      boardId: z.string().min(1),
      taskId: z.string().min(1),
      actorType: actorSchema,
      actorName: nullableStringSchema,
      actorRef: nullableStringSchema,
      eventType: z.string().min(1),
      summary: z.string().min(1),
      data: jsonObjectSchema,
      createdAt: z.string().min(1),
    }),
  ),
  attachments: z.array(
    z.object({
      id: z.string().min(1),
      projectId: z.string().min(1),
      boardId: z.string().min(1),
      taskId: z.string().min(1),
      relativePath: z.string().min(1),
      originalName: z.string().min(1),
      contentType: z.string().min(1),
      sizeBytes: z.number().int().min(0),
      createdAt: z.string().min(1),
    }),
  ),
});

export class CheckpointService {
  private readonly db: DatabaseClient["db"];
  private readonly sqlite: DatabaseClient["sqlite"];

  constructor(
    databaseClient: DatabaseClient,
    private readonly projectService: ProjectService,
    private readonly boardService: BoardService,
    private readonly searchService: SearchService,
    private readonly uploadsPath = getUploadsPath(),
  ) {
    this.db = databaseClient.db;
    this.sqlite = databaseClient.sqlite;
  }

  listCheckpoints(projectId: string, boardId: string, includeArchived: boolean) {
    const project = this.projectService.getProject(projectId, includeArchived);
    const board = this.boardService.getBoard(
      project.id,
      boardId,
      includeArchived,
    );

    return this.db
      .select()
      .from(boardCheckpoints)
      .where(eq(boardCheckpoints.boardId, board.id))
      .orderBy(desc(boardCheckpoints.createdAt))
      .all();
  }

  createCheckpoint(
    projectId: string,
    boardId: string,
    input: CheckpointCreateInput,
  ) {
    const project = this.projectService.getProject(projectId, false);
    const board = this.boardService.getBoard(project.id, boardId, false);

    return this.db.transaction((tx) => {
      const snapshot = this.createSnapshot(project.id, board, tx);
      const summary = summarizeSnapshot(snapshot);

      return tx
        .insert(boardCheckpoints)
        .values({
          projectId: project.id,
          boardId: board.id,
          name: input.name ?? `Checkpoint ${new Date().toISOString()}`,
          description: input.description,
          snapshotVersion: BOARD_CHECKPOINT_SNAPSHOT_VERSION,
          snapshot,
          summary,
          creatorType: input.creatorType,
          creatorName: input.creatorName,
          creatorRef: input.creatorRef,
          metadata: input.metadata,
        })
        .returning()
        .get();
    });
  }

  getCheckpoint(
    projectId: string,
    boardId: string,
    checkpointId: string,
    includeArchived: boolean,
  ) {
    const project = this.projectService.getProject(projectId, includeArchived);
    const board = this.boardService.getBoard(
      project.id,
      boardId,
      includeArchived,
    );
    const checkpoint = this.db
      .select()
      .from(boardCheckpoints)
      .where(
        and(
          eq(boardCheckpoints.id, checkpointId),
          eq(boardCheckpoints.projectId, project.id),
          eq(boardCheckpoints.boardId, board.id),
        ),
      )
      .get();

    if (!checkpoint) {
      throw new ApiError(404, "not_found", "Checkpoint not found");
    }

    return checkpoint;
  }

  async restoreCheckpoint(
    projectId: string,
    boardId: string,
    checkpointId: string,
  ) {
    const project = this.projectService.getProject(projectId, false);
    const board = this.boardService.getBoard(project.id, boardId, false);
    const checkpoint = this.getCheckpoint(project.id, board.id, checkpointId, false);
    const snapshot = validateCheckpointSnapshot(
      checkpoint.snapshot,
      checkpoint.projectId,
      checkpoint.boardId,
    );

    const conflictingBoardName = this.db
      .select({ id: boards.id })
      .from(boards)
      .where(
        and(
          eq(boards.projectId, board.projectId),
          eq(boards.name, snapshot.board.name),
          ne(boards.id, board.id),
        ),
      )
      .get();

    if (conflictingBoardName) {
      throw new ApiError(
        409,
        "invalid_state",
        "Checkpoint board name conflicts with another board",
      );
    }

    const idMappings = this.buildRestoreIdMappings(board.id, snapshot);
    const preparedAttachments = this.prepareAttachmentsForRestore(
      board.id,
      snapshot,
      idMappings,
    );

    const restored = this.db.transaction((tx) => {
      tx.delete(searchDocuments)
        .where(eq(searchDocuments.boardId, board.id))
        .run();
      tx.delete(taskAttachments)
        .where(eq(taskAttachments.boardId, board.id))
        .run();
      tx.delete(taskComments).where(eq(taskComments.boardId, board.id)).run();
      tx.delete(taskActivity).where(eq(taskActivity.boardId, board.id)).run();
      tx.delete(tasks).where(eq(tasks.boardId, board.id)).run();
      tx.delete(boardColumns).where(eq(boardColumns.boardId, board.id)).run();

      const restoredBoard = tx
        .update(boards)
        .set({
          name: snapshot.board.name,
          description: snapshot.board.description,
          metadata: snapshot.board.metadata,
          archivedAt: parseNullableDate(snapshot.board.archivedAt),
          createdAt: parseDate(snapshot.board.createdAt),
          updatedAt: parseDate(snapshot.board.updatedAt),
        })
        .where(eq(boards.id, board.id))
        .returning()
        .get();

      const restoredColumns = snapshot.columns.map((column) =>
        tx
          .insert(boardColumns)
          .values({
            id: mapId(idMappings, "columns", column.id),
            boardId: board.id,
            key: column.key,
            name: column.name,
            position: column.position,
            isDone: column.isDone,
            createdAt: parseDate(column.createdAt),
            updatedAt: parseDate(column.updatedAt),
          })
          .returning()
          .get(),
      );

      const restoredTasks = snapshot.tasks.map((task) =>
        tx
          .insert(tasks)
          .values({
            id: mapId(idMappings, "tasks", task.id),
            projectId: project.id,
            boardId: board.id,
            columnId: mapId(idMappings, "columns", task.columnId),
            title: task.title,
            description: task.description,
            position: task.position,
            priority: task.priority,
            labels: task.labels,
            externalReferences: task.externalReferences,
            metadata: task.metadata,
            completedAt: parseNullableDate(task.completedAt),
            archivedAt: parseNullableDate(task.archivedAt),
            createdAt: parseDate(task.createdAt),
            updatedAt: parseDate(task.updatedAt),
          })
          .returning()
          .get(),
      );

      const restoredComments = snapshot.comments.map((comment) =>
        tx
          .insert(taskComments)
          .values({
            id: mapId(idMappings, "comments", comment.id),
            projectId: project.id,
            boardId: board.id,
            taskId: mapId(idMappings, "tasks", comment.taskId),
            authorType: comment.authorType,
            authorName: comment.authorName,
            authorRef: comment.authorRef,
            body: comment.body,
            metadata: comment.metadata,
            createdAt: parseDate(comment.createdAt),
          })
          .returning()
          .get(),
      );

      const restoredActivity = snapshot.activity.map((entry) =>
        tx
          .insert(taskActivity)
          .values({
            id: mapId(idMappings, "activity", entry.id),
            projectId: project.id,
            boardId: board.id,
            taskId: mapId(idMappings, "tasks", entry.taskId),
            actorType: entry.actorType,
            actorName: entry.actorName,
            actorRef: entry.actorRef,
            eventType: entry.eventType,
            summary: entry.summary,
            data: entry.data,
            createdAt: parseDate(entry.createdAt),
          })
          .returning()
          .get(),
      );

      const restoredAttachments = preparedAttachments.attachments.map(
        (attachment) =>
          tx
            .insert(taskAttachments)
            .values({
              id: mapId(idMappings, "attachments", attachment.id),
              projectId: project.id,
              boardId: board.id,
              taskId: mapId(idMappings, "tasks", attachment.taskId),
              relativePath: attachment.relativePath,
              originalName: attachment.originalName,
              contentType: attachment.contentType,
              sizeBytes: attachment.sizeBytes,
              createdAt: parseDate(attachment.createdAt),
            })
            .returning()
            .get(),
      );

      return {
        board: restoredBoard,
        columns: restoredColumns,
        tasks: restoredTasks,
        comments: restoredComments,
        activity: restoredActivity,
        attachments: restoredAttachments,
      };
    });

    await this.reindexRestoredBoard(restored.board, restored.tasks, restored.comments);

    return {
      checkpoint,
      board: restored.board,
      columns: restored.columns,
      tasks: restored.tasks,
      warnings: preparedAttachments.warnings,
      idMappings,
    };
  }

  deleteCheckpoint(
    projectId: string,
    boardId: string,
    checkpointId: string,
    includeArchived: boolean,
  ) {
    const checkpoint = this.getCheckpoint(
      projectId,
      boardId,
      checkpointId,
      includeArchived,
    );
    this.db
      .delete(boardCheckpoints)
      .where(eq(boardCheckpoints.id, checkpoint.id))
      .run();

    return checkpoint;
  }

  private createSnapshot(
    projectId: string,
    board: Board,
    db: Pick<DatabaseClient["db"], "select"> = this.db,
  ): BoardCheckpointSnapshot {
    const columns = db
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.boardId, board.id))
      .orderBy(asc(boardColumns.position))
      .all();
    const taskRows = db
      .select()
      .from(tasks)
      .where(eq(tasks.boardId, board.id))
      .orderBy(asc(tasks.columnId), asc(tasks.position), asc(tasks.createdAt))
      .all();
    const comments = db
      .select()
      .from(taskComments)
      .where(eq(taskComments.boardId, board.id))
      .orderBy(asc(taskComments.taskId), asc(taskComments.createdAt))
      .all();
    const activity = db
      .select()
      .from(taskActivity)
      .where(eq(taskActivity.boardId, board.id))
      .orderBy(asc(taskActivity.taskId), asc(taskActivity.createdAt))
      .all();
    const attachments = db
      .select()
      .from(taskAttachments)
      .where(eq(taskAttachments.boardId, board.id))
      .orderBy(asc(taskAttachments.taskId), asc(taskAttachments.createdAt))
      .all();

    return {
      version: BOARD_CHECKPOINT_SNAPSHOT_VERSION,
      projectId,
      boardId: board.id,
      board: serializeBoardSnapshot(board),
      columns: columns.map(serializeColumnSnapshot),
      tasks: taskRows.map(serializeTaskSnapshot),
      comments: comments.map(serializeCommentSnapshot),
      activity: activity.map(serializeActivitySnapshot),
      attachments: attachments.map(serializeAttachmentSnapshot),
    };
  }

  private buildRestoreIdMappings(
    boardId: string,
    snapshot: BoardCheckpointSnapshot,
  ): RestoreIdMappings {
    const mappings: RestoreIdMappings = {};
    const usedIds = new Set<string>();

    this.mapCollisions(
      mappings,
      usedIds,
      "columns",
      "board_columns",
      boardId,
      snapshot.columns.map((column) => column.id),
    );
    this.mapCollisions(
      mappings,
      usedIds,
      "tasks",
      "tasks",
      boardId,
      snapshot.tasks.map((task) => task.id),
    );
    this.mapCollisions(
      mappings,
      usedIds,
      "comments",
      "task_comments",
      boardId,
      snapshot.comments.map((comment) => comment.id),
    );
    this.mapCollisions(
      mappings,
      usedIds,
      "activity",
      "task_activity",
      boardId,
      snapshot.activity.map((entry) => entry.id),
    );
    this.mapCollisions(
      mappings,
      usedIds,
      "attachments",
      "task_attachments",
      boardId,
      snapshot.attachments.map((attachment) => attachment.id),
    );

    return mappings;
  }

  private mapCollisions(
    mappings: RestoreIdMappings,
    usedIds: Set<string>,
    mappingKey: string,
    tableName: string,
    boardId: string,
    ids: string[],
  ) {
    for (const id of ids) {
      usedIds.add(id);
    }

    for (const id of ids) {
      if (!this.hasUnrelatedIdCollision(tableName, id, boardId)) {
        continue;
      }

      mappings[mappingKey] ??= {};
      mappings[mappingKey][id] = this.createUniqueId(tableName, usedIds);
    }
  }

  private hasUnrelatedIdCollision(
    tableName: string,
    id: string,
    boardId: string,
  ) {
    return Boolean(
      this.sqlite
        .prepare(`SELECT id FROM ${tableName} WHERE id = ? AND board_id <> ?`)
        .get(id, boardId),
    );
  }

  private createUniqueId(tableName: string, usedIds: Set<string>) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const id = nanoid();
      if (
        !usedIds.has(id) &&
        !this.sqlite.prepare(`SELECT id FROM ${tableName} WHERE id = ?`).get(id)
      ) {
        usedIds.add(id);
        return id;
      }
    }

    throw new ApiError(
      500,
      "internal_error",
      "Unable to generate unique checkpoint restore ID",
    );
  }

  private prepareAttachmentsForRestore(
    boardId: string,
    snapshot: BoardCheckpointSnapshot,
    idMappings: RestoreIdMappings,
  ) {
    const warnings: CheckpointWarning[] = [];
    const attachments: AttachmentSnapshot[] = [];

    for (const attachment of snapshot.attachments) {
      const absolutePath = this.absoluteUploadPath(attachment.relativePath);
      if (!existsSync(absolutePath)) {
        warnings.push({
          type: "attachment.missing_file",
          message: `Attachment file ${attachment.relativePath} is missing and was not restored`,
          attachmentId: attachment.id,
          taskId: attachment.taskId,
          relativePath: attachment.relativePath,
        });
        continue;
      }

      if (this.hasUnrelatedAttachmentPathCollision(attachment.relativePath, boardId)) {
        warnings.push({
          type: "attachment.relative_path_collision",
          message: `Attachment path ${attachment.relativePath} is already used outside this board and was not restored`,
          attachmentId: attachment.id,
          taskId: attachment.taskId,
          relativePath: attachment.relativePath,
        });
        continue;
      }

      attachments.push({
        ...attachment,
        id: mapId(idMappings, "attachments", attachment.id),
        taskId: mapId(idMappings, "tasks", attachment.taskId),
      });
    }

    return { attachments, warnings };
  }

  private absoluteUploadPath(relativePath: string) {
    const root = resolve(this.uploadsPath);
    const absolutePath = resolve(root, relativePath);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
      throw new ApiError(
        409,
        "invalid_state",
        "Checkpoint attachment path is invalid",
      );
    }

    return absolutePath;
  }

  private hasUnrelatedAttachmentPathCollision(
    relativePath: string,
    boardId: string,
  ) {
    return Boolean(
      this.db
        .select({ id: taskAttachments.id })
        .from(taskAttachments)
        .where(
          and(
            eq(taskAttachments.relativePath, relativePath),
            ne(taskAttachments.boardId, boardId),
          ),
        )
        .get(),
    );
  }

  private async reindexRestoredBoard(
    board: Board,
    restoredTasks: Task[],
    restoredComments: TaskComment[],
  ) {
    await runBestEffortIndex({ sourceType: "board", sourceId: board.id }, () =>
      this.searchService.indexBoard(board),
    );

    for (const task of restoredTasks) {
      await runBestEffortIndex({ sourceType: "task", sourceId: task.id }, () =>
        this.searchService.indexTask(task),
      );
    }

    for (const comment of restoredComments) {
      await runBestEffortIndex(
        { sourceType: "comment", sourceId: comment.id },
        () => this.searchService.indexComment(comment),
      );
    }
  }
}

function validateCheckpointSnapshot(
  value: unknown,
  projectId: string,
  boardId: string,
): BoardCheckpointSnapshot {
  const result = checkpointSnapshotSchema.safeParse(value);
  if (!result.success) {
    throw new ApiError(409, "invalid_state", "Checkpoint snapshot is invalid", {
      issues: result.error.issues,
    });
  }

  const snapshot = result.data;
  if (
    snapshot.projectId !== projectId ||
    snapshot.boardId !== boardId ||
    snapshot.board.projectId !== projectId ||
    snapshot.board.id !== boardId
  ) {
    throw new ApiError(
      409,
      "invalid_state",
      "Checkpoint does not belong to the requested board",
    );
  }

  const columnIds = uniqueIds(
    "columns",
    snapshot.columns.map((column) => column.id),
  );
  const taskIds = uniqueIds(
    "tasks",
    snapshot.tasks.map((task) => task.id),
  );
  uniqueIds(
    "comments",
    snapshot.comments.map((comment) => comment.id),
  );
  uniqueIds(
    "activity",
    snapshot.activity.map((entry) => entry.id),
  );
  uniqueIds(
    "attachments",
    snapshot.attachments.map((attachment) => attachment.id),
  );

  for (const column of snapshot.columns) {
    validateParentIds(column, projectId, boardId, "column");
  }
  for (const task of snapshot.tasks) {
    validateParentIds(task, projectId, boardId, "task");
    if (!columnIds.has(task.columnId)) {
      throw new ApiError(
        409,
        "invalid_state",
        "Checkpoint task references a missing column",
      );
    }
  }
  for (const comment of snapshot.comments) {
    validateParentIds(comment, projectId, boardId, "comment");
    if (!taskIds.has(comment.taskId)) {
      throw new ApiError(
        409,
        "invalid_state",
        "Checkpoint comment references a missing task",
      );
    }
  }
  for (const entry of snapshot.activity) {
    validateParentIds(entry, projectId, boardId, "activity");
    if (!taskIds.has(entry.taskId)) {
      throw new ApiError(
        409,
        "invalid_state",
        "Checkpoint activity references a missing task",
      );
    }
  }
  for (const attachment of snapshot.attachments) {
    validateParentIds(attachment, projectId, boardId, "attachment");
    if (!taskIds.has(attachment.taskId)) {
      throw new ApiError(
        409,
        "invalid_state",
        "Checkpoint attachment references a missing task",
      );
    }
  }

  return snapshot;
}

function uniqueIds(label: string, ids: string[]) {
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new ApiError(
      409,
      "invalid_state",
      `Checkpoint snapshot has duplicate ${label} IDs`,
    );
  }

  return unique;
}

function validateParentIds(
  value: { projectId?: string; boardId: string },
  projectId: string,
  boardId: string,
  label: string,
) {
  if (
    (value.projectId !== undefined && value.projectId !== projectId) ||
    value.boardId !== boardId
  ) {
    throw new ApiError(
      409,
      "invalid_state",
      `Checkpoint ${label} belongs to a different board`,
    );
  }
}

function summarizeSnapshot(snapshot: BoardCheckpointSnapshot): JsonObject {
  return {
    columns: snapshot.columns.length,
    tasks: snapshot.tasks.length,
    archivedTasks: snapshot.tasks.filter((task) => task.archivedAt).length,
    comments: snapshot.comments.length,
    activity: snapshot.activity.length,
    attachments: snapshot.attachments.length,
  };
}

function serializeBoardSnapshot(board: Board): BoardSnapshot {
  return {
    id: board.id,
    projectId: board.projectId,
    name: board.name,
    description: board.description,
    metadata: board.metadata,
    archivedAt: serializeNullableDate(board.archivedAt),
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
  };
}

function serializeColumnSnapshot(column: BoardColumn): ColumnSnapshot {
  return {
    id: column.id,
    boardId: column.boardId,
    key: column.key,
    name: column.name,
    position: column.position,
    isDone: column.isDone,
    createdAt: column.createdAt.toISOString(),
    updatedAt: column.updatedAt.toISOString(),
  };
}

function serializeTaskSnapshot(task: Task): TaskSnapshot {
  return {
    id: task.id,
    projectId: task.projectId,
    boardId: task.boardId,
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    position: task.position,
    priority: task.priority,
    labels: task.labels,
    externalReferences: task.externalReferences,
    metadata: task.metadata,
    completedAt: serializeNullableDate(task.completedAt),
    archivedAt: serializeNullableDate(task.archivedAt),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function serializeCommentSnapshot(comment: TaskComment): CommentSnapshot {
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
    createdAt: comment.createdAt.toISOString(),
  };
}

function serializeActivitySnapshot(
  activity: typeof taskActivity.$inferSelect,
): ActivitySnapshot {
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
    createdAt: activity.createdAt.toISOString(),
  };
}

function serializeAttachmentSnapshot(
  attachment: typeof taskAttachments.$inferSelect,
): AttachmentSnapshot {
  return {
    id: attachment.id,
    projectId: attachment.projectId,
    boardId: attachment.boardId,
    taskId: attachment.taskId,
    relativePath: attachment.relativePath,
    originalName: attachment.originalName,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt.toISOString(),
  };
}

function serializeNullableDate(value: Date | null) {
  return value?.toISOString() ?? null;
}

function parseDate(value: string) {
  return new Date(value);
}

function parseNullableDate(value: string | null) {
  return value ? new Date(value) : null;
}

function mapId(mappings: RestoreIdMappings, key: string, id: string) {
  return mappings[key]?.[id] ?? id;
}
