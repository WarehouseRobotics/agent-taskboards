import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDatabaseClient, type DatabaseClient } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { createFakeEmbeddingModel } from "./testing/fake-embedding-model.js";

describe("agent markdown API", () => {
  let tmpDir: string | undefined;
  let client: DatabaseClient | undefined;
  let server: Server | undefined;
  let baseUrl: string;
  let previousUploadsPath: string | undefined;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "taskboards-agent-api-"));
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

  it("serves markdown help with format controls and markdown errors", async () => {
    const help = await api("GET", "/api/agents/help");
    expect(help.status).toBe(200);
    expect(help.contentType).toContain("text/markdown");
    expect(help.text).toContain("```toon");
    expect(help.text).toContain("GET /api/agents/tasks");

    const jsonHelp = await api("GET", "/api/agents/help?format=json");
    expect(jsonHelp.text).toContain("```json");
    expect(arrayProp(jsonBlock(jsonHelp.text), "endpoints")).toContain(
      "GET /api/agents/tasks",
    );

    const proseOnly = await api("GET", "/api/agents/help?format=none");
    expect(proseOnly.text).not.toContain("```");
    expect(proseOnly.text).toContain("## Next calls");

    const missing = await api("GET", "/api/agents/tasks/missing-task");
    expect(missing.status).toBe(404);
    expect(missing.contentType).toContain("text/markdown");
    expect(missing.text).toContain("`not_found`: Task not found.");
  });

  it("discovers projects and boards and reports bounded board tasks", async () => {
    const project = objectProp(
      jsonBlock(
        (
          await api("POST", "/api/agents/projects?format=json", {
            name: "agent-taskboards",
            repositoryPath: "/workspace/agent-taskboards",
          })
        ).text,
      ),
      "project",
    );
    const projectId = stringProp(project, "id");

    const board = objectProp(
      jsonBlock(
        (
          await api(
            "POST",
            "/api/agents/projects/agent-taskboards/boards?format=json",
            { name: "implementation" },
          )
        ).text,
      ),
      "board",
    );
    expect(stringProp(board, "name")).toBe("implementation");

    await api(
      "POST",
      "/api/agents/projects/agent-taskboards/boards/implementation/tasks",
      { title: "First API task", columnKey: "ready" },
    );
    await api(
      "POST",
      "/api/agents/projects/agent-taskboards/boards/implementation/tasks",
      { title: "Second API task", columnKey: "ready" },
    );

    const projects = await api(
      "GET",
      "/api/agents/projects?repositoryPath=/workspace/agent-taskboards&format=json",
    );
    const projectRows = arrayProp(jsonBlock(projects.text), "projects").map(
      asObject,
    );
    expect(stringProp(projectRows[0], "id")).toBe(projectId);

    const boardRead = await api(
      "GET",
      "/api/agents/projects/agent-taskboards/boards/implementation?includeTasks=true&perColumnLimit=1&format=json",
    );
    expect(boardRead.text).toContain("Some columns were truncated");
    expect(boardRead.text).toContain("GET /api/agents/tasks?boardId=");
    const data = jsonBlock(boardRead.text);
    expect(booleanProp(objectProp(data, "result"), "truncated")).toBe(true);
  });

  it("discovers tasks with filters, text search, semantic search, and archive visibility", async () => {
    const { projectId, boardId } = await createProjectAndBoard();
    const readyTask = await createTask(projectId, boardId, {
      title: "Ready API endpoint",
      description: "Build markdown responses",
      columnKey: "ready",
      priority: "high",
      labels: ["api", "agent"],
    });
    const blockedTask = await createTask(projectId, boardId, {
      title: "Vector search blocker",
      description: "Debug sqlite vector search filtering",
      columnKey: "blocked",
      priority: "urgent",
      labels: ["api", "search"],
    });
    const doneTask = await createTask(projectId, boardId, {
      title: "Done task",
      columnKey: "ready",
    });
    await api("POST", `/api/agents/tasks/${doneTask}/move`, {
      columnKey: "done",
    });
    const archivedTask = await createTask(projectId, boardId, {
      title: "Archived task",
      columnKey: "ready",
    });
    await api("POST", `/api/agents/tasks/${archivedTask}/archive`);

    expect(
      taskIds(
        await api(
          "GET",
          "/api/agents/tasks?boardId=test-board&columnKey=blocked&format=json",
        ),
      ),
    ).toEqual([blockedTask]);

    expect(
      taskIds(
        await api(
          "GET",
          "/api/agents/tasks?projectId=test-project&boardId=test-board&priority=high&labels=api,agent&q=markdown&format=json",
        ),
      ),
    ).toEqual([readyTask]);

    expect(
      taskIds(
        await api(
          "GET",
          "/api/agents/tasks?boardId=test-board&status=done&format=json",
        ),
      ),
    ).toEqual([doneTask]);

    expect(
      taskIds(
        await api(
          "GET",
          "/api/agents/tasks?boardId=test-board&status=archived&format=json",
        ),
      ),
    ).toEqual([archivedTask]);

    expect(
      taskIds(
        await api(
          "GET",
          "/api/agents/tasks?boardId=test-board&q=vector&semantic=true&format=json",
        ),
      ),
    ).toContain(blockedTask);
  });

  it("requires project context for ambiguous board names", async () => {
    await api("POST", "/api/agents/projects", { name: "alpha" });
    await api("POST", "/api/agents/projects", { name: "beta" });
    await api("POST", "/api/agents/projects/alpha/boards", { name: "shared" });
    await api("POST", "/api/agents/projects/beta/boards", { name: "shared" });

    const ambiguous = await api(
      "GET",
      "/api/agents/tasks?boardId=shared&format=json",
    );

    expect(ambiguous.status).toBe(400);
    expect(ambiguous.text).toContain("Board name is ambiguous");
  });

  it("runs the agent write workflow and exposes context, comments, activity, and search", async () => {
    const { projectId, boardId } = await createProjectAndBoard();
    const taskId = await createTask(projectId, boardId, {
      title: "SQLite migration blocker",
      description: "Debug sqlite-vec virtual table setup",
      columnKey: "ready",
      priority: "urgent",
      labels: ["sqlite", "vector"],
    });

    const move = await api("POST", `/api/agents/tasks/${taskId}/move?format=json`, {
      columnKey: "blocked",
    });
    expect(move.text).toContain("Moving into a done column");
    expect(stringProp(objectProp(jsonBlock(move.text), "activity"), "eventType")).toBe(
      "task.moved",
    );

    await api("POST", `/api/agents/tasks/${taskId}/complete`, {});
    const comment = await api(
      "POST",
      `/api/agents/tasks/${taskId}/comments?format=json`,
      {
        authorType: "agent",
        authorName: "Codex",
        body: "Blocked on vector search result filtering.\n\n## Next finding\n\nThe matcher needs another pass.",
      },
    );
    expect(stringProp(objectProp(jsonBlock(comment.text), "activity"), "eventType")).toBe(
      "comment.created",
    );

    const context = await api(
      "GET",
      `/api/agents/tasks/${taskId}/context?view=full&include=comments,activity&format=json`,
    );
    expect(context.text).not.toContain("```json");
    expect(context.text).toContain(
      `Loaded context for project \`test-project\`, board \`test-board\`, task \`${taskId}\`.`,
    );
    expect(context.text).toContain(`- Parent project: \`${projectId}\` test-project.`);
    expect(context.text).toContain(`- Parent board: \`${boardId}\` test-board.`);
    expect(context.text).toContain(
      "- Task: SQLite migration blocker.\nDebug sqlite-vec virtual table setup",
    );
    expect(context.text).toContain("## Comments");
    expect(context.text).toContain("Author: agent Codex");
    expect(context.text).toContain("## Next finding");
    expect(context.text).toContain("## Activity");
    expect(context.text).toContain("task.completed: Task was completed");

    const details = await api(
      "GET",
      `/api/agents/tasks/${taskId}?view=full&format=json`,
    );
    expect(details.text).toContain(
      "- Task: SQLite migration blocker.\nDebug sqlite-vec virtual table setup",
    );

    const comments = await api(
      "GET",
      `/api/agents/tasks/${taskId}/comments?format=json`,
    );
    expect(arrayProp(jsonBlock(comments.text), "comments")).toHaveLength(1);

    const activity = await api(
      "GET",
      `/api/agents/tasks/${taskId}/activity?format=json`,
    );
    expect(arrayProp(jsonBlock(activity.text), "activity").length).toBeGreaterThanOrEqual(
      4,
    );

    const searchGet = await api(
      "GET",
      "/api/agents/search?q=sqlite%20migration&sourceTypes=task&format=json",
    );
    expect(searchIds(searchGet)).toContain(taskId);

    const searchPost = await api("POST", "/api/agents/search?format=json", {
      query: "blocked vector filtering",
      sourceTypes: ["comment"],
      boardId: "test-board",
    });
    expect(
      arrayProp(jsonBlock(searchPost.text), "results")
        .map(asObject)
        .map((result) => stringProp(result, "sourceType")),
    ).toContain("comment");

    const archive = await api("POST", `/api/agents/tasks/${taskId}/archive`);
    expect(archive.text).toContain("Comments and activity remain attached.");
  });

  it("uploads and exposes task attachment paths to agents without an agent delete endpoint", async () => {
    const { projectId, boardId } = await createProjectAndBoard();
    const taskId = await createTask(projectId, boardId, {
      title: "Inspect uploaded files",
      columnKey: "ready",
    });

    const missingFile = await fetch(
      `${baseUrl}/api/agents/tasks/${taskId}/attachments?format=json`,
      { method: "POST", body: new FormData() },
    );
    expect(missingFile.status).toBe(400);
    expect(await missingFile.text()).toContain("invalid_request");

    const upload = await uploadFile(
      `/api/agents/tasks/${taskId}/attachments?format=json`,
      "trace.txt",
      "agent readable attachment",
      "text/plain",
    );
    expect(upload.status).toBe(201);
    expect(upload.contentType).toContain("text/markdown");
    const uploadBlock = jsonBlock(upload.text);
    const uploadedAttachment = objectProp(uploadBlock, "attachment");
    expect(stringProp(objectProp(uploadBlock, "task"), "id")).toBe(taskId);
    expect(stringProp(uploadedAttachment, "path")).toMatch(/^tasks\//);
    expect(uploadedAttachment.url).toBeUndefined();
    expect(
      stringProp(objectProp(uploadBlock, "activity"), "eventType"),
    ).toBe("attachment.created");

    const attachments = await api(
      "GET",
      `/api/agents/tasks/${taskId}/attachments?format=json`,
    );
    const attachment = asObject(
      arrayProp(jsonBlock(attachments.text), "attachments")[0],
    );
    expect(stringProp(attachment, "path")).toMatch(/^tasks\//);
    expect(attachment.url).toBeUndefined();

    const context = await api(
      "GET",
      `/api/agents/tasks/${taskId}/context?format=json`,
    );
    expect(context.text).toContain("## Attachments");
    expect(context.text).toContain("trace.txt");

    const deleteAttempt = await api(
      "DELETE",
      `/api/agents/tasks/${taskId}/attachments/${stringProp(attachment, "id")}`,
    );
    expect(deleteAttempt.status).toBe(404);
  });

  async function createProjectAndBoard() {
    const project = objectProp(
      jsonBlock(
        (
          await api("POST", "/api/agents/projects?format=json", {
            name: "test-project",
          })
        ).text,
      ),
      "project",
    );
    const projectId = stringProp(project, "id");
    const board = objectProp(
      jsonBlock(
        (
          await api(
            "POST",
            `/api/agents/projects/${projectId}/boards?format=json`,
            { name: "test-board" },
          )
        ).text,
      ),
      "board",
    );

    return {
      projectId,
      boardId: stringProp(board, "id"),
    };
  }

  async function createTask(
    projectId: string,
    boardId: string,
    body: Record<string, unknown>,
  ) {
    const response = await api(
      "POST",
      `/api/agents/projects/${projectId}/boards/${boardId}/tasks?format=json`,
      body,
    );
    return stringProp(objectProp(jsonBlock(response.text), "task"), "id");
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
      contentType: response.headers.get("content-type") ?? "",
      text: await response.text(),
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
      contentType: response.headers.get("content-type") ?? "",
      text: await response.text(),
    };
  }
});

function jsonBlock(text: string) {
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  expect(match).not.toBeNull();
  return JSON.parse(match?.[1] ?? "{}") as unknown;
}

function taskIds(response: Awaited<ReturnType<TestApi>>) {
  return arrayProp(jsonBlock(response.text), "groups")
    .map(asObject)
    .flatMap((group) => arrayProp(group, "tasks").map(asObject))
    .map((task) => stringProp(task, "id"));
}

function searchIds(response: Awaited<ReturnType<TestApi>>) {
  return arrayProp(jsonBlock(response.text), "results")
    .map(asObject)
    .map((result) => stringProp(result, "sourceId"));
}

type TestApi = (
  method: string,
  path: string,
  body?: Record<string, unknown>,
) => Promise<{ status: number; contentType: string; text: string }>;

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

function booleanProp(value: unknown, key: string) {
  const object = asObject(value);
  expect(typeof object[key]).toBe("boolean");
  return object[key] as boolean;
}
