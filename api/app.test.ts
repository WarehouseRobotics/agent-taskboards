import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDatabaseClient, type DatabaseClient } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import {
  boardColumns,
  boards,
  projects,
  searchDocuments,
  taskActivity,
  taskAttachments,
  taskComments,
  tasks,
} from "./db/schema.js";
import { createFakeEmbeddingModel } from "./testing/fake-embedding-model.js";

describe("starter API", () => {
  let tmpDir: string | undefined;
  let client: DatabaseClient | undefined;
  let server: Server | undefined;
  let baseUrl: string;
  let previousUploadsPath: string | undefined;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "taskboards-api-"));
    const databasePath = join(tmpDir, "test.sqlite");
    previousUploadsPath = process.env.TASKBOARDS_UPLOADS_PATH;
    process.env.TASKBOARDS_UPLOADS_PATH = join(tmpDir, "uploads");
    const migrationResult = runMigrations({
      databasePath,
      migrationsDir: resolve(process.cwd(), "drizzle"),
    });

    client = createDatabaseClient(databasePath);
    const app = createApp({
      databaseClient: client,
      migrationResult,
      embeddingModel: createFakeEmbeddingModel(),
    });

    await new Promise<void>((resolveServer) => {
      server = app.listen(0, "127.0.0.1", resolveServer);
    });

    const runningServer = server;
    if (!runningServer) {
      throw new Error("API test server did not start");
    }

    const address = runningServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolveClose, rejectClose) => {
        server?.close((error) => {
          if (error) {
            rejectClose(error);
            return;
          }

          resolveClose();
        });
      });
      server = undefined;
    }

    client?.close();
    client = undefined;

    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }

    if (previousUploadsPath === undefined) {
      delete process.env.TASKBOARDS_UPLOADS_PATH;
    } else {
      process.env.TASKBOARDS_UPLOADS_PATH = previousUploadsPath;
    }
    previousUploadsPath = undefined;
  });

  it("creates projects, boards with default columns, tasks, comments, and context", async () => {
    const projectResponse = await api("POST", "/api/projects", {
      name: "agent-taskboards",
      description: "Local agent work tracking",
      repositoryPath: "/workspace/agent-taskboards",
      defaultBranch: "main",
      metadata: { owner: "local" },
    });

    expect(projectResponse.status).toBe(201);
    const project = objectProp(projectResponse.body, "project");
    const projectId = stringProp(project, "id");
    expect(stringProp(project, "name")).toBe("agent-taskboards");

    const boardResponse = await api(
      "POST",
      `/api/projects/${projectId}/boards`,
      {
        name: "implementation",
      },
    );

    expect(boardResponse.status).toBe(201);
    const board = objectProp(boardResponse.body, "board");
    const boardId = stringProp(board, "id");
    const columns = arrayProp(board, "columns").map(asObject);
    expect(columns.map((column) => stringProp(column, "key"))).toEqual([
      "backlog",
      "ready",
      "in_progress",
      "blocked",
      "review",
      "done",
    ]);
    expect(booleanProp(columns[5], "isDone")).toBe(true);

    const taskResponse = await api(
      "POST",
      `/api/projects/${projectId}/boards/${boardId}/tasks`,
      {
        title: "Build starter API",
        description: "Expose project, board, task, and comment routes.",
        columnKey: "ready",
        priority: "high",
        labels: ["api", "starter"],
      },
    );

    expect(taskResponse.status).toBe(201);
    const task = objectProp(taskResponse.body, "task");
    const taskId = stringProp(task, "id");
    expect(numberProp(task, "position")).toBe(0);
    expect(stringProp(task, "priority")).toBe("high");

    const commentResponse = await api("POST", `/api/tasks/${taskId}/comments`, {
      authorType: "agent",
      authorName: "Codex",
      body: "First implementation pass is underway.",
    });

    expect(commentResponse.status).toBe(201);
    expect(
      stringProp(objectProp(commentResponse.body, "comment"), "body"),
    ).toBe("First implementation pass is underway.");

    const activityResponse = await api("GET", `/api/tasks/${taskId}/activity`);
    expect(activityResponse.status).toBe(200);
    expect(
      arrayProp(activityResponse.body, "activity").map((item) =>
        stringProp(asObject(item), "eventType"),
      ),
    ).toEqual(["task.created", "comment.created"]);

    const contextResponse = await api("GET", `/api/tasks/${taskId}/context`);
    expect(contextResponse.status).toBe(200);
    expect(stringProp(objectProp(contextResponse.body, "project"), "id")).toBe(
      projectId,
    );
    expect(stringProp(objectProp(contextResponse.body, "board"), "id")).toBe(
      boardId,
    );
    expect(stringProp(objectProp(contextResponse.body, "task"), "id")).toBe(
      taskId,
    );
    expect(arrayProp(contextResponse.body, "comments")).toHaveLength(1);
    expect(arrayProp(contextResponse.body, "activity")).toHaveLength(2);

    if (!client) {
      throw new Error("Expected test database client");
    }

    const indexedDocuments = client.db.select().from(searchDocuments).all();
    expect(
      indexedDocuments.map((document) => document.sourceType).sort(),
    ).toEqual(["board", "comment", "task"]);
    expect(
      indexedDocuments.every(
        (document) => document.embeddingStatus === "indexed",
      ),
    ).toBe(true);
  });

  it("deletes individual task comments with audit activity and search cleanup", async () => {
    const { projectId, boardId } = await createProjectAndBoard();
    const taskResponse = await api(
      "POST",
      `/api/projects/${projectId}/boards/${boardId}/tasks`,
      {
        title: "Delete stale comment",
      },
    );
    const taskId = stringProp(objectProp(taskResponse.body, "task"), "id");
    const commentResponse = await api("POST", `/api/tasks/${taskId}/comments`, {
      authorType: "agent",
      authorName: "Codex",
      authorRef: "local-session",
      body: "This note should be deleted.",
    });
    const commentId = stringProp(
      objectProp(commentResponse.body, "comment"),
      "id",
    );

    if (!client) {
      throw new Error("Expected test database client");
    }

    expect(
      client.db
        .select()
        .from(searchDocuments)
        .where(eq(searchDocuments.sourceId, commentId))
        .all(),
    ).toHaveLength(1);
    expect(searchVectorCount()).toBe(3);

    const wrongTaskResponse = await api(
      "POST",
      `/api/projects/${projectId}/boards/${boardId}/tasks`,
      {
        title: "Wrong task",
      },
    );
    const wrongTaskId = stringProp(
      objectProp(wrongTaskResponse.body, "task"),
      "id",
    );
    const wrongDelete = await api(
      "DELETE",
      `/api/tasks/${wrongTaskId}/comments/${commentId}`,
    );
    expect(wrongDelete.status).toBe(404);

    const deleted = await api(
      "DELETE",
      `/api/tasks/${taskId}/comments/${commentId}`,
    );
    expect(deleted.status).toBe(200);
    expect(stringProp(objectProp(deleted.body, "comment"), "id")).toBe(
      commentId,
    );
    expect(
      stringProp(objectProp(deleted.body, "activity"), "eventType"),
    ).toBe("comment.deleted");

    const afterDeleteComments = await api("GET", `/api/tasks/${taskId}/comments`);
    expect(arrayProp(afterDeleteComments.body, "comments")).toHaveLength(0);

    const activityResponse = await api("GET", `/api/tasks/${taskId}/activity`);
    expect(
      arrayProp(activityResponse.body, "activity").map((item) =>
        stringProp(asObject(item), "eventType"),
      ),
    ).toEqual(["task.created", "comment.created", "comment.deleted"]);
    const deleteActivity = objectProp(deleted.body, "activity");
    const activityData = objectProp(deleteActivity, "data");
    expect(stringProp(activityData, "commentId")).toBe(commentId);
    expect(stringProp(activityData, "authorType")).toBe("agent");
    expect(stringProp(activityData, "authorName")).toBe("Codex");
    expect(activityData).not.toHaveProperty("body");

    expect(
      client.db
        .select()
        .from(searchDocuments)
        .where(eq(searchDocuments.sourceId, commentId))
        .all(),
    ).toHaveLength(0);
    expect(searchVectorCount()).toBe(3);
  });

  it("lists a merged project activity feed with filters, pagination, and archive visibility", async () => {
    const alpha = await createNamedProjectAndBoard("activity-alpha", "alpha-board");
    const beta = await createNamedProjectAndBoard("activity-beta", "beta-board");

    const alphaTaskResponse = await api(
      "POST",
      `/api/projects/${alpha.projectId}/boards/${alpha.boardId}/tasks`,
      { title: "Alpha task" },
    );
    const alphaTask = objectProp(alphaTaskResponse.body, "task");
    const alphaTaskId = stringProp(alphaTask, "id");
    const alphaCreateActivityId = stringProp(
      objectProp(alphaTaskResponse.body, "activity"),
      "id",
    );

    const alphaCommentResponse = await api(
      "POST",
      `/api/tasks/${alphaTaskId}/comments`,
      {
        authorType: "agent",
        authorName: "Codex",
        body: "Alpha handoff note.",
      },
    );
    const alphaCommentId = stringProp(
      objectProp(alphaCommentResponse.body, "comment"),
      "id",
    );
    const alphaCommentActivityId = stringProp(
      objectProp(alphaCommentResponse.body, "activity"),
      "id",
    );

    const betaTaskResponse = await api(
      "POST",
      `/api/projects/${beta.projectId}/boards/${beta.boardId}/tasks`,
      { title: "Beta task" },
    );
    const betaTaskId = stringProp(objectProp(betaTaskResponse.body, "task"), "id");
    const betaCreateActivityId = stringProp(
      objectProp(betaTaskResponse.body, "activity"),
      "id",
    );
    const betaUpdateResponse = await api("PATCH", `/api/tasks/${betaTaskId}`, {
      title: "Beta task updated",
    });
    const betaUpdateActivityId = stringProp(
      objectProp(betaUpdateResponse.body, "activity"),
      "id",
    );

    const archivedTaskResponse = await api(
      "POST",
      `/api/projects/${alpha.projectId}/boards/${alpha.boardId}/tasks`,
      { title: "Archived task" },
    );
    const archivedTaskId = stringProp(
      objectProp(archivedTaskResponse.body, "task"),
      "id",
    );
    const archivedCreateActivityId = stringProp(
      objectProp(archivedTaskResponse.body, "activity"),
      "id",
    );
    const archivedResponse = await api("POST", `/api/tasks/${archivedTaskId}/archive`);
    const archivedActivityId = stringProp(
      objectProp(archivedResponse.body, "activity"),
      "id",
    );

    setActivityCreatedAt(alphaCreateActivityId, "2026-01-01T00:00:00.000Z");
    setCommentCreatedAt(alphaCommentId, "2026-01-02T00:00:00.000Z");
    setActivityCreatedAt(alphaCommentActivityId, "2026-01-02T00:00:00.000Z");
    setActivityCreatedAt(betaCreateActivityId, "2026-01-01T12:00:00.000Z");
    setActivityCreatedAt(betaUpdateActivityId, "2026-01-03T00:00:00.000Z");
    setActivityCreatedAt(archivedCreateActivityId, "2026-01-04T00:00:00.000Z");
    setActivityCreatedAt(archivedActivityId, "2026-01-05T00:00:00.000Z");

    const feed = await api("GET", "/api/activity?limit=10");
    expect(feed.status).toBe(200);
    const items = arrayProp(feed.body, "items").map(asObject);
    expect(items.map((item) => stringProp(item, "id"))).toEqual([
      betaUpdateActivityId,
      alphaCommentId,
      betaCreateActivityId,
      alphaCreateActivityId,
    ]);
    expect(items.map((item) => stringProp(item, "type"))).toEqual([
      "activity",
      "comment",
      "activity",
      "activity",
    ]);
    expect(items.map((item) => item.eventType)).not.toContain("comment.created");
    expect(stringProp(items[1], "body")).toBe("Alpha handoff note.");
    expect(stringProp(objectProp(items[1], "project"), "name")).toBe(
      "activity-alpha",
    );
    expect(stringProp(objectProp(items[2], "project"), "name")).toBe(
      "activity-beta",
    );

    const alphaOnly = await api(
      "GET",
      `/api/activity?projectId=${alpha.projectId}&limit=10`,
    );
    expect(
      arrayProp(alphaOnly.body, "items")
        .map(asObject)
        .every((item) => stringProp(objectProp(item, "project"), "id") === alpha.projectId),
    ).toBe(true);

    const pageOne = await api("GET", "/api/activity?limit=2&offset=0");
    expect(arrayProp(pageOne.body, "items")).toHaveLength(2);
    expect(booleanProp(pageOne.body, "hasMore")).toBe(true);
    expect(numberProp(pageOne.body, "limit")).toBe(2);
    expect(numberProp(pageOne.body, "offset")).toBe(0);

    const pageTwo = await api("GET", "/api/activity?limit=2&offset=2");
    expect(arrayProp(pageTwo.body, "items")).toHaveLength(2);
    expect(booleanProp(pageTwo.body, "hasMore")).toBe(false);

    const withArchived = await api(
      "GET",
      `/api/activity?projectId=${alpha.projectId}&includeArchived=true&limit=10`,
    );
    expect(
      arrayProp(withArchived.body, "items")
        .map(asObject)
        .map((item) => stringProp(item, "id")),
    ).toContain(archivedActivityId);

    const oversizedOffset = await api("GET", "/api/activity?offset=10001");
    expect(oversizedOffset.status).toBe(400);
    expect(stringProp(objectProp(oversizedOffset.body, "error"), "code")).toBe(
      "invalid_request",
    );
  });

  it("moves tasks by column key, reorders positions, and updates completion state", async () => {
    const { projectId, boardId } = await createProjectAndBoard();

    const first = objectProp(
      (
        await api(
          "POST",
          `/api/projects/${projectId}/boards/${boardId}/tasks`,
          {
            title: "First task",
            columnKey: "ready",
          },
        )
      ).body,
      "task",
    );
    const second = objectProp(
      (
        await api(
          "POST",
          `/api/projects/${projectId}/boards/${boardId}/tasks`,
          {
            title: "Second task",
            columnKey: "ready",
          },
        )
      ).body,
      "task",
    );
    const firstTaskId = stringProp(first, "id");
    const secondTaskId = stringProp(second, "id");

    const moveResponse = await api("POST", `/api/tasks/${secondTaskId}/move`, {
      columnKey: "ready",
      position: 0,
    });

    expect(moveResponse.status).toBe(200);
    expect(numberProp(objectProp(moveResponse.body, "task"), "position")).toBe(
      0,
    );

    const tasksResponse = await api(
      "GET",
      `/api/projects/${projectId}/boards/${boardId}/tasks`,
    );
    const taskRows = arrayProp(tasksResponse.body, "tasks").map(asObject);
    expect(taskRows.map((task) => stringProp(task, "id"))).toEqual([
      secondTaskId,
      firstTaskId,
    ]);
    expect(taskRows.map((task) => numberProp(task, "position"))).toEqual([
      0, 1,
    ]);

    const doneResponse = await api("POST", `/api/tasks/${secondTaskId}/move`, {
      columnKey: "done",
    });

    expect(doneResponse.status).toBe(200);
    expect(typeof objectProp(doneResponse.body, "task").completedAt).toBe(
      "string",
    );

    const blockedResponse = await api(
      "POST",
      `/api/tasks/${secondTaskId}/move`,
      {
        columnKey: "blocked",
      },
    );

    expect(blockedResponse.status).toBe(200);
    expect(objectProp(blockedResponse.body, "task").completedAt).toBeNull();
  });

  it("updates task title and description and records activity", async () => {
    const { projectId, boardId } = await createProjectAndBoard();
    const task = objectProp(
      (
        await api(
          "POST",
          `/api/projects/${projectId}/boards/${boardId}/tasks`,
          {
            title: "Original title",
            description: "Original description",
          },
        )
      ).body,
      "task",
    );
    const taskId = stringProp(task, "id");

    const updateResponse = await api("PATCH", `/api/tasks/${taskId}`, {
      title: "Updated title",
      description: null,
    });

    expect(updateResponse.status).toBe(200);
    const updatedTask = objectProp(updateResponse.body, "task");
    expect(stringProp(updatedTask, "title")).toBe("Updated title");
    expect(updatedTask.description).toBeNull();
    expect(
      stringProp(objectProp(updateResponse.body, "activity"), "eventType"),
    ).toBe("task.updated");

    const blankTitle = await api("PATCH", `/api/tasks/${taskId}`, {
      title: " ",
    });
    expect(blankTitle.status).toBe(400);

    const activityResponse = await api("GET", `/api/tasks/${taskId}/activity`);
    expect(
      arrayProp(activityResponse.body, "activity").map((item) =>
        stringProp(asObject(item), "eventType"),
      ),
    ).toEqual(["task.created", "task.updated"]);
  });

  it("uploads, serves, lists, and deletes task attachments", async () => {
    const { projectId, boardId } = await createProjectAndBoard();
    const task = objectProp(
      (
        await api(
          "POST",
          `/api/projects/${projectId}/boards/${boardId}/tasks`,
          {
            title: "Attach evidence",
          },
        )
      ).body,
      "task",
    );
    const taskId = stringProp(task, "id");

    const missingFile = await fetch(
      `${baseUrl}/api/tasks/${taskId}/attachments`,
      { method: "POST", body: new FormData() },
    );
    expect(missingFile.status).toBe(400);

    const upload = await uploadFile(
      `/api/tasks/${taskId}/attachments`,
      "notes.txt",
      "hello attachment",
      "text/plain",
    );
    expect(upload.status).toBe(201);
    const attachment = objectProp(upload.body, "attachment");
    const attachmentId = stringProp(attachment, "id");
    const relativePath = stringProp(attachment, "relativePath");
    expect(stringProp(attachment, "url")).toBe(`/uploads/${relativePath}`);
    expect(numberProp(attachment, "sizeBytes")).toBe("hello attachment".length);

    const uploadsPath = process.env.TASKBOARDS_UPLOADS_PATH;
    if (!uploadsPath) {
      throw new Error("Expected uploads path for test");
    }
    const storedPath = join(uploadsPath, relativePath);
    expect(readFileSync(storedPath, "utf8")).toBe("hello attachment");

    const served = await fetch(`${baseUrl}/uploads/${relativePath}`);
    expect(served.status).toBe(200);
    expect(await served.text()).toBe("hello attachment");

    const list = await api("GET", `/api/tasks/${taskId}/attachments`);
    expect(arrayProp(list.body, "attachments")).toHaveLength(1);

    const context = await api("GET", `/api/tasks/${taskId}/context`);
    expect(arrayProp(context.body, "attachments")).toHaveLength(1);

    const wrongTask = objectProp(
      (
        await api(
          "POST",
          `/api/projects/${projectId}/boards/${boardId}/tasks`,
          {
            title: "Wrong task",
          },
        )
      ).body,
      "task",
    );
    const wrongDelete = await api(
      "DELETE",
      `/api/tasks/${stringProp(wrongTask, "id")}/attachments/${attachmentId}`,
    );
    expect(wrongDelete.status).toBe(404);

    const deleted = await api(
      "DELETE",
      `/api/tasks/${taskId}/attachments/${attachmentId}`,
    );
    expect(deleted.status).toBe(200);
    expect(
      stringProp(objectProp(deleted.body, "activity"), "eventType"),
    ).toBe("attachment.deleted");
    expect(existsSync(storedPath)).toBe(false);

    const afterDelete = await api("GET", `/api/tasks/${taskId}/attachments`);
    expect(arrayProp(afterDelete.body, "attachments")).toHaveLength(0);

    const activityResponse = await api("GET", `/api/tasks/${taskId}/activity`);
    expect(
      arrayProp(activityResponse.body, "activity").map((item) =>
        stringProp(asObject(item), "eventType"),
      ),
    ).toEqual(["task.created", "attachment.created", "attachment.deleted"]);
  });

  it("archives active resources and hides them unless includeArchived is true", async () => {
    const { projectId, boardId } = await createProjectAndBoard();
    const task = objectProp(
      (
        await api(
          "POST",
          `/api/projects/${projectId}/boards/${boardId}/tasks`,
          {
            title: "Archive me",
          },
        )
      ).body,
      "task",
    );
    const taskId = stringProp(task, "id");

    const archiveResponse = await api("POST", `/api/tasks/${taskId}/archive`);
    expect(archiveResponse.status).toBe(200);
    expect(typeof objectProp(archiveResponse.body, "task").archivedAt).toBe(
      "string",
    );

    const activeTasks = await api(
      "GET",
      `/api/projects/${projectId}/boards/${boardId}/tasks`,
    );
    expect(arrayProp(activeTasks.body, "tasks")).toHaveLength(0);

    const allTasks = await api(
      "GET",
      `/api/projects/${projectId}/boards/${boardId}/tasks?includeArchived=true`,
    );
    expect(arrayProp(allTasks.body, "tasks")).toHaveLength(1);

    const activeRead = await api("GET", `/api/tasks/${taskId}`);
    expect(activeRead.status).toBe(404);

    const archivedRead = await api(
      "GET",
      `/api/tasks/${taskId}?includeArchived=true`,
    );
    expect(archivedRead.status).toBe(200);
  });

  it("hard-deletes boards and projects with related rows, vectors, and attachment files", async () => {
    const { projectId, boardId } = await createProjectAndBoard();
    const task = objectProp(
      (
        await api(
          "POST",
          `/api/projects/${projectId}/boards/${boardId}/tasks`,
          {
            title: "Delete the whole board",
            description: "This task should disappear with the board.",
          },
        )
      ).body,
      "task",
    );
    const taskId = stringProp(task, "id");
    await api("POST", `/api/tasks/${taskId}/comments`, {
      authorType: "agent",
      body: "This comment should cascade away.",
    });

    const upload = await uploadFile(
      `/api/tasks/${taskId}/attachments`,
      "board-notes.txt",
      "board attachment",
      "text/plain",
    );
    const boardAttachmentPath = stringProp(
      objectProp(upload.body, "attachment"),
      "relativePath",
    );
    const uploadsPath = process.env.TASKBOARDS_UPLOADS_PATH;
    if (!uploadsPath) {
      throw new Error("Expected uploads path for test");
    }
    const boardAttachmentFile = join(uploadsPath, boardAttachmentPath);
    expect(existsSync(boardAttachmentFile)).toBe(true);

    const deletedBoard = await api(
      "DELETE",
      `/api/projects/${projectId}/boards/${boardId}`,
    );
    expect(deletedBoard.status).toBe(200);
    expect(stringProp(objectProp(deletedBoard.body, "board"), "id")).toBe(
      boardId,
    );
    expect(
      numberProp(objectProp(deletedBoard.body, "deleted"), "attachmentFiles"),
    ).toBe(1);
    expect(existsSync(boardAttachmentFile)).toBe(false);

    const missingBoard = await api(
      "GET",
      `/api/projects/${projectId}/boards/${boardId}?includeArchived=true`,
    );
    expect(missingBoard.status).toBe(404);
    const missingTask = await api(
      "GET",
      `/api/tasks/${taskId}?includeArchived=true`,
    );
    expect(missingTask.status).toBe(404);

    if (!client) {
      throw new Error("Expected test database client");
    }
    expect(
      client.db.select().from(projects).where(eq(projects.id, projectId)).all(),
    ).toHaveLength(1);
    expect(
      client.db.select().from(boards).where(eq(boards.id, boardId)).all(),
    ).toHaveLength(0);
    expect(
      client.db
        .select()
        .from(boardColumns)
        .where(eq(boardColumns.boardId, boardId))
        .all(),
    ).toHaveLength(0);
    expect(
      client.db.select().from(tasks).where(eq(tasks.id, taskId)).all(),
    ).toHaveLength(0);
    expect(
      client.db
        .select()
        .from(taskComments)
        .where(eq(taskComments.taskId, taskId))
        .all(),
    ).toHaveLength(0);
    expect(
      client.db
        .select()
        .from(taskActivity)
        .where(eq(taskActivity.taskId, taskId))
        .all(),
    ).toHaveLength(0);
    expect(
      client.db
        .select()
        .from(taskAttachments)
        .where(eq(taskAttachments.taskId, taskId))
        .all(),
    ).toHaveLength(0);
    expect(client.db.select().from(searchDocuments).all()).toHaveLength(0);
    expect(searchVectorCount()).toBe(0);

    const deletedProject = objectProp(
      (await api("POST", "/api/projects", { name: "project-delete" })).body,
      "project",
    );
    const deletedProjectId = stringProp(deletedProject, "id");
    const deletedProjectBoard = objectProp(
      (
        await api("POST", `/api/projects/${deletedProjectId}/boards`, {
          name: "project-delete-board",
        })
      ).body,
      "board",
    );
    const deletedProjectBoardId = stringProp(deletedProjectBoard, "id");
    const deletedProjectTask = objectProp(
      (
        await api(
          "POST",
          `/api/projects/${deletedProjectId}/boards/${deletedProjectBoardId}/tasks`,
          { title: "Delete with project" },
        )
      ).body,
      "task",
    );
    const deletedProjectTaskId = stringProp(deletedProjectTask, "id");
    await api("POST", `/api/tasks/${deletedProjectTaskId}/comments`, {
      authorType: "agent",
      body: "Project-level delete should remove this too.",
    });
    const projectUpload = await uploadFile(
      `/api/tasks/${deletedProjectTaskId}/attachments`,
      "project-notes.txt",
      "project attachment",
      "text/plain",
    );
    const projectAttachmentPath = stringProp(
      objectProp(projectUpload.body, "attachment"),
      "relativePath",
    );
    const projectAttachmentFile = join(uploadsPath, projectAttachmentPath);
    expect(existsSync(projectAttachmentFile)).toBe(true);

    const deleted = await api("DELETE", `/api/projects/${deletedProjectId}`);
    expect(deleted.status).toBe(200);
    expect(stringProp(objectProp(deleted.body, "project"), "id")).toBe(
      deletedProjectId,
    );
    expect(
      numberProp(objectProp(deleted.body, "deleted"), "attachmentFiles"),
    ).toBe(1);
    expect(existsSync(projectAttachmentFile)).toBe(false);

    expect(
      client.db
        .select()
        .from(projects)
        .where(eq(projects.id, deletedProjectId))
        .all(),
    ).toHaveLength(0);
    expect(
      client.db
        .select()
        .from(boards)
        .where(eq(boards.projectId, deletedProjectId))
        .all(),
    ).toHaveLength(0);
    expect(
      client.db
        .select()
        .from(tasks)
        .where(eq(tasks.projectId, deletedProjectId))
        .all(),
    ).toHaveLength(0);
    expect(
      client.db
        .select()
        .from(taskAttachments)
        .where(eq(taskAttachments.projectId, deletedProjectId))
        .all(),
    ).toHaveLength(0);
    expect(client.db.select().from(searchDocuments).all()).toHaveLength(0);
    expect(searchVectorCount()).toBe(0);
  });

  it("keeps unrelated projects and boards when hard-deleting scoped resources", async () => {
    const project = objectProp(
      (await api("POST", "/api/projects", { name: "scoped-delete" })).body,
      "project",
    );
    const projectId = stringProp(project, "id");
    const targetBoard = objectProp(
      (
        await api("POST", `/api/projects/${projectId}/boards`, {
          name: "target-board",
        })
      ).body,
      "board",
    );
    const targetBoardId = stringProp(targetBoard, "id");
    const siblingBoard = objectProp(
      (
        await api("POST", `/api/projects/${projectId}/boards`, {
          name: "sibling-board",
        })
      ).body,
      "board",
    );
    const siblingBoardId = stringProp(siblingBoard, "id");

    const otherProject = objectProp(
      (await api("POST", "/api/projects", { name: "unrelated-project" })).body,
      "project",
    );
    const otherProjectId = stringProp(otherProject, "id");
    const otherBoard = objectProp(
      (
        await api("POST", `/api/projects/${otherProjectId}/boards`, {
          name: "unrelated-board",
        })
      ).body,
      "board",
    );
    const otherBoardId = stringProp(otherBoard, "id");

    const uploadsPath = process.env.TASKBOARDS_UPLOADS_PATH;
    if (!uploadsPath) {
      throw new Error("Expected uploads path for test");
    }

    const target = await createTaskCommentAndAttachment(
      projectId,
      targetBoardId,
      "Delete only this board",
      "target.txt",
    );
    const sibling = await createTaskCommentAndAttachment(
      projectId,
      siblingBoardId,
      "Keep this sibling board",
      "sibling.txt",
    );
    const other = await createTaskCommentAndAttachment(
      otherProjectId,
      otherBoardId,
      "Keep this other project",
      "other.txt",
    );

    const targetAttachmentFile = join(uploadsPath, target.attachmentPath);
    const siblingAttachmentFile = join(uploadsPath, sibling.attachmentPath);
    const otherAttachmentFile = join(uploadsPath, other.attachmentPath);
    expect(existsSync(targetAttachmentFile)).toBe(true);
    expect(existsSync(siblingAttachmentFile)).toBe(true);
    expect(existsSync(otherAttachmentFile)).toBe(true);

    const deletedBoard = await api(
      "DELETE",
      `/api/projects/${projectId}/boards/${targetBoardId}`,
    );
    expect(deletedBoard.status).toBe(200);
    expect(existsSync(targetAttachmentFile)).toBe(false);

    if (!client) {
      throw new Error("Expected test database client");
    }

    expect(
      client.db.select().from(boards).where(eq(boards.id, siblingBoardId)).all(),
    ).toHaveLength(1);
    expect(
      client.db.select().from(tasks).where(eq(tasks.id, sibling.taskId)).all(),
    ).toHaveLength(1);
    expect(
      client.db
        .select()
        .from(taskComments)
        .where(eq(taskComments.id, sibling.commentId))
        .all(),
    ).toHaveLength(1);
    expect(
      client.db.select().from(boards).where(eq(boards.id, otherBoardId)).all(),
    ).toHaveLength(1);
    expect(
      client.db.select().from(tasks).where(eq(tasks.id, other.taskId)).all(),
    ).toHaveLength(1);
    expect(
      client.db
        .select()
        .from(searchDocuments)
        .where(eq(searchDocuments.sourceId, siblingBoardId))
        .all(),
    ).toHaveLength(1);
    expect(
      client.db
        .select()
        .from(searchDocuments)
        .where(eq(searchDocuments.sourceId, other.taskId))
        .all(),
    ).toHaveLength(1);
    expect(existsSync(siblingAttachmentFile)).toBe(true);
    expect(existsSync(otherAttachmentFile)).toBe(true);

    const deletedProject = await api("DELETE", `/api/projects/${projectId}`);
    expect(deletedProject.status).toBe(200);
    expect(existsSync(siblingAttachmentFile)).toBe(false);

    expect(
      client.db
        .select()
        .from(projects)
        .where(eq(projects.id, otherProjectId))
        .all(),
    ).toHaveLength(1);
    expect(
      client.db.select().from(boards).where(eq(boards.id, otherBoardId)).all(),
    ).toHaveLength(1);
    expect(
      client.db.select().from(tasks).where(eq(tasks.id, other.taskId)).all(),
    ).toHaveLength(1);
    expect(
      client.db
        .select()
        .from(taskComments)
        .where(eq(taskComments.id, other.commentId))
        .all(),
    ).toHaveLength(1);
    expect(
      client.db
        .select()
        .from(taskAttachments)
        .where(eq(taskAttachments.taskId, other.taskId))
        .all(),
    ).toHaveLength(1);
    expect(
      client.db
        .select()
        .from(searchDocuments)
        .where(eq(searchDocuments.sourceId, otherBoardId))
        .all(),
    ).toHaveLength(1);
    expect(
      client.db
        .select()
        .from(searchDocuments)
        .where(eq(searchDocuments.sourceId, other.taskId))
        .all(),
    ).toHaveLength(1);
    expect(
      client.db
        .select()
        .from(searchDocuments)
        .where(eq(searchDocuments.sourceId, other.commentId))
        .all(),
    ).toHaveLength(1);
    expect(searchVectorCount()).toBe(3);
    expect(existsSync(otherAttachmentFile)).toBe(true);
  });

  it("searches indexed boards, tasks, and comments and respects archived filters", async () => {
    const projectResponse = await api("POST", "/api/projects", {
      name: "search-project",
    });
    const projectId = stringProp(
      objectProp(projectResponse.body, "project"),
      "id",
    );
    const boardResponse = await api(
      "POST",
      `/api/projects/${projectId}/boards`,
      {
        name: "vector-search-board",
        description: "SQLite migration planning",
      },
    );
    const board = objectProp(boardResponse.body, "board");
    const boardId = stringProp(board, "id");
    const taskResponse = await api(
      "POST",
      `/api/projects/${projectId}/boards/${boardId}/tasks`,
      {
        title: "SQLite migration blocker",
        description: "Debug sqlite-vec virtual table setup",
        priority: "urgent",
        labels: ["sqlite", "vector"],
      },
    );
    const task = objectProp(taskResponse.body, "task");
    const taskId = stringProp(task, "id");
    await api("POST", `/api/tasks/${taskId}/comments`, {
      authorType: "agent",
      body: "Blocked on vector search result filtering.",
    });

    const taskSearch = await api("POST", "/api/search", {
      query: "sqlite migration",
      sourceTypes: ["task"],
      limit: 1,
    });

    expect(taskSearch.status).toBe(200);
    const taskResults = arrayProp(taskSearch.body, "results").map(asObject);
    expect(taskResults).toHaveLength(1);
    expect(stringProp(taskResults[0], "sourceId")).toBe(taskId);

    const commentSearch = await api("POST", "/api/search", {
      query: "blocked vector filtering",
      sourceTypes: ["comment"],
      boardId,
    });
    expect(commentSearch.status).toBe(200);
    expect(
      stringProp(
        asObject(arrayProp(commentSearch.body, "results")[0]),
        "sourceType",
      ),
    ).toBe("comment");

    await api("POST", `/api/tasks/${taskId}/archive`);

    const activeSearch = await api("POST", "/api/search", {
      query: "sqlite migration",
      sourceTypes: ["task"],
    });
    expect(arrayProp(activeSearch.body, "results")).toHaveLength(0);

    const archivedSearch = await api("POST", "/api/search", {
      query: "sqlite migration",
      sourceTypes: ["task"],
      includeArchived: true,
    });
    expect(arrayProp(archivedSearch.body, "results")).toHaveLength(1);
  });

  it("enforces URL-safe unique project and board names", async () => {
    const invalidProject = await api("POST", "/api/projects", {
      name: "Agent Taskboards",
    });
    expect(invalidProject.status).toBe(400);

    const project = objectProp(
      (await api("POST", "/api/projects", { name: "unique-project" })).body,
      "project",
    );
    const projectId = stringProp(project, "id");

    const duplicateProject = await api("POST", "/api/projects", {
      name: "unique-project",
    });
    expect(duplicateProject.status).toBe(409);
    expect(
      stringProp(objectProp(duplicateProject.body, "error"), "code"),
    ).toBe("invalid_state");

    const invalidProjectUpdate = await api("PATCH", `/api/projects/${projectId}`, {
      name: "bug triage",
    });
    expect(invalidProjectUpdate.status).toBe(400);

    const invalidBoard = await api("POST", `/api/projects/${projectId}/boards`, {
      name: "board/one",
    });
    expect(invalidBoard.status).toBe(400);

    const board = objectProp(
      (
        await api("POST", `/api/projects/${projectId}/boards`, {
          name: "board-one",
        })
      ).body,
      "board",
    );
    const boardId = stringProp(board, "id");

    const duplicateBoard = await api("POST", `/api/projects/${projectId}/boards`, {
      name: "board-one",
    });
    expect(duplicateBoard.status).toBe(409);
    expect(stringProp(objectProp(duplicateBoard.body, "error"), "code")).toBe(
      "invalid_state",
    );

    const invalidBoardUpdate = await api(
      "PATCH",
      `/api/projects/${projectId}/boards/${boardId}`,
      { name: "bug triage" },
    );
    expect(invalidBoardUpdate.status).toBe(400);
  });

  it("rejects invalid bodies and columns from the wrong board", async () => {
    const { projectId, boardId } = await createProjectAndBoard();
    const secondBoard = objectProp(
      (
        await api("POST", `/api/projects/${projectId}/boards`, {
          name: "other-board",
        })
      ).body,
      "board",
    );
    const secondBoardColumns = arrayProp(secondBoard, "columns").map(asObject);
    const wrongBoardColumnId = stringProp(secondBoardColumns[0], "id");

    const invalidPriority = await api(
      "POST",
      `/api/projects/${projectId}/boards/${boardId}/tasks`,
      {
        title: "Bad priority",
        priority: "critical",
      },
    );
    expect(invalidPriority.status).toBe(400);
    expect(stringProp(objectProp(invalidPriority.body, "error"), "code")).toBe(
      "invalid_request",
    );

    const wrongColumn = await api(
      "POST",
      `/api/projects/${projectId}/boards/${boardId}/tasks`,
      {
        title: "Wrong board column",
        columnId: wrongBoardColumnId,
      },
    );
    expect(wrongColumn.status).toBe(404);
    expect(stringProp(objectProp(wrongColumn.body, "error"), "code")).toBe(
      "not_found",
    );

    const emptyPatch = await api("PATCH", `/api/projects/${projectId}`, {});
    expect(emptyPatch.status).toBe(400);

    const oversizedSearch = await api("POST", "/api/search", {
      query: "x".repeat(1001),
    });
    expect(oversizedSearch.status).toBe(400);
    expect(
      stringProp(objectProp(oversizedSearch.body, "error"), "code"),
    ).toBe("invalid_request");
  });

  async function createProjectAndBoard() {
    const project = objectProp(
      (await api("POST", "/api/projects", { name: "test-project" })).body,
      "project",
    );
    const projectId = stringProp(project, "id");
    const board = objectProp(
      (
        await api("POST", `/api/projects/${projectId}/boards`, {
          name: "test-board",
        })
      ).body,
      "board",
    );

    return {
      projectId,
      boardId: stringProp(board, "id"),
    };
  }

  async function createNamedProjectAndBoard(projectName: string, boardName: string) {
    const project = objectProp(
      (await api("POST", "/api/projects", { name: projectName })).body,
      "project",
    );
    const projectId = stringProp(project, "id");
    const board = objectProp(
      (
        await api("POST", `/api/projects/${projectId}/boards`, {
          name: boardName,
        })
      ).body,
      "board",
    );

    return {
      projectId,
      boardId: stringProp(board, "id"),
    };
  }

  async function api(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    return {
      status: response.status,
      body: (await response.json()) as unknown,
    };
  }

  async function uploadFile(
    path: string,
    fileName: string,
    body: string,
    contentType: string,
  ) {
    const formData = new FormData();
    formData.set("file", new Blob([body], { type: contentType }), fileName);
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      body: formData,
    });

    return {
      status: response.status,
      body: (await response.json()) as unknown,
    };
  }

  async function createTaskCommentAndAttachment(
    projectId: string,
    boardId: string,
    title: string,
    fileName: string,
  ) {
    const task = objectProp(
      (
        await api("POST", `/api/projects/${projectId}/boards/${boardId}/tasks`, {
          title,
        })
      ).body,
      "task",
    );
    const taskId = stringProp(task, "id");
    const comment = objectProp(
      (
        await api("POST", `/api/tasks/${taskId}/comments`, {
          authorType: "agent",
          body: `Comment for ${title}`,
        })
      ).body,
      "comment",
    );
    const attachment = objectProp(
      (
        await uploadFile(
          `/api/tasks/${taskId}/attachments`,
          fileName,
          `attachment for ${title}`,
          "text/plain",
        )
      ).body,
      "attachment",
    );

    return {
      taskId,
      commentId: stringProp(comment, "id"),
      attachmentPath: stringProp(attachment, "relativePath"),
    };
  }

  function searchVectorCount() {
    const row = client?.sqlite
      .prepare("SELECT count(*) AS count FROM search_document_vectors")
      .get() as { count: number } | undefined;
    return row?.count ?? 0;
  }

  function setActivityCreatedAt(activityId: string, value: string) {
    if (!client) {
      throw new Error("Expected test database client");
    }
    client.db
      .update(taskActivity)
      .set({ createdAt: new Date(value) })
      .where(eq(taskActivity.id, activityId))
      .run();
  }

  function setCommentCreatedAt(commentId: string, value: string) {
    if (!client) {
      throw new Error("Expected test database client");
    }
    client.db
      .update(taskComments)
      .set({ createdAt: new Date(value) })
      .where(eq(taskComments.id, commentId))
      .run();
  }
});

describe("starter API with indexing errors", () => {
  let tmpDir: string | undefined;
  let client: DatabaseClient | undefined;
  let server: Server | undefined;
  let baseUrl: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "taskboards-api-index-error-"));
    const databasePath = join(tmpDir, "test.sqlite");
    const migrationResult = runMigrations({
      databasePath,
      migrationsDir: resolve(process.cwd(), "drizzle"),
    });

    client = createDatabaseClient(databasePath);
    const app = createApp({
      databaseClient: client,
      migrationResult,
      embeddingModel: {
        async embed() {
          throw new Error("embedding unavailable");
        },
      },
    });

    await new Promise<void>((resolveServer) => {
      server = app.listen(0, "127.0.0.1", resolveServer);
    });

    const runningServer = server;
    if (!runningServer) {
      throw new Error("API test server did not start");
    }

    const address = runningServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolveClose, rejectClose) => {
        server?.close((error) => {
          if (error) {
            rejectClose(error);
            return;
          }

          resolveClose();
        });
      });
      server = undefined;
    }

    client?.close();
    client = undefined;

    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("keeps write endpoints successful when embedding indexing fails", async () => {
    const project = objectProp(
      (await api("POST", "/api/projects", { name: "project" })).body,
      "project",
    );
    const projectId = stringProp(project, "id");

    const boardResponse = await api(
      "POST",
      `/api/projects/${projectId}/boards`,
      {
        name: "indexing-can-fail",
      },
    );
    expect(boardResponse.status).toBe(201);
    const boardId = stringProp(objectProp(boardResponse.body, "board"), "id");

    const taskResponse = await api(
      "POST",
      `/api/projects/${projectId}/boards/${boardId}/tasks`,
      {
        title: "Still create the task",
      },
    );
    expect(taskResponse.status).toBe(201);
    const taskId = stringProp(objectProp(taskResponse.body, "task"), "id");

    const updateResponse = await api("PATCH", `/api/tasks/${taskId}`, {
      title: "Still update the task",
    });
    expect(updateResponse.status).toBe(200);

    const commentResponse = await api("POST", `/api/tasks/${taskId}/comments`, {
      authorType: "agent",
      body: "The comment write should still succeed.",
    });
    expect(commentResponse.status).toBe(201);

    if (!client) {
      throw new Error("Expected test database client");
    }

    const documents = client.db.select().from(searchDocuments).all();
    expect(documents).toHaveLength(3);
    expect(
      documents.every((document) => document.embeddingStatus === "error"),
    ).toBe(true);
  });

  async function api(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    return {
      status: response.status,
      body: (await response.json()) as unknown,
    };
  }
});

function asObject(value: unknown) {
  expect(typeof value).toBe("object");
  expect(value).not.toBeNull();
  return value as Record<string, unknown>;
}

function objectProp(value: unknown, key: string) {
  const object = asObject(value);
  return asObject(object[key]);
}

function arrayProp(value: unknown, key: string) {
  const object = asObject(value);
  expect(Array.isArray(object[key])).toBe(true);
  return object[key] as unknown[];
}

function stringProp(value: unknown, key: string) {
  const object = asObject(value);
  expect(typeof object[key]).toBe("string");
  return object[key] as string;
}

function numberProp(value: unknown, key: string) {
  const object = asObject(value);
  expect(typeof object[key]).toBe("number");
  return object[key] as number;
}

function booleanProp(value: unknown, key: string) {
  const object = asObject(value);
  expect(typeof object[key]).toBe("boolean");
  return object[key] as boolean;
}
