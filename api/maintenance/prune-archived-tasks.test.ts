import { eq } from "drizzle-orm";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import {
  boardCheckpoints,
  boardColumns,
  boards,
  projects,
  searchDocuments,
  taskActivity,
  taskAttachments,
  taskComments,
  tasks,
} from "../db/schema.js";
import {
  pruneArchivedTasks,
  pruneArchivedTasksConfirmation,
} from "./prune-archived-tasks.js";

describe("pruneArchivedTasks", () => {
  let tmpDir: string | undefined;
  let databasePath: string;
  let uploadsPath: string;
  let client: DatabaseClient | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "taskboards-prune-"));
    databasePath = join(tmpDir, "test.sqlite");
    uploadsPath = join(tmpDir, "uploads");
    runMigrations({
      databasePath,
      migrationsDir: resolve(process.cwd(), "drizzle"),
    });
    client = createDatabaseClient(databasePath);
  });

  afterEach(() => {
    client?.close();
    client = undefined;

    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("dry-runs by default and reports matching archived task rows", async () => {
    const fixture = seedPruneFixture();

    const result = await pruneArchivedTasks({ databasePath, uploadsPath });

    expect(result.mode).toBe("dry-run");
    expect(result.checkpointPolicy).toBe("unchanged");
    expect(result.matched).toEqual({
      tasks: 1,
      comments: 1,
      activity: 1,
      attachments: 1,
      searchDocuments: 2,
    });
    expect(result.deleted).toEqual({
      tasks: 0,
      comments: 0,
      activity: 0,
      attachments: 0,
      searchDocuments: 0,
    });
    expect(result.attachmentFiles).toEqual({
      matched: 1,
      removed: 0,
      missing: 0,
      failed: 0,
      failures: [],
    });
    expect(existsSync(fixture.archivedAttachmentFile)).toBe(true);
    expect(taskCount(fixture.archivedTaskId)).toBe(1);
    expect(taskCount(fixture.activeTaskId)).toBe(1);
  });

  it("refuses execute mode without the exact confirmation token", async () => {
    const fixture = seedPruneFixture();

    await expect(
      pruneArchivedTasks({ execute: true, databasePath, uploadsPath }),
    ).rejects.toThrow(/Refusing to prune archived tasks/);

    expect(existsSync(fixture.archivedAttachmentFile)).toBe(true);
    expect(taskCount(fixture.archivedTaskId)).toBe(1);
    expect(searchVectorCount()).toBe(3);
  });

  it("deletes archived tasks and cascaded rows while preserving active rows and checkpoints", async () => {
    const fixture = seedPruneFixture();

    const result = await pruneArchivedTasks({
      execute: true,
      confirm: pruneArchivedTasksConfirmation,
      databasePath,
      uploadsPath,
    });

    expect(result.mode).toBe("execute");
    expect(result.matched).toEqual({
      tasks: 1,
      comments: 1,
      activity: 1,
      attachments: 1,
      searchDocuments: 2,
    });
    expect(result.deleted).toEqual(result.matched);
    expect(result.attachmentFiles).toEqual({
      matched: 1,
      removed: 1,
      missing: 0,
      failed: 0,
      failures: [],
    });

    expect(existsSync(fixture.archivedAttachmentFile)).toBe(false);
    expect(existsSync(fixture.activeAttachmentFile)).toBe(true);
    expect(taskCount(fixture.archivedTaskId)).toBe(0);
    expect(taskCount(fixture.activeTaskId)).toBe(1);
    expect(childCount("task_comments", fixture.archivedTaskId)).toBe(0);
    expect(childCount("task_activity", fixture.archivedTaskId)).toBe(0);
    expect(childCount("task_attachments", fixture.archivedTaskId)).toBe(0);
    expect(searchDocumentCount(fixture.archivedTaskId)).toBe(0);
    expect(searchVectorCount()).toBe(1);

    const checkpoint = client?.db
      .select()
      .from(boardCheckpoints)
      .where(eq(boardCheckpoints.id, fixture.checkpointId))
      .get();
    expect(checkpoint?.snapshot).toEqual({
      tasks: [{ id: fixture.archivedTaskId, archivedAt: "2026-01-01T00:00:00.000Z" }],
    });
  });

  function seedPruneFixture() {
    const db = expectClient().db;
    const project = db
      .insert(projects)
      .values({ name: "prune-project" })
      .returning()
      .get();
    const board = db
      .insert(boards)
      .values({ projectId: project.id, name: "maintenance" })
      .returning()
      .get();
    const column = db
      .insert(boardColumns)
      .values({ boardId: board.id, key: "done", name: "Done", position: 0 })
      .returning()
      .get();
    const archivedAt = new Date("2026-01-01T00:00:00.000Z");
    const archivedTask = db
      .insert(tasks)
      .values({
        projectId: project.id,
        boardId: board.id,
        columnId: column.id,
        title: "Archived task",
        position: 0,
        archivedAt,
      })
      .returning()
      .get();
    const activeTask = db
      .insert(tasks)
      .values({
        projectId: project.id,
        boardId: board.id,
        columnId: column.id,
        title: "Active task",
        position: 1,
      })
      .returning()
      .get();

    db.insert(taskComments)
      .values({
        projectId: project.id,
        boardId: board.id,
        taskId: archivedTask.id,
        authorType: "agent",
        body: "Archived comment",
      })
      .run();
    db.insert(taskActivity)
      .values({
        projectId: project.id,
        boardId: board.id,
        taskId: archivedTask.id,
        eventType: "task.archived",
        summary: "Task was archived",
      })
      .run();

    const archivedAttachmentPath = `tasks/${archivedTask.id}/evidence.txt`;
    const activeAttachmentPath = `tasks/${activeTask.id}/evidence.txt`;
    writeAttachmentFile(archivedAttachmentPath, "archived evidence");
    writeAttachmentFile(activeAttachmentPath, "active evidence");
    db.insert(taskAttachments)
      .values({
        projectId: project.id,
        boardId: board.id,
        taskId: archivedTask.id,
        relativePath: archivedAttachmentPath,
        originalName: "evidence.txt",
        contentType: "text/plain",
        sizeBytes: 17,
      })
      .run();
    db.insert(taskAttachments)
      .values({
        projectId: project.id,
        boardId: board.id,
        taskId: activeTask.id,
        relativePath: activeAttachmentPath,
        originalName: "evidence.txt",
        contentType: "text/plain",
        sizeBytes: 15,
      })
      .run();

    insertSearchDocumentWithVector(archivedTask.id, archivedTask.id, "task");
    insertSearchDocumentWithVector("archived-comment", archivedTask.id, "comment");
    insertSearchDocumentWithVector(activeTask.id, activeTask.id, "task");

    const checkpoint = db
      .insert(boardCheckpoints)
      .values({
        projectId: project.id,
        boardId: board.id,
        name: "Before prune",
        snapshotVersion: 1,
        snapshot: {
          tasks: [{ id: archivedTask.id, archivedAt: archivedAt.toISOString() }],
        },
        summary: { tasks: 2, archivedTasks: 1 },
        creatorType: "human",
      })
      .returning()
      .get();

    return {
      activeTaskId: activeTask.id,
      archivedTaskId: archivedTask.id,
      checkpointId: checkpoint.id,
      activeAttachmentFile: join(uploadsPath, activeAttachmentPath),
      archivedAttachmentFile: join(uploadsPath, archivedAttachmentPath),
    };
  }

  function insertSearchDocumentWithVector(
    sourceId: string,
    taskId: string,
    sourceType: "task" | "comment",
  ) {
    const document = expectClient().db
      .insert(searchDocuments)
      .values({
        sourceType,
        sourceId,
        projectId: expectProjectId(taskId),
        boardId: expectBoardId(taskId),
        taskId,
        chunkKey: `${sourceType}:content`,
        title: sourceId,
        body: sourceId,
        bodyHash: sourceId,
        embeddingModel: "test",
        embeddingDimensions: 384,
        embeddingStatus: "indexed",
      })
      .returning()
      .get();
    expectClient().sqlite
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
        sourceType,
        document.id,
        vectorBuffer(),
      );
  }

  function expectProjectId(taskId: string) {
    const task = expectClient().db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .get();
    if (!task) {
      throw new Error(`Expected task ${taskId}`);
    }
    return task.projectId;
  }

  function expectBoardId(taskId: string) {
    const task = expectClient().db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .get();
    if (!task) {
      throw new Error(`Expected task ${taskId}`);
    }
    return task.boardId;
  }

  function writeAttachmentFile(relativePath: string, content: string) {
    const path = join(uploadsPath, relativePath);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }

  function taskCount(taskId: string) {
    return expectClient().db.select().from(tasks).where(eq(tasks.id, taskId)).all()
      .length;
  }

  function childCount(tableName: "task_comments" | "task_activity" | "task_attachments", taskId: string) {
    const row = expectClient().sqlite
      .prepare(`SELECT count(*) AS count FROM ${tableName} WHERE task_id = ?`)
      .get(taskId) as { count: number };
    return row.count;
  }

  function searchDocumentCount(taskId: string) {
    return expectClient().db
      .select()
      .from(searchDocuments)
      .where(eq(searchDocuments.taskId, taskId))
      .all().length;
  }

  function searchVectorCount() {
    const row = expectClient().sqlite
      .prepare("SELECT count(*) AS count FROM search_document_vectors")
      .get() as { count: number };
    return row.count;
  }

  function vectorBuffer() {
    return Buffer.from(new Float32Array(Array.from({ length: 384 }, () => 0)).buffer);
  }

  function expectClient() {
    if (!client) {
      throw new Error("Expected test database client");
    }
    return client;
  }
});
