import type {
  ApiErrorBody,
  Board,
  Health,
  Project,
  Task,
  TaskActivity,
  TaskComment,
  TaskContext,
  TaskPriority,
} from "../domain/types";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    const errorBody = body as ApiErrorBody;
    throw new ApiClientError(
      response.status,
      errorBody.error?.code ?? "request_failed",
      errorBody.error?.message ?? `Request failed with ${response.status}`,
      errorBody.error?.details,
    );
  }

  return body as T;
}

function jsonBody(value: unknown) {
  return JSON.stringify(value);
}

export const api = {
  health: () => request<Health>("/api/health"),

  listProjects: async () => {
    const body = await request<{ projects: Project[] }>("/api/projects");
    return body.projects;
  },

  createProject: async (input: {
    name: string;
    description?: string | null;
    repositoryPath?: string | null;
  }) => {
    const body = await request<{ project: Project }>("/api/projects", {
      method: "POST",
      body: jsonBody(input),
    });
    return body.project;
  },

  listBoards: async (projectId: string) => {
    const body = await request<{ boards: Board[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/boards`,
    );
    return body.boards;
  },

  createBoard: async (projectId: string, input: { name: string; description?: string | null }) => {
    const body = await request<{ board: Board }>(
      `/api/projects/${encodeURIComponent(projectId)}/boards`,
      {
        method: "POST",
        body: jsonBody(input),
      },
    );
    return body.board;
  },

  getBoard: async (projectId: string, boardId: string) => {
    const body = await request<{ board: Board }>(
      `/api/projects/${encodeURIComponent(projectId)}/boards/${encodeURIComponent(
        boardId,
      )}?includeTasks=true`,
    );
    return body.board;
  },

  createTask: async (
    projectId: string,
    boardId: string,
    input: {
      title: string;
      description?: string | null;
      columnId?: string;
      columnKey?: string;
      priority?: TaskPriority;
      labels?: string[];
    },
  ) => {
    const body = await request<{ task: Task; activity: TaskActivity }>(
      `/api/projects/${encodeURIComponent(projectId)}/boards/${encodeURIComponent(
        boardId,
      )}/tasks`,
      {
        method: "POST",
        body: jsonBody(input),
      },
    );
    return body;
  },

  moveTask: async (
    taskId: string,
    input: { columnId?: string; columnKey?: string; position?: number },
  ) => {
    const body = await request<{ task: Task; activity: TaskActivity }>(
      `/api/tasks/${encodeURIComponent(taskId)}/move`,
      {
        method: "POST",
        body: jsonBody(input),
      },
    );
    return body;
  },

  completeTask: async (taskId: string) => {
    const body = await request<{ task: Task; activity: TaskActivity }>(
      `/api/tasks/${encodeURIComponent(taskId)}/complete`,
      { method: "POST" },
    );
    return body;
  },

  archiveTask: async (taskId: string) => {
    const body = await request<{ task: Task; activity: TaskActivity }>(
      `/api/tasks/${encodeURIComponent(taskId)}/archive`,
      { method: "POST" },
    );
    return body;
  },

  getTaskContext: async (taskId: string) =>
    request<TaskContext>(`/api/tasks/${encodeURIComponent(taskId)}/context`),

  createComment: async (
    taskId: string,
    input: { body: string; authorType?: "human"; authorName?: string | null },
  ) => {
    const body = await request<{ comment: TaskComment; activity: TaskActivity }>(
      `/api/tasks/${encodeURIComponent(taskId)}/comments`,
      {
        method: "POST",
        body: jsonBody({
          authorType: input.authorType ?? "human",
          authorName: input.authorName ?? "you",
          body: input.body,
        }),
      },
    );
    return body;
  },
};
