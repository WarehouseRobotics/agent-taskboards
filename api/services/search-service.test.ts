import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import {
  boardColumns,
  boards,
  projects,
  searchDocuments,
  taskComments,
  tasks,
} from "../db/schema.js";
import {
  formatBoardEmbeddingText,
  formatCommentEmbeddingText,
  formatTaskEmbeddingText,
  SearchService,
} from "./search-service.js";
import { createFakeEmbeddingModel } from "../testing/fake-embedding-model.js";

describe("search service", () => {
  let tmpDir: string | undefined;
  let client: DatabaseClient | undefined;

  afterEach(() => {
    client?.close();
    client = undefined;

    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("formats board, task, and comment content for natural language embedding", () => {
    expect(
      formatBoardEmbeddingText({
        name: "Implementation",
        description: "Starter API work",
      }),
    ).toBe("Board: Implementation\nDescription: Starter API work");

    expect(
      formatTaskEmbeddingText({
        title: "Build vector search",
        description: "Use sqlite-vec",
        labels: ["api", 42, " ", null, " search "],
        priority: "high",
      }),
    ).toBe(
      "Task: Build vector search\nDescription: Use sqlite-vec\nTags: api, search\nPriority: high",
    );

    expect(
      formatCommentEmbeddingText({ body: "Blocked on migration shape." }),
    ).toBe("Blocked on migration shape.");
  });

  it("reindexes all board, task, and comment documents", async () => {
    client = createMigratedClient();
    const { db } = client;
    const project = db
      .insert(projects)
      .values({ name: "Project" })
      .returning()
      .get();
    const board = db
      .insert(boards)
      .values({
        projectId: project.id,
        name: "Embedding board",
        description: "Vector work",
      })
      .returning()
      .get();
    const column = db
      .insert(boardColumns)
      .values({
        boardId: board.id,
        key: "ready",
        name: "Ready",
        position: 0,
      })
      .returning()
      .get();
    const task = db
      .insert(tasks)
      .values({
        projectId: project.id,
        boardId: board.id,
        columnId: column.id,
        title: "Build search",
        description: "Index sqlite vectors",
        position: 0,
        labels: ["sqlite"],
      })
      .returning()
      .get();
    db.insert(taskComments)
      .values({
        projectId: project.id,
        boardId: board.id,
        taskId: task.id,
        authorType: "agent",
        body: "Vector query smoke test.",
      })
      .run();

    const search = new SearchService(client, createFakeEmbeddingModel());
    const result = await search.reindexAll({ force: true });

    expect(result).toEqual({
      discovered: 3,
      indexed: 3,
      skipped: 0,
      errored: 0,
    });
    expect(db.select().from(searchDocuments).all()).toHaveLength(3);
    expect(
      client.sqlite
        .prepare("SELECT count(*) AS count FROM search_document_vectors")
        .get(),
    ).toEqual({ count: 3 });
    const commentDocument = db
      .select()
      .from(searchDocuments)
      .where(eq(searchDocuments.sourceType, "comment"))
      .get();
    expect(commentDocument?.title).toBe("Comment on: Build search");
  });

  it("indexes long task and comment text as multiple chunks with metadata", async () => {
    client = createMigratedClient();
    const { db } = client;
    const project = db
      .insert(projects)
      .values({ name: "Project" })
      .returning()
      .get();
    const board = db
      .insert(boards)
      .values({
        projectId: project.id,
        name: "Chunk board",
      })
      .returning()
      .get();
    const column = db
      .insert(boardColumns)
      .values({
        boardId: board.id,
        key: "ready",
        name: "Ready",
        position: 0,
      })
      .returning()
      .get();
    const task = db
      .insert(tasks)
      .values({
        projectId: project.id,
        boardId: board.id,
        columnId: column.id,
        title: "Long sqlite search specification",
        description: makeLongText("sqlite vector task paragraph", 34),
        position: 0,
        labels: ["sqlite"],
      })
      .returning()
      .get();
    const comment = db
      .insert(taskComments)
      .values({
        projectId: project.id,
        boardId: board.id,
        taskId: task.id,
        authorType: "agent",
        body: makeLongText("blocked vector comment paragraph", 34),
      })
      .returning()
      .get();

    const search = new SearchService(client, createFakeEmbeddingModel());
    await search.indexTask(task);
    await search.indexComment(comment);

    const documents = db.select().from(searchDocuments).all();
    const taskDocuments = documents.filter(
      (document) => document.sourceType === "task",
    );
    const commentDocuments = documents.filter(
      (document) => document.sourceType === "comment",
    );

    expect(taskDocuments.length).toBeGreaterThan(1);
    expect(commentDocuments.length).toBeGreaterThan(1);
    expect(
      taskDocuments.every((document) => document.body.startsWith("Task:")),
    ).toBe(true);
    expect(
      taskDocuments.every((document) => document.chunkKey.includes(":")),
    ).toBe(true);
    expect(taskDocuments[0]?.metadata).toMatchObject({
      chunkIndex: 0,
      chunkCount: taskDocuments.length,
      chunkingVersion: 1,
      sourceTextField: "description",
    });
    const firstTaskMetadata = taskDocuments[0]?.metadata as
      | Record<string, unknown>
      | undefined;
    expect(firstTaskMetadata?.startOffset).toBe(0);
    expect(
      task.description?.slice(
        firstTaskMetadata?.startOffset as number,
        firstTaskMetadata?.endOffset as number,
      ),
    ).toContain("sqlite vector task paragraph");
    expect(
      client.sqlite
        .prepare("SELECT count(*) AS count FROM search_document_vectors")
        .get(),
    ).toEqual({ count: documents.length });
  });

  it("removes stale chunk rows and vectors when long text shrinks", async () => {
    client = createMigratedClient();
    const { db } = client;
    const project = db
      .insert(projects)
      .values({ name: "Project" })
      .returning()
      .get();
    const board = db
      .insert(boards)
      .values({ projectId: project.id, name: "Shrink board" })
      .returning()
      .get();
    const column = db
      .insert(boardColumns)
      .values({
        boardId: board.id,
        key: "ready",
        name: "Ready",
        position: 0,
      })
      .returning()
      .get();
    const task = db
      .insert(tasks)
      .values({
        projectId: project.id,
        boardId: board.id,
        columnId: column.id,
        title: "Shrink indexed text",
        description: makeLongText("sqlite migration details", 34),
        position: 0,
      })
      .returning()
      .get();

    const search = new SearchService(client, createFakeEmbeddingModel());
    await search.indexTask(task);
    expect(db.select().from(searchDocuments).all().length).toBeGreaterThan(1);

    await search.indexTask({
      ...task,
      description: "Short sqlite note.",
    });

    const documents = db.select().from(searchDocuments).all();
    expect(documents).toHaveLength(1);
    expect(documents[0]?.chunkKey).toBe("task:content");
    expect(
      client.sqlite
        .prepare("SELECT count(*) AS count FROM search_document_vectors")
        .get(),
    ).toEqual({ count: 1 });
  });

  it("keeps old stale chunks when a partial reindex fails", async () => {
    client = createMigratedClient();
    const { db } = client;
    const project = db
      .insert(projects)
      .values({ name: "Project" })
      .returning()
      .get();
    const board = db
      .insert(boards)
      .values({ projectId: project.id, name: "Failure board" })
      .returning()
      .get();
    const column = db
      .insert(boardColumns)
      .values({
        boardId: board.id,
        key: "ready",
        name: "Ready",
        position: 0,
      })
      .returning()
      .get();
    const task = db
      .insert(tasks)
      .values({
        projectId: project.id,
        boardId: board.id,
        columnId: column.id,
        title: "Preserve old chunks",
        description: makeLongText("sqlite migration old chunk", 34),
        position: 0,
      })
      .returning()
      .get();

    const search = new SearchService(client, createFakeEmbeddingModel());
    await search.indexTask(task);
    const oldDocuments = db.select().from(searchDocuments).all();
    expect(oldDocuments.length).toBeGreaterThan(1);

    const failingSearch = new SearchService(client, {
      async embed(text) {
        if (text.includes("FAIL")) {
          throw new Error("planned embedding failure");
        }

        return createFakeEmbeddingModel().embed(text);
      },
    });
    const result = await failingSearch.indexTask({
      ...task,
      description: "FAIL before stale chunks can be deleted.",
    });

    expect(result.status).toBe("error");
    const documentsAfterFailure = db.select().from(searchDocuments).all();
    const oldChunkKeys = new Set(
      oldDocuments.map((document) => document.chunkKey),
    );
    expect(
      documentsAfterFailure.filter((document) =>
        oldChunkKeys.has(document.chunkKey),
      ),
    ).toHaveLength(oldDocuments.length);
    expect(
      client.sqlite
        .prepare("SELECT count(*) AS count FROM search_document_vectors")
        .get(),
    ).toEqual({ count: oldDocuments.length });
  });

  it("removes vector rows when search documents are deleted", async () => {
    client = createMigratedClient();
    const { db } = client;
    const project = db
      .insert(projects)
      .values({ name: "Project" })
      .returning()
      .get();
    const board = db
      .insert(boards)
      .values({
        projectId: project.id,
        name: "Cleanup board",
      })
      .returning()
      .get();

    const search = new SearchService(client, createFakeEmbeddingModel());
    await search.indexBoard(board);

    const document = db.select().from(searchDocuments).get();
    expect(document).toBeDefined();
    expect(
      client.sqlite
        .prepare("SELECT count(*) AS count FROM search_document_vectors")
        .get(),
    ).toEqual({ count: 1 });

    db.delete(searchDocuments)
      .where(eq(searchDocuments.id, document?.id ?? "missing"))
      .run();

    expect(
      client.sqlite
        .prepare("SELECT count(*) AS count FROM search_document_vectors")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("queries sqlite-vec rows and maps them back to search documents", async () => {
    client = createMigratedClient();
    const { db } = client;
    const project = db
      .insert(projects)
      .values({ name: "Project" })
      .returning()
      .get();
    const board = db
      .insert(boards)
      .values({
        projectId: project.id,
        name: "Search board",
      })
      .returning()
      .get();
    const column = db
      .insert(boardColumns)
      .values({
        boardId: board.id,
        key: "ready",
        name: "Ready",
        position: 0,
      })
      .returning()
      .get();
    const task = db
      .insert(tasks)
      .values({
        projectId: project.id,
        boardId: board.id,
        columnId: column.id,
        title: "SQLite migration blocker",
        description: "Debug vector table migration",
        position: 0,
      })
      .returning()
      .get();
    const unrelated = db
      .insert(tasks)
      .values({
        projectId: project.id,
        boardId: board.id,
        columnId: column.id,
        title: "Polish navigation",
        position: 1,
      })
      .returning()
      .get();

    const search = new SearchService(client, createFakeEmbeddingModel());
    await search.indexTask(task);
    await search.indexTask(unrelated);

    const results = await search.search({
      query: "sqlite migration",
      sourceTypes: ["task"],
      includeArchived: false,
      limit: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.sourceId).toBe(task.id);
  });

  it("groups multiple matching chunks into one search result per source", async () => {
    client = createMigratedClient();
    const { db } = client;
    const project = db
      .insert(projects)
      .values({ name: "Project" })
      .returning()
      .get();
    const board = db
      .insert(boards)
      .values({
        projectId: project.id,
        name: "Grouped search board",
      })
      .returning()
      .get();
    const column = db
      .insert(boardColumns)
      .values({
        boardId: board.id,
        key: "ready",
        name: "Ready",
        position: 0,
      })
      .returning()
      .get();
    const longTask = db
      .insert(tasks)
      .values({
        projectId: project.id,
        boardId: board.id,
        columnId: column.id,
        title: "Long sqlite migration plan",
        description: makeLongText("sqlite migration chunk", 34),
        position: 0,
      })
      .returning()
      .get();
    const shortTask = db
      .insert(tasks)
      .values({
        projectId: project.id,
        boardId: board.id,
        columnId: column.id,
        title: "SQLite summary",
        description: "A shorter sqlite migration note.",
        position: 1,
      })
      .returning()
      .get();

    const search = new SearchService(client, createFakeEmbeddingModel());
    await search.indexTask(longTask);
    await search.indexTask(shortTask);

    const results = await search.search({
      query: "sqlite migration",
      sourceTypes: ["task"],
      includeArchived: false,
      limit: 10,
    });

    expect(
      results.filter((result) => result.sourceId === longTask.id),
    ).toHaveLength(1);
    expect(results.map((result) => result.sourceId)).toContain(shortTask.id);
    expect(new Set(results.map((result) => result.sourceId)).size).toBe(
      results.length,
    );
  });

  it("oversamples vector rows until enough unique sources are found", async () => {
    client = createMigratedClient();
    const { db } = client;
    const project = db
      .insert(projects)
      .values({ name: "Project" })
      .returning()
      .get();
    const board = db
      .insert(boards)
      .values({
        projectId: project.id,
        name: "Oversample board",
      })
      .returning()
      .get();
    const column = db
      .insert(boardColumns)
      .values({
        boardId: board.id,
        key: "ready",
        name: "Ready",
        position: 0,
      })
      .returning()
      .get();
    const longTask = db
      .insert(tasks)
      .values({
        projectId: project.id,
        boardId: board.id,
        columnId: column.id,
        title: "Dominant chunked task",
        position: 0,
      })
      .returning()
      .get();

    insertSearchVectorChunks({
      client,
      projectId: project.id,
      boardId: board.id,
      taskId: longTask.id,
      sourceId: longTask.id,
      chunks: 60,
      vectorValue: 1,
    });

    const otherTaskIds: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const task = db
        .insert(tasks)
        .values({
          projectId: project.id,
          boardId: board.id,
          columnId: column.id,
          title: `Other sqlite task ${index}`,
          position: index + 1,
        })
        .returning()
        .get();
      otherTaskIds.push(task.id);
      insertSearchVectorChunks({
        client,
        projectId: project.id,
        boardId: board.id,
        taskId: task.id,
        sourceId: task.id,
        chunks: 1,
        vectorValue: 0.99,
      });
    }

    const search = new SearchService(client, createConstantEmbeddingModel(1));
    const results = await search.search({
      query: "sqlite migration",
      sourceTypes: ["task"],
      includeArchived: false,
      limit: 10,
    });

    expect(results).toHaveLength(10);
    expect(
      results.filter((result) => result.sourceId === longTask.id),
    ).toHaveLength(1);
    expect(
      results.some((result) => otherTaskIds.includes(result.sourceId)),
    ).toBe(true);
  });

  function createMigratedClient() {
    tmpDir = mkdtempSync(join(tmpdir(), "taskboards-search-"));
    const databasePath = join(tmpDir, "test.sqlite");
    runMigrations({
      databasePath,
      migrationsDir: resolve(process.cwd(), "drizzle"),
    });
    return createDatabaseClient(databasePath);
  }

  function makeLongText(prefix: string, paragraphs: number) {
    return Array.from(
      { length: paragraphs },
      (_, index) =>
        `${prefix} ${index} includes enough formatted specification detail for chunking and retrieval across a longer body of markdown task text.`,
    ).join("\n\n");
  }

  function createConstantEmbeddingModel(value: number) {
    return {
      async embed() {
        const vector = Array.from({ length: 384 }, () => 0);
        vector[0] = value;
        return {
          modelPath: "constant-test-embedding-model",
          dimensions: 384,
          vector,
        };
      },
    };
  }

  function insertSearchVectorChunks(input: {
    client: DatabaseClient;
    projectId: string;
    boardId: string;
    taskId: string;
    sourceId: string;
    chunks: number;
    vectorValue: number;
  }) {
    for (let index = 0; index < input.chunks; index += 1) {
      const document = input.client.db
        .insert(searchDocuments)
        .values({
          sourceType: "task",
          sourceId: input.sourceId,
          projectId: input.projectId,
          boardId: input.boardId,
          taskId: input.taskId,
          chunkKey: `manual:${index}`,
          title: "Manual search document",
          body: `Manual body ${index}`,
          bodyHash: `manual-hash-${input.sourceId}-${index}`,
          embeddingModel: "manual",
          embeddingDimensions: 384,
          embeddingStatus: "indexed",
          embeddedAt: new Date(),
          metadata: {
            chunkIndex: index,
            chunkCount: input.chunks,
            sourceTextField: "formatted",
          },
        })
        .returning()
        .get();
      input.client.sqlite
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
          input.projectId,
          input.boardId,
          input.taskId,
          "task",
          document.id,
          vectorBuffer(input.vectorValue),
        );
    }
  }

  function vectorBuffer(value: number) {
    const vector = Array.from({ length: 384 }, () => 0);
    vector[0] = value;
    return Buffer.from(new Float32Array(vector).buffer);
  }
});
