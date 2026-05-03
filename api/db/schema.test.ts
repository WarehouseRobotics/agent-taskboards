import { asc, eq } from "drizzle-orm";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "./client.js";
import { runMigrations } from "./migrate.js";
import {
  boardColumns,
  boards,
  projects,
  searchDocuments,
  taskActivity,
  taskAttachments,
  taskComments,
  tasks,
} from "./schema.js";

describe("database schema", () => {
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

  it("rejects SQLite file URI database paths", () => {
    expect(() => createDatabaseClient("file:/tmp/taskboards.sqlite")).toThrow(
      /filesystem path/,
    );
  });

  it("applies migrations and persists the taskboard object graph", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "taskboards-db-"));
    const databasePath = join(tmpDir, "test.sqlite");

    const migrationResult = runMigrations({
      databasePath,
      migrationsDir: resolve(process.cwd(), "drizzle"),
    });

    expect(migrationResult.applied).toContain("0000_initial_schema.sql");

    client = createDatabaseClient(databasePath);
    const { db } = client;

    expect(client.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");

    const project = db
      .insert(projects)
      .values({
        name: "agent-taskboards",
        repositoryPath: "/workspace/agent-taskboards",
      })
      .returning()
      .get();

    const board = db
      .insert(boards)
      .values({
        projectId: project.id,
        name: "implementation",
      })
      .returning()
      .get();

    const readyColumn = db
      .insert(boardColumns)
      .values({
        boardId: board.id,
        key: "ready",
        name: "Ready",
        position: 0,
      })
      .returning()
      .get();

    const doneColumn = db
      .insert(boardColumns)
      .values({
        boardId: board.id,
        key: "done",
        name: "Done",
        position: 1,
        isDone: true,
      })
      .returning()
      .get();

    const task = db
      .insert(tasks)
      .values({
        projectId: project.id,
        boardId: board.id,
        columnId: readyColumn.id,
        title: "Set up database schema",
        description: "Create Drizzle models and migrations.",
        position: 0,
        priority: "high",
        labels: ["database", "drizzle"],
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
        authorName: "Codex",
        body: "Schema created with canonical tables and search metadata.",
      })
      .returning()
      .get();

    const activity = db
      .insert(taskActivity)
      .values({
        projectId: project.id,
        boardId: board.id,
        taskId: task.id,
        actorType: "system",
        eventType: "task.created",
        summary: "Task was created",
        data: { columnId: readyColumn.id },
      })
      .returning()
      .get();

    const attachment = db
      .insert(taskAttachments)
      .values({
        projectId: project.id,
        boardId: board.id,
        taskId: task.id,
        relativePath: `tasks/${task.id}/evidence.txt`,
        originalName: "evidence.txt",
        contentType: "text/plain",
        sizeBytes: 12,
      })
      .returning()
      .get();

    const searchDocument = db
      .insert(searchDocuments)
      .values({
        sourceType: "task",
        sourceId: task.id,
        projectId: project.id,
        boardId: board.id,
        taskId: task.id,
        chunkKey: "task:body",
        title: task.title,
        body: `${task.title}\n${task.description}`,
        bodyHash: "test-hash",
        embeddingStatus: "pending",
      })
      .returning()
      .get();

    const orderedColumns = db
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.boardId, board.id))
      .orderBy(asc(boardColumns.position))
      .all();

    const orderedTasks = db
      .select()
      .from(tasks)
      .where(eq(tasks.columnId, readyColumn.id))
      .orderBy(asc(tasks.position))
      .all();

    expect(orderedColumns.map((column) => column.id)).toEqual([
      readyColumn.id,
      doneColumn.id,
    ]);
    expect(orderedTasks.map((item) => item.id)).toEqual([task.id]);
    expect(comment.taskId).toBe(task.id);
    expect(activity.taskId).toBe(task.id);
    expect(attachment.relativePath).toBe(`tasks/${task.id}/evidence.txt`);
    expect(searchDocument.sourceId).toBe(task.id);
    expect(task.labels).toEqual(["database", "drizzle"]);
  });

  it("bumps updatedAt when Drizzle updates mutable records", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "taskboards-db-"));
    const databasePath = join(tmpDir, "test.sqlite");
    const initialTimestamp = new Date(0);

    runMigrations({
      databasePath,
      migrationsDir: resolve(process.cwd(), "drizzle"),
    });

    client = createDatabaseClient(databasePath);
    const { db } = client;

    const project = db
      .insert(projects)
      .values({
        name: "before-update",
        createdAt: initialTimestamp,
        updatedAt: initialTimestamp,
      })
      .returning()
      .get();

    const updatedProject = db
      .update(projects)
      .set({ description: "Touched by an update" })
      .where(eq(projects.id, project.id))
      .returning()
      .get();

    expect(updatedProject.createdAt).toEqual(initialTimestamp);
    expect(updatedProject.updatedAt.getTime()).toBeGreaterThan(
      initialTimestamp.getTime(),
    );
  });
});
