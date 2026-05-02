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

  function createMigratedClient() {
    tmpDir = mkdtempSync(join(tmpdir(), "taskboards-search-"));
    const databasePath = join(tmpDir, "test.sqlite");
    runMigrations({
      databasePath,
      migrationsDir: resolve(process.cwd(), "drizzle"),
    });
    return createDatabaseClient(databasePath);
  }
});
