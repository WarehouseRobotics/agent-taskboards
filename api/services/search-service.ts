import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseClient } from "../db/client.js";
import {
  boards,
  type Board,
  projects,
  searchDocuments,
  type SearchSourceType,
  type Task,
  type TaskComment,
  taskComments,
  tasks,
} from "../db/schema.js";
import {
  LocalEmbeddingModel,
  type EmbeddingResult,
} from "../embeddings/local.js";
import type { SearchInput } from "../models/request-schemas.js";

const INDEXED_SOURCE_TYPES = ["board", "task", "comment"] as const;
export type IndexedSourceType = (typeof INDEXED_SOURCE_TYPES)[number];

const EMBEDDING_DIMENSIONS = 384;

export type EmbeddingModel = {
  embed(text: string): Promise<EmbeddingResult>;
};

type SearchDocumentVectorRow = {
  search_document_id: string;
  distance: number;
};

type SearchDocumentRow = {
  document: typeof searchDocuments.$inferSelect;
  projectArchivedAt: Date | null;
  boardArchivedAt: Date | null;
  taskArchivedAt: Date | null;
};

type IndexedSearchDocumentRow = SearchDocumentRow & {
  document: typeof searchDocuments.$inferSelect & {
    sourceType: IndexedSourceType;
  };
};

export type EmbeddingIndexResult = {
  status: "indexed" | "skipped" | "error";
  searchDocumentId?: string;
  error?: string;
};

export type ReindexAllResult = {
  discovered: number;
  indexed: number;
  skipped: number;
  errored: number;
};

export type SearchResult = {
  searchDocumentId: string;
  sourceType: IndexedSourceType;
  sourceId: string;
  projectId: string | null;
  boardId: string | null;
  taskId: string | null;
  title: string | null;
  snippet: string;
  distance: number;
  metadata: unknown;
};

export class SearchService {
  private readonly db: DatabaseClient["db"];
  private readonly sqlite: DatabaseClient["sqlite"];
  private readonly embeddings: EmbeddingModel;

  constructor(
    databaseClient: DatabaseClient,
    embeddings: EmbeddingModel = new LocalEmbeddingModel(),
  ) {
    this.db = databaseClient.db;
    this.sqlite = databaseClient.sqlite;
    this.embeddings = embeddings;
  }

  async indexBoard(
    board: Board,
    options: { force?: boolean } = {},
  ): Promise<EmbeddingIndexResult> {
    return this.indexDocument(
      {
        sourceType: "board",
        sourceId: board.id,
        projectId: board.projectId,
        boardId: board.id,
        taskId: null,
        chunkKey: "board:content",
        title: board.name,
        body: formatBoardEmbeddingText(board),
        metadata: {},
      },
      options,
    );
  }

  async indexTask(
    task: Task,
    options: { force?: boolean } = {},
  ): Promise<EmbeddingIndexResult> {
    return this.indexDocument(
      {
        sourceType: "task",
        sourceId: task.id,
        projectId: task.projectId,
        boardId: task.boardId,
        taskId: task.id,
        chunkKey: "task:content",
        title: task.title,
        body: formatTaskEmbeddingText(task),
        metadata: {},
      },
      options,
    );
  }

  async indexComment(
    comment: TaskComment,
    options: { force?: boolean } = {},
  ): Promise<EmbeddingIndexResult> {
    return this.indexDocument(
      {
        sourceType: "comment",
        sourceId: comment.id,
        projectId: comment.projectId,
        boardId: comment.boardId,
        taskId: comment.taskId,
        chunkKey: "comment:body",
        title: this.getTaskTitle(comment.taskId),
        body: formatCommentEmbeddingText(comment),
        metadata: {},
      },
      options,
    );
  }

  async reindexAll(
    options: { force?: boolean } = {},
  ): Promise<ReindexAllResult> {
    const boardRows = this.db.select().from(boards).all();
    const taskRows = this.db.select().from(tasks).all();
    const commentRows = this.db.select().from(taskComments).all();
    const result: ReindexAllResult = {
      discovered: boardRows.length + taskRows.length + commentRows.length,
      indexed: 0,
      skipped: 0,
      errored: 0,
    };

    for (const board of boardRows) {
      countIndexResult(result, await this.indexBoard(board, options));
    }

    for (const task of taskRows) {
      countIndexResult(result, await this.indexTask(task, options));
    }

    for (const comment of commentRows) {
      countIndexResult(result, await this.indexComment(comment, options));
    }

    return result;
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const queryEmbedding = await this.embeddings.embed(input.query);
    validateEmbeddingDimensions(queryEmbedding);
    const queryVector = vectorBuffer(queryEmbedding.vector);
    const limit = input.limit;
    const vectorLimit = Math.min(Math.max(limit * 8, 20), 200);
    const sourceTypes = input.sourceTypes ?? [...INDEXED_SOURCE_TYPES];
    const vectorRows: SearchDocumentVectorRow[] = [];

    for (const sourceType of sourceTypes) {
      vectorRows.push(
        ...this.searchVectors({
          queryVector,
          limit: vectorLimit,
          sourceType,
          projectId: input.projectId,
          boardId: input.boardId,
          taskId: input.taskId,
        }),
      );
    }

    const byDocumentId = new Map<string, number>();
    for (const row of vectorRows) {
      const existingDistance = byDocumentId.get(row.search_document_id);
      if (existingDistance === undefined || row.distance < existingDistance) {
        byDocumentId.set(row.search_document_id, row.distance);
      }
    }

    const rows = this.loadSearchDocuments([...byDocumentId.keys()]);
    return rows
      .filter((row) => row.document.embeddingStatus === "indexed")
      .filter(hasIndexedSourceType)
      .filter((row) => input.includeArchived || isActiveSearchRow(row))
      .map((row) => ({
        searchDocumentId: row.document.id,
        sourceType: row.document.sourceType,
        sourceId: row.document.sourceId,
        projectId: row.document.projectId,
        boardId: row.document.boardId,
        taskId: row.document.taskId,
        title: row.document.title,
        snippet: makeSnippet(row.document.body),
        distance:
          byDocumentId.get(row.document.id) ?? Number.POSITIVE_INFINITY,
        metadata: row.document.metadata,
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, limit);
  }

  private async indexDocument(
    document: {
      sourceType: IndexedSourceType;
      sourceId: string;
      projectId: string;
      boardId: string;
      taskId: string | null;
      chunkKey: string;
      title: string | null;
      body: string;
      metadata: Record<string, unknown>;
    },
    options: { force?: boolean },
  ): Promise<EmbeddingIndexResult> {
    const bodyHash = hashText(document.body);
    const existing = this.db
      .select()
      .from(searchDocuments)
      .where(
        and(
          eq(searchDocuments.sourceType, document.sourceType),
          eq(searchDocuments.sourceId, document.sourceId),
          eq(searchDocuments.chunkKey, document.chunkKey),
        ),
      )
      .get();

    if (
      existing &&
      !options.force &&
      existing.bodyHash === bodyHash &&
      existing.embeddingStatus === "indexed"
    ) {
      return { status: "skipped", searchDocumentId: existing.id };
    }

    const searchDocument = existing
      ? this.db
          .update(searchDocuments)
          .set({
            projectId: document.projectId,
            boardId: document.boardId,
            taskId: document.taskId,
            title: document.title,
            body: document.body,
            bodyHash,
            embeddingModel: null,
            embeddingDimensions: null,
            embeddingStatus: "pending",
            embeddedAt: null,
            embeddingError: null,
            metadata: document.metadata,
          })
          .where(eq(searchDocuments.id, existing.id))
          .returning()
          .get()
      : this.db
          .insert(searchDocuments)
          .values({
            sourceType: document.sourceType,
            sourceId: document.sourceId,
            projectId: document.projectId,
            boardId: document.boardId,
            taskId: document.taskId,
            chunkKey: document.chunkKey,
            title: document.title,
            body: document.body,
            bodyHash,
            embeddingStatus: "pending",
            metadata: document.metadata,
          })
          .returning()
          .get();

    try {
      const embedding = await this.embeddings.embed(document.body);
      validateEmbeddingDimensions(embedding);

      this.sqlite
        .prepare(
          "DELETE FROM search_document_vectors WHERE search_document_id = ?",
        )
        .run(searchDocument.id);
      this.sqlite
        .prepare(
          `
          INSERT INTO search_document_vectors (
            project_id,
            board_id,
            task_id,
            source_type,
            search_document_id,
            embedding
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          document.projectId,
          document.boardId,
          document.taskId,
          document.sourceType,
          searchDocument.id,
          vectorBuffer(embedding.vector),
        );

      this.db
        .update(searchDocuments)
        .set({
          embeddingModel: embedding.modelPath,
          embeddingDimensions: embedding.dimensions,
          embeddingStatus: "indexed",
          embeddedAt: new Date(),
          embeddingError: null,
        })
        .where(eq(searchDocuments.id, searchDocument.id))
        .run();

      return { status: "indexed", searchDocumentId: searchDocument.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sqlite
        .prepare(
          "DELETE FROM search_document_vectors WHERE search_document_id = ?",
        )
        .run(searchDocument.id);
      this.db
        .update(searchDocuments)
        .set({
          embeddingStatus: "error",
          embeddedAt: null,
          embeddingError: message,
        })
        .where(eq(searchDocuments.id, searchDocument.id))
        .run();

      return {
        status: "error",
        searchDocumentId: searchDocument.id,
        error: message,
      };
    }
  }

  private searchVectors(input: {
    queryVector: Buffer;
    limit: number;
    sourceType: IndexedSourceType;
    projectId?: string;
    boardId?: string;
    taskId?: string;
  }) {
    const clauses = ["embedding MATCH ?", "k = ?", "source_type = ?"];
    const params: unknown[] = [
      input.queryVector,
      input.limit,
      input.sourceType,
    ];

    if (input.projectId) {
      clauses.push("project_id = ?");
      params.push(input.projectId);
    }

    if (input.boardId) {
      clauses.push("board_id = ?");
      params.push(input.boardId);
    }

    if (input.taskId) {
      clauses.push("task_id = ?");
      params.push(input.taskId);
    }

    return this.sqlite
      .prepare(
        `
        SELECT search_document_id, distance
        FROM search_document_vectors
        WHERE ${clauses.join(" AND ")}
        ORDER BY distance
      `,
      )
      .all(...params) as SearchDocumentVectorRow[];
  }

  private getTaskTitle(taskId: string) {
    const task = this.db
      .select({ title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .get();

    return task ? `Comment on: ${task.title}` : null;
  }

  private loadSearchDocuments(searchDocumentIds: string[]) {
    if (searchDocumentIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        document: searchDocuments,
        projectArchivedAt: projects.archivedAt,
        boardArchivedAt: boards.archivedAt,
        taskArchivedAt: tasks.archivedAt,
      })
      .from(searchDocuments)
      .leftJoin(projects, eq(projects.id, searchDocuments.projectId))
      .leftJoin(boards, eq(boards.id, searchDocuments.boardId))
      .leftJoin(tasks, eq(tasks.id, searchDocuments.taskId))
      .where(inArray(searchDocuments.id, searchDocumentIds))
      .all();
  }
}

export function formatBoardEmbeddingText(
  board: Pick<Board, "name" | "description">,
) {
  return joinEmbeddingLines([
    `Board: ${board.name}`,
    board.description ? `Description: ${board.description}` : undefined,
  ]);
}

export function formatTaskEmbeddingText(
  task: Pick<Task, "title" | "description" | "labels" | "priority">,
) {
  const labels = normalizeLabels(task.labels);
  return joinEmbeddingLines([
    `Task: ${task.title}`,
    task.description ? `Description: ${task.description}` : undefined,
    labels.length > 0 ? `Tags: ${labels.join(", ")}` : undefined,
    `Priority: ${task.priority}`,
  ]);
}

export function formatCommentEmbeddingText(comment: Pick<TaskComment, "body">) {
  return comment.body;
}

function joinEmbeddingLines(lines: Array<string | undefined>) {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function countIndexResult(
  counts: ReindexAllResult,
  result: EmbeddingIndexResult,
) {
  if (result.status === "indexed") {
    counts.indexed += 1;
  } else if (result.status === "skipped") {
    counts.skipped += 1;
  } else {
    counts.errored += 1;
  }
}

function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function vectorBuffer(vector: readonly number[]) {
  return Buffer.from(new Float32Array(vector).buffer);
}

function validateEmbeddingDimensions(embedding: EmbeddingResult) {
  if (embedding.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS} embedding dimensions, received ${embedding.dimensions}`,
    );
  }
}

function isActiveSearchRow(row: SearchDocumentRow) {
  return (
    row.projectArchivedAt === null &&
    row.boardArchivedAt === null &&
    row.taskArchivedAt === null
  );
}

function hasIndexedSourceType(
  row: SearchDocumentRow,
): row is IndexedSearchDocumentRow {
  return isIndexedSourceType(row.document.sourceType);
}

function normalizeLabels(labels: readonly unknown[]) {
  return labels.flatMap((label) => {
    if (typeof label !== "string") {
      return [];
    }

    const trimmed = label.trim();
    return trimmed ? [trimmed] : [];
  });
}

function makeSnippet(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= 240) {
    return normalized;
  }

  return `${normalized.slice(0, 237).trimEnd()}...`;
}

export function isIndexedSourceType(
  sourceType: SearchSourceType,
): sourceType is IndexedSourceType {
  return INDEXED_SOURCE_TYPES.includes(sourceType as IndexedSourceType);
}
