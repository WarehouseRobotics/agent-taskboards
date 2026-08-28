import { mkdtempSync, rmSync } from "node:fs";
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
import { MaintenanceService } from "./maintenance-service.js";

describe("MaintenanceService", () => {
  let tmpDir: string;
  let client: DatabaseClient;
  let maintenance: MaintenanceService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "taskboards-maintenance-"));
    const databasePath = join(tmpDir, "test.sqlite");
    runMigrations({
      databasePath,
      migrationsDir: resolve(process.cwd(), "drizzle"),
    });
    client = createDatabaseClient(databasePath);
    maintenance = new MaintenanceService(client);
  });

  afterEach(() => {
    client.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reports an empty database without attributed project data", () => {
    const report = maintenance.getStorageReport();

    expect(report.projects).toEqual([]);
    expect(report.active).toEqual({
      dataBytes: 0,
      embeddingBytes: 0,
      totalBytes: 0,
    });
    expect(report.archived.totalBytes).toBe(0);
    expect(report.database.attributedBytes).toBe(0);
    expect(report.database.databaseBytes).toBeGreaterThan(0);
    expect(report.database.unattributedBytes).toBe(
      report.database.databaseBytes,
    );
  });

  it("attributes canonical data and allocated vectors with inherited archive state", () => {
    const now = new Date("2026-08-28T10:00:00.000Z");
    const activeProject = client.db
      .insert(projects)
      .values({ id: "project-active", name: "active-project" })
      .returning()
      .get();
    const archivedProject = client.db
      .insert(projects)
      .values({
        id: "project-archived",
        name: "archived-project",
        archivedAt: now,
      })
      .returning()
      .get();

    const activeBoard = insertBoard(activeProject.id, "board-active", "active-board");
    const archivedBoard = insertBoard(
      activeProject.id,
      "board-archived",
      "archived-board",
      now,
    );
    const inheritedBoard = insertBoard(
      archivedProject.id,
      "board-inherited",
      "inherited-board",
    );

    const activeColumn = insertColumn(activeBoard.id, "column-active");
    const archivedBoardColumn = insertColumn(archivedBoard.id, "column-board-archived");
    const inheritedColumn = insertColumn(inheritedBoard.id, "column-project-archived");

    const activeTask = insertTask({
      id: "task-active",
      projectId: activeProject.id,
      boardId: activeBoard.id,
      columnId: activeColumn.id,
    });
    const archivedTask = insertTask({
      id: "task-archived",
      projectId: activeProject.id,
      boardId: activeBoard.id,
      columnId: activeColumn.id,
      archivedAt: now,
    });
    const boardInheritedTask = insertTask({
      id: "task-board-inherited",
      projectId: activeProject.id,
      boardId: archivedBoard.id,
      columnId: archivedBoardColumn.id,
    });
    const projectInheritedTask = insertTask({
      id: "task-project-inherited",
      projectId: archivedProject.id,
      boardId: inheritedBoard.id,
      columnId: inheritedColumn.id,
    });

    client.db.insert(taskComments).values({
      id: "comment-active",
      projectId: activeProject.id,
      boardId: activeBoard.id,
      taskId: activeTask.id,
      authorType: "agent",
      body: "An active comment",
    }).run();
    client.db.insert(taskComments).values({
      id: "comment-archived",
      projectId: activeProject.id,
      boardId: activeBoard.id,
      taskId: archivedTask.id,
      authorType: "agent",
      body: "A comment inherited from an archived task",
    }).run();
    client.db.insert(taskActivity).values({
      id: "activity-archived-board",
      projectId: activeProject.id,
      boardId: archivedBoard.id,
      taskId: boardInheritedTask.id,
      eventType: "task.created",
      summary: "Inherited from the archived board",
    }).run();
    client.db.insert(taskAttachments).values({
      id: "attachment-active",
      projectId: activeProject.id,
      boardId: activeBoard.id,
      taskId: activeTask.id,
      relativePath: "tasks/task-active/large.bin",
      originalName: "large.bin",
      contentType: "application/octet-stream",
      sizeBytes: 999_000_000,
    }).run();
    client.db.insert(boardCheckpoints).values({
      id: "checkpoint-active",
      projectId: activeProject.id,
      boardId: activeBoard.id,
      name: "Large checkpoint",
      snapshotVersion: 1,
      snapshot: { content: "x".repeat(2_000) },
      summary: { tasks: 2 },
      creatorType: "agent",
    }).run();

    insertSearchDocumentWithVector(activeBoard.id, null, "board", activeBoard.id);
    insertSearchDocumentWithVector(activeBoard.id, activeTask.id, "task", activeTask.id);
    insertSearchDocumentWithVector(activeBoard.id, archivedTask.id, "task", archivedTask.id);
    insertSearchDocumentWithVector(
      archivedBoard.id,
      boardInheritedTask.id,
      "task",
      boardInheritedTask.id,
    );
    insertSearchDocumentWithVector(
      inheritedBoard.id,
      projectInheritedTask.id,
      "task",
      projectInheritedTask.id,
    );

    const report = maintenance.getStorageReport();
    const activeProjectUsage = report.projects.find(
      (project) => project.id === activeProject.id,
    );
    const archivedProjectUsage = report.projects.find(
      (project) => project.id === archivedProject.id,
    );
    const activeBoardUsage = activeProjectUsage?.boards.find(
      (board) => board.id === activeBoard.id,
    );
    const archivedBoardUsage = activeProjectUsage?.boards.find(
      (board) => board.id === archivedBoard.id,
    );

    expect(report.projects.map((project) => project.name)).toEqual([
      "active-project",
      "archived-project",
    ]);
    expect(activeBoardUsage?.active.dataBytes).toBeGreaterThan(2_000);
    expect(activeBoardUsage?.active.dataBytes).toBeLessThan(1_000_000);
    expect(activeBoardUsage?.archived.dataBytes).toBeGreaterThan(0);
    expect(archivedBoardUsage?.active.totalBytes).toBe(0);
    expect(archivedBoardUsage?.archived.totalBytes).toBeGreaterThan(0);
    expect(archivedProjectUsage?.active.totalBytes).toBe(0);
    expect(archivedProjectUsage?.archived.totalBytes).toBeGreaterThan(0);

    const vectorChunkBytes = 1024 * 384 * 4 + 128 + 8192;
    expect(report.active.embeddingBytes).toBeGreaterThanOrEqual(
      vectorChunkBytes * 2,
    );
    expect(report.archived.embeddingBytes).toBeGreaterThanOrEqual(
      vectorChunkBytes * 3,
    );
    expect(report.database.attributedBytes).toBe(
      report.active.totalBytes + report.archived.totalBytes,
    );
    expect(report.database.unattributedBytes).toBe(
      report.database.databaseBytes - report.database.attributedBytes,
    );
    expect(report.projects.reduce((sum, project) => sum + project.totalBytes, 0)).toBe(
      report.database.attributedBytes,
    );
  });

  function insertBoard(
    projectId: string,
    id: string,
    name: string,
    archivedAt?: Date,
  ) {
    return client.db
      .insert(boards)
      .values({ id, projectId, name, archivedAt })
      .returning()
      .get();
  }

  function insertColumn(boardId: string, id: string) {
    return client.db
      .insert(boardColumns)
      .values({ id, boardId, key: "todo", name: "Todo", position: 0 })
      .returning()
      .get();
  }

  function insertTask(input: {
    id: string;
    projectId: string;
    boardId: string;
    columnId: string;
    archivedAt?: Date;
  }) {
    return client.db
      .insert(tasks)
      .values({
        ...input,
        title: input.id,
        position: 0,
      })
      .returning()
      .get();
  }

  function insertSearchDocumentWithVector(
    boardId: string,
    taskId: string | null,
    sourceType: "board" | "task",
    sourceId: string,
  ) {
    const board = client.db.select().from(boards).all().find((item) => item.id === boardId);
    if (!board) {
      throw new Error("Expected board fixture");
    }

    const document = client.db
      .insert(searchDocuments)
      .values({
        id: `search-${sourceId}`,
        sourceType,
        sourceId,
        projectId: board.projectId,
        boardId,
        taskId,
        chunkKey: "0",
        title: sourceId,
        body: `Search body for ${sourceId}`,
        bodyHash: `hash-${sourceId}`,
        embeddingModel: "test",
        embeddingDimensions: 384,
        embeddingStatus: "indexed",
      })
      .returning()
      .get();

    client.sqlite
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
        board.projectId,
        boardId,
        taskId,
        sourceType,
        document.id,
        Buffer.from(new Float32Array(384).buffer),
      );
  }
});
