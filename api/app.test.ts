import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDatabaseClient, type DatabaseClient } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { searchDocuments } from "./db/schema.js";
import { createFakeEmbeddingModel } from "./testing/fake-embedding-model.js";

describe("starter API", () => {
  let tmpDir: string | undefined;
  let client: DatabaseClient | undefined;
  let server: Server | undefined;
  let baseUrl: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "taskboards-api-"));
    const databasePath = join(tmpDir, "test.sqlite");
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
  });

  it("creates projects, boards with default columns, tasks, comments, and context", async () => {
    const projectResponse = await api("POST", "/api/projects", {
      name: "Agent Taskboards",
      description: "Local agent work tracking",
      repositoryPath: "/workspace/agent-taskboards",
      defaultBranch: "main",
      metadata: { owner: "local" },
    });

    expect(projectResponse.status).toBe(201);
    const project = objectProp(projectResponse.body, "project");
    const projectId = stringProp(project, "id");
    expect(stringProp(project, "name")).toBe("Agent Taskboards");

    const boardResponse = await api(
      "POST",
      `/api/projects/${projectId}/boards`,
      {
        name: "Implementation",
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

  it("searches indexed boards, tasks, and comments and respects archived filters", async () => {
    const projectResponse = await api("POST", "/api/projects", {
      name: "Search project",
    });
    const projectId = stringProp(
      objectProp(projectResponse.body, "project"),
      "id",
    );
    const boardResponse = await api(
      "POST",
      `/api/projects/${projectId}/boards`,
      {
        name: "Vector search board",
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

  it("rejects invalid bodies and columns from the wrong board", async () => {
    const { projectId, boardId } = await createProjectAndBoard();
    const secondBoard = objectProp(
      (
        await api("POST", `/api/projects/${projectId}/boards`, {
          name: "Other board",
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
      (await api("POST", "/api/projects", { name: "Test project" })).body,
      "project",
    );
    const projectId = stringProp(project, "id");
    const board = objectProp(
      (
        await api("POST", `/api/projects/${projectId}/boards`, {
          name: "Test board",
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
      (await api("POST", "/api/projects", { name: "Project" })).body,
      "project",
    );
    const projectId = stringProp(project, "id");

    const boardResponse = await api(
      "POST",
      `/api/projects/${projectId}/boards`,
      {
        name: "Indexing can fail",
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
