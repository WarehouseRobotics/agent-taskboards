import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDatabaseClient, type DatabaseClient } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { tasks } from "./db/schema.js";
import { createFakeEmbeddingModel } from "./testing/fake-embedding-model.js";

describe("humanized task IDs", () => {
  let tmpDir: string | undefined;
  let client: DatabaseClient | undefined;
  let server: Server | undefined;
  let baseUrl: string;

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

  it("creates readable IDs from the first four sanitized title words", async () => {
    await startApi(["12abc3"]);
    const { projectId, boardId } = await createProjectAndBoard();

    const task = await createTask(projectId, boardId, {
      title: "Generate humanized title-based IDs",
    });

    expect(stringProp(task, "id")).toBe("generate-humanized-title-based-12abc3");
  });

  it("normalizes punctuation and case in task ID prefixes", async () => {
    await startApi(["456def"]);
    const { projectId, boardId } = await createProjectAndBoard();

    const task = await createTask(projectId, boardId, {
      title: "Fix: SQLite + API IDs!",
    });

    expect(stringProp(task, "id")).toBe("fix-sqlite-api-ids-456def");
  });

  it("folds extended Latin diacritics in task ID prefixes", async () => {
    await startApi(["fed456"]);
    const { projectId, boardId } = await createProjectAndBoard();

    const task = await createTask(projectId, boardId, {
      title: "Añadir configuración básica",
    });

    expect(stringProp(task, "id")).toBe("anadir-configuracion-basica-fed456");
  });

  it("transliterates Latin letters that do not decompose to ASCII", async () => {
    await startApi(["abc987"]);
    const { projectId, boardId } = await createProjectAndBoard();

    const task = await createTask(projectId, boardId, {
      title: "Straße œuvre Łódź smørrebrød",
    });

    expect(stringProp(task, "id")).toBe(
      "strasse-oeuvre-lodz-smorrebrod-abc987",
    );
  });

  it("transliterates Cyrillic characters in task ID prefixes", async () => {
    await startApi(["987abc"]);
    const { projectId, boardId } = await createProjectAndBoard();

    const task = await createTask(projectId, boardId, {
      title: "Добавить настройки API",
    });

    expect(stringProp(task, "id")).toBe("dobavit-nastroiki-api-987abc");
  });

  it("uses a fallback prefix when a title has no alphanumeric words", async () => {
    await startApi(["fed123"]);
    const { projectId, boardId } = await createProjectAndBoard();

    const task = await createTask(projectId, boardId, { title: "!!!" });

    expect(stringProp(task, "id")).toBe("task-fed123");
  });

  it("regenerates the suffix when a generated task ID already exists", async () => {
    await startApi(["abc123", "def456"]);
    const { projectId, boardId, columnId } = await createProjectAndBoard();

    client?.db
      .insert(tasks)
      .values({
        id: "generate-humanized-title-based-abc123",
        projectId,
        boardId,
        columnId,
        title: "Existing collision candidate",
        position: 0,
      })
      .run();

    const task = await createTask(projectId, boardId, {
      title: "Generate humanized title-based IDs",
    });

    expect(stringProp(task, "id")).toBe("generate-humanized-title-based-def456");
  });

  async function startApi(suffixes: string[]) {
    tmpDir = mkdtempSync(join(tmpdir(), "taskboards-task-id-"));
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
      taskIdSuffixGenerator: () => {
        const suffix = suffixes.shift();
        if (!suffix) {
          throw new Error("Unexpected task ID suffix request");
        }

        return suffix;
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
  }

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
    const column = arrayProp(board, "columns")[0];

    return {
      projectId,
      boardId: stringProp(board, "id"),
      columnId: stringProp(column, "id"),
    };
  }

  async function createTask(
    projectId: string,
    boardId: string,
    body: Record<string, unknown>,
  ) {
    const response = await api(
      "POST",
      `/api/projects/${projectId}/boards/${boardId}/tasks`,
      body,
    );

    expect(response.status).toBe(201);
    return objectProp(response.body, "task");
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

function objectProp(value: unknown, key: string) {
  if (!value || typeof value !== "object" || !(key in value)) {
    throw new Error(`Expected object property ${key}`);
  }

  const item = (value as Record<string, unknown>)[key];
  if (!item || typeof item !== "object") {
    throw new Error(`Expected ${key} to be an object`);
  }

  return item as Record<string, unknown>;
}

function arrayProp(value: unknown, key: string) {
  if (!value || typeof value !== "object" || !(key in value)) {
    throw new Error(`Expected object property ${key}`);
  }

  const item = (value as Record<string, unknown>)[key];
  if (!Array.isArray(item)) {
    throw new Error(`Expected ${key} to be an array`);
  }

  return item;
}

function stringProp(value: unknown, key: string) {
  if (!value || typeof value !== "object" || !(key in value)) {
    throw new Error(`Expected object property ${key}`);
  }

  const item = (value as Record<string, unknown>)[key];
  if (typeof item !== "string") {
    throw new Error(`Expected ${key} to be a string`);
  }

  return item;
}
