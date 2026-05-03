import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export const actorTypes = ["human", "agent", "system"] as const;
export type ActorType = (typeof actorTypes)[number];

export const taskPriorities = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof taskPriorities)[number];

export const searchSourceTypes = [
  "project",
  "board",
  "task",
  "comment",
  "activity",
] as const;
export type SearchSourceType = (typeof searchSourceTypes)[number];

// `stale` is reserved for future background reindex flows where canonical
// text has changed but derived vectors have not been rebuilt yet.
export const embeddingStatuses = ["pending", "indexed", "stale", "error"] as const;
export type EmbeddingStatus = (typeof embeddingStatuses)[number];

export type JsonObject = Record<string, unknown>;
export type JsonArray = unknown[];

const id = (name = "id") =>
  text(name)
    .primaryKey()
    .$defaultFn(() => nanoid());

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

const updatedTimestamp = (name = "updated_at") =>
  timestamp(name).$onUpdateFn(() => new Date());

const nullableTimestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" });

const jsonObject = (name: string) =>
  text(name, { mode: "json" })
    .$type<JsonObject>()
    .notNull()
    .default(sql`'{}'`)
    .$defaultFn(() => ({}));

const jsonArray = (name: string) =>
  text(name, { mode: "json" })
    .$type<JsonArray>()
    .notNull()
    .default(sql`'[]'`)
    .$defaultFn(() => []);

export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description"),
    repositoryPath: text("repository_path"),
    defaultBranch: text("default_branch"),
    metadata: jsonObject("metadata"),
    archivedAt: nullableTimestamp("archived_at"),
    createdAt: timestamp("created_at"),
    updatedAt: updatedTimestamp(),
  },
  (table) => ({
    activeIdx: index("projects_active_idx").on(table.archivedAt),
    nameIdx: index("projects_name_idx").on(table.name),
  }),
);

export const boards = sqliteTable(
  "boards",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    metadata: jsonObject("metadata"),
    archivedAt: nullableTimestamp("archived_at"),
    createdAt: timestamp("created_at"),
    updatedAt: updatedTimestamp(),
  },
  (table) => ({
    projectIdx: index("boards_project_idx").on(table.projectId),
    projectActiveIdx: index("boards_project_active_idx").on(
      table.projectId,
      table.archivedAt,
    ),
  }),
);

export const boardColumns = sqliteTable(
  "board_columns",
  {
    id: id(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    isDone: integer("is_done", { mode: "boolean" }).notNull().default(false),
    createdAt: timestamp("created_at"),
    updatedAt: updatedTimestamp(),
  },
  (table) => ({
    boardPositionIdx: index("board_columns_board_position_idx").on(
      table.boardId,
      table.position,
    ),
    boardKeyUnique: uniqueIndex("board_columns_board_key_unique").on(
      table.boardId,
      table.key,
    ),
  }),
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    columnId: text("column_id")
      .notNull()
      .references(() => boardColumns.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    position: integer("position").notNull(),
    priority: text("priority").$type<TaskPriority>().notNull().default("normal"),
    labels: jsonArray("labels"),
    externalReferences: jsonArray("external_references"),
    metadata: jsonObject("metadata"),
    completedAt: nullableTimestamp("completed_at"),
    archivedAt: nullableTimestamp("archived_at"),
    createdAt: timestamp("created_at"),
    updatedAt: updatedTimestamp(),
  },
  (table) => ({
    projectIdx: index("tasks_project_idx").on(table.projectId),
    boardIdx: index("tasks_board_idx").on(table.boardId),
    boardColumnPositionIdx: index("tasks_board_column_position_idx").on(
      table.boardId,
      table.columnId,
      table.position,
    ),
    boardActiveIdx: index("tasks_board_active_idx").on(
      table.boardId,
      table.archivedAt,
    ),
  }),
);

export const taskComments = sqliteTable(
  "task_comments",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorType: text("author_type").$type<ActorType>().notNull(),
    authorName: text("author_name"),
    authorRef: text("author_ref"),
    body: text("body").notNull(),
    metadata: jsonObject("metadata"),
    createdAt: timestamp("created_at"),
  },
  (table) => ({
    taskCreatedIdx: index("task_comments_task_created_idx").on(
      table.taskId,
      table.createdAt,
    ),
    projectCreatedIdx: index("task_comments_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  }),
);

export const taskActivity = sqliteTable(
  "task_activity",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorType: text("actor_type").$type<ActorType>().notNull().default("system"),
    actorName: text("actor_name"),
    actorRef: text("actor_ref"),
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
    data: jsonObject("data"),
    createdAt: timestamp("created_at"),
  },
  (table) => ({
    taskCreatedIdx: index("task_activity_task_created_idx").on(
      table.taskId,
      table.createdAt,
    ),
    projectCreatedIdx: index("task_activity_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    eventTypeIdx: index("task_activity_event_type_idx").on(table.eventType),
  }),
);

export const taskAttachments = sqliteTable(
  "task_attachments",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    relativePath: text("relative_path").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => ({
    taskCreatedIdx: index("task_attachments_task_created_idx").on(
      table.taskId,
      table.createdAt,
    ),
    projectCreatedIdx: index("task_attachments_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    relativePathUnique: uniqueIndex("task_attachments_relative_path_unique").on(
      table.relativePath,
    ),
  }),
);

export const searchDocuments = sqliteTable(
  "search_documents",
  {
    id: id(),
    sourceType: text("source_type").$type<SearchSourceType>().notNull(),
    sourceId: text("source_id").notNull(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    boardId: text("board_id").references(() => boards.id, {
      onDelete: "cascade",
    }),
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "cascade",
    }),
    chunkKey: text("chunk_key").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    bodyHash: text("body_hash").notNull(),
    embeddingModel: text("embedding_model"),
    embeddingDimensions: integer("embedding_dimensions"),
    embeddingStatus: text("embedding_status")
      .$type<EmbeddingStatus>()
      .notNull()
      .default("pending"),
    embeddedAt: nullableTimestamp("embedded_at"),
    embeddingError: text("embedding_error"),
    metadata: jsonObject("metadata"),
    createdAt: timestamp("created_at"),
    updatedAt: updatedTimestamp(),
  },
  (table) => ({
    sourceIdx: index("search_documents_source_idx").on(
      table.sourceType,
      table.sourceId,
    ),
    sourceChunkUnique: uniqueIndex("search_documents_source_chunk_unique").on(
      table.sourceType,
      table.sourceId,
      table.chunkKey,
    ),
    projectIdx: index("search_documents_project_idx").on(table.projectId),
    boardIdx: index("search_documents_board_idx").on(table.boardId),
    taskIdx: index("search_documents_task_idx").on(table.taskId),
    statusIdx: index("search_documents_status_idx").on(table.embeddingStatus),
  }),
);

export const projectsRelations = relations(projects, ({ many }) => ({
  boards: many(boards),
  tasks: many(tasks),
  comments: many(taskComments),
  activity: many(taskActivity),
  attachments: many(taskAttachments),
  searchDocuments: many(searchDocuments),
}));

export const boardsRelations = relations(boards, ({ one, many }) => ({
  project: one(projects, {
    fields: [boards.projectId],
    references: [projects.id],
  }),
  columns: many(boardColumns),
  tasks: many(tasks),
  comments: many(taskComments),
  activity: many(taskActivity),
  attachments: many(taskAttachments),
  searchDocuments: many(searchDocuments),
}));

export const boardColumnsRelations = relations(boardColumns, ({ one, many }) => ({
  board: one(boards, {
    fields: [boardColumns.boardId],
    references: [boards.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  board: one(boards, {
    fields: [tasks.boardId],
    references: [boards.id],
  }),
  column: one(boardColumns, {
    fields: [tasks.columnId],
    references: [boardColumns.id],
  }),
  comments: many(taskComments),
  activity: many(taskActivity),
  attachments: many(taskAttachments),
  searchDocuments: many(searchDocuments),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  project: one(projects, {
    fields: [taskComments.projectId],
    references: [projects.id],
  }),
  board: one(boards, {
    fields: [taskComments.boardId],
    references: [boards.id],
  }),
  task: one(tasks, {
    fields: [taskComments.taskId],
    references: [tasks.id],
  }),
}));

export const taskActivityRelations = relations(taskActivity, ({ one }) => ({
  project: one(projects, {
    fields: [taskActivity.projectId],
    references: [projects.id],
  }),
  board: one(boards, {
    fields: [taskActivity.boardId],
    references: [boards.id],
  }),
  task: one(tasks, {
    fields: [taskActivity.taskId],
    references: [tasks.id],
  }),
}));

export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
  project: one(projects, {
    fields: [taskAttachments.projectId],
    references: [projects.id],
  }),
  board: one(boards, {
    fields: [taskAttachments.boardId],
    references: [boards.id],
  }),
  task: one(tasks, {
    fields: [taskAttachments.taskId],
    references: [tasks.id],
  }),
}));

export const searchDocumentsRelations = relations(searchDocuments, ({ one }) => ({
  project: one(projects, {
    fields: [searchDocuments.projectId],
    references: [projects.id],
  }),
  board: one(boards, {
    fields: [searchDocuments.boardId],
    references: [boards.id],
  }),
  task: one(tasks, {
    fields: [searchDocuments.taskId],
    references: [tasks.id],
  }),
}));

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;

export type BoardColumn = typeof boardColumns.$inferSelect;
export type NewBoardColumn = typeof boardColumns.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type TaskComment = typeof taskComments.$inferSelect;
export type NewTaskComment = typeof taskComments.$inferInsert;

export type TaskActivity = typeof taskActivity.$inferSelect;
export type NewTaskActivity = typeof taskActivity.$inferInsert;

export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type NewTaskAttachment = typeof taskAttachments.$inferInsert;

export type SearchDocument = typeof searchDocuments.$inferSelect;
export type NewSearchDocument = typeof searchDocuments.$inferInsert;
