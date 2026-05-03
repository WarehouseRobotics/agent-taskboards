import type { ErrorRequestHandler, Express, Request } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { ApiError } from "../http/errors.js";
import {
  parseBody,
  parseNonEmptyBody,
  parseQuery,
} from "../http/validation.js";
import {
  boardCreateSchema,
  boardUpdateSchema,
  commentCreateSchema,
  projectCreateSchema,
  projectUpdateSchema,
  searchSchema,
  taskCreateSchema,
  taskMoveSchema,
  taskUpdateSchema,
} from "../models/request-schemas.js";
import {
  serializeActivity,
  serializeAgentAttachment,
  serializeBoard,
  serializeBoardColumn,
  serializeComment,
  serializeProject,
  serializeTask,
} from "../models/serializers.js";
import type { DatabaseClient } from "../db/client.js";
import type {
  Board,
  BoardColumn,
  JsonArray,
  JsonObject,
  Project,
  Task,
  TaskActivity,
  TaskAttachment,
  TaskComment,
} from "../db/schema.js";
import type { MigrationResult } from "../db/migrate.js";
import type { ApiServices } from "../services/index.js";
import type { SearchInput } from "../models/request-schemas.js";
import type { SearchResult } from "../services/search-service.js";
import { uploadAttachmentFile } from "./attachment-upload.js";
import {
  agentReadQuerySchema,
  agentSearchQuerySchema,
  agentTaskListQuerySchema,
  type AgentFormat,
  type AgentReadQuery,
  type AgentTaskListQuery,
} from "../agents/query-schemas.js";
import { renderAgentError, sendAgentMarkdown } from "../agents/markdown.js";

type AgentRouteOptions = {
  databaseClient: DatabaseClient;
  migrationResult: MigrationResult;
  services: ApiServices;
};

type TaskWithParents = {
  project: Project;
  board: Board;
  columns: BoardColumn[];
  column: BoardColumn;
  task: Task;
  comments: TaskComment[];
  activity: TaskActivity[];
  attachments: TaskAttachment[];
};

type TaskDiscoveryRow = TaskWithParents & {
  search?: SearchResult;
};

export function registerAgentRoutes(app: Express, options: AgentRouteOptions) {
  const { databaseClient, migrationResult, services } = options;

  app.get("/api/agents/help", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    sendAgentMarkdown(
      res,
      {
        outcome: "Agent Taskboards exposes markdown-first endpoints under `/api/agents`.",
        sections: [
          {
            title: "What I found",
            lines: [
              "- Read endpoints support `format=toon|yaml|json|none` and `view=brief|normal|full`.",
              "- Writes accept canonical JSON bodies, except attachment uploads which use multipart `file`.",
              "- Use task context endpoints when you need comments and activity for handoff.",
            ],
          },
        ],
        data: {
          endpoints: [
            "GET /api/agents/projects",
            "GET /api/agents/projects/:projectId/boards",
            "GET /api/agents/tasks",
            "GET /api/agents/tasks/:taskId/context",
            "GET /api/agents/tasks/:taskId/attachments",
            "POST /api/agents/tasks/:taskId/attachments",
            "POST /api/agents/projects/:projectId/boards/:boardId/tasks",
            "POST /api/agents/tasks/:taskId/comments",
            "GET /api/agents/search?q=<query>",
          ],
          controls: {
            format: ["toon", "yaml", "json", "none"],
            view: ["brief", "normal", "full"],
            include: [
              "description",
              "comments",
              "activity",
              "metadata",
              "externalReferences",
            ],
          },
        },
        nextCalls: ["GET /api/agents/projects", "GET /api/agents/tasks?view=brief"],
      },
      { format: query.format },
    );
  });

  app.get("/api/agents/health", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);

    try {
      databaseClient.sqlite.prepare("SELECT 1").get();
      sendAgentMarkdown(
        res,
        {
          outcome: "Agent Taskboards is healthy.",
          sections: [
            {
              title: "What I found",
              lines: [
                "- The API process is running.",
                `- SQLite responded at \`${databaseClient.databasePath}\`.`,
                "- Embedding search availability depends on the configured local model and indexed documents.",
              ],
            },
          ],
          data: {
            ok: true,
            database: {
              ok: true,
              path: databaseClient.databasePath,
              migrations: migrationResult,
            },
            search: {
              sourceTypes: ["board", "task", "comment"],
            },
          },
          nextCalls: ["GET /api/agents/projects", "GET /api/agents/search?q=<query>"],
        },
        { format: query.format },
      );
    } catch (error) {
      sendAgentMarkdown(
        res,
        {
          outcome: "Agent Taskboards is not healthy.",
          sections: [
            {
              title: "What I found",
              lines: [
                `- SQLite check failed: ${
                  error instanceof Error ? error.message : "Unknown database error"
                }`,
              ],
            },
          ],
          data: {
            ok: false,
            database: {
              ok: false,
              error:
                error instanceof Error ? error.message : "Unknown database error",
            },
          },
        },
        { status: 503, format: query.format },
      );
    }
  });

  app.get("/api/agents/projects", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const projects = rankProjects(
      services.projects.listProjects(query.includeArchived),
      query,
    );
    const page = paginate(projects, query.offset, query.limit);
    const dataProjects = page.items.map((project) =>
      projectSummary(project, query.view, query.include),
    );

    sendAgentMarkdown(
      res,
      {
        outcome: `Found ${page.items.length} project${plural(page.items.length)}.`,
        sections: [
          {
            title: "What I found",
            lines: [
              ...page.items.map(
                (project) =>
                  `- \`${project.id}\` ${project.name}${project.archivedAt ? " (archived)" : ""}`,
              ),
              ...truncationLines(page.truncated, "projects", projectListNextCall(query)),
            ],
          },
        ],
        data: {
          result: {
            view: query.view,
            truncated: page.truncated,
            offset: query.offset,
            limit: query.limit,
            total: projects.length,
          },
          projects: dataProjects,
        },
        nextCalls: page.items.flatMap((project) => [
          `GET /api/agents/projects/${project.id}`,
          `GET /api/agents/projects/${project.id}/boards`,
        ]),
      },
      { format: query.format },
    );
  });

  app.post("/api/agents/projects", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const body = parseBody(req, projectCreateSchema);
    const project = services.projects.createProject(body);

    sendAgentMarkdown(
      res,
      {
        outcome: `Created project \`${project.id}\`.`,
        sections: [
          {
            title: "What changed",
            lines: [`- Project \`${project.name}\` is ready for boards and tasks.`],
          },
        ],
        data: { project: projectSummary(project, "full", query.include) },
        nextCalls: [
          `GET /api/agents/projects/${project.id}`,
          `POST /api/agents/projects/${project.id}/boards`,
        ],
      },
      { status: 201, format: query.format },
    );
  });

  app.get("/api/agents/projects/:projectId", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const project = services.projects.getProjectByRef(
      req.params.projectId,
      query.includeArchived,
    );
    const boards = services.boards.listBoards(project.id, query.includeArchived);

    sendAgentMarkdown(
      res,
      {
        outcome: `Read project \`${project.id}\`.`,
        sections: [
          {
            title: "What I found",
            lines: [
              `- Project: ${project.name}${project.archivedAt ? " (archived)" : ""}`,
              `- Active boards visible here: ${boards.length}`,
            ],
          },
        ],
        data: {
          project: projectSummary(project, query.view, query.include),
          boards:
            query.view === "brief"
              ? boards.map((board) => ({ id: board.id, name: board.name }))
              : boards.map((board) => boardSummary(board, [], query.view, query.include)),
        },
        nextCalls: [
          `GET /api/agents/projects/${project.id}/boards`,
          `POST /api/agents/projects/${project.id}/boards`,
        ],
      },
      { format: query.format },
    );
  });

  app.patch(
    "/api/agents/projects/:projectId",
    asyncHandler(async (req, res) => {
      const query = parseQuery(req, agentReadQuerySchema);
      const body = parseNonEmptyBody(req, projectUpdateSchema);
      const existingProject = services.projects.getProjectByRef(
        req.params.projectId,
        false,
      );
      const project = services.projects.updateProject(existingProject.id, body);

      sendAgentMarkdown(
        res,
        {
          outcome: `Updated project \`${project.id}\`.`,
          sections: [
            {
              title: "What changed",
              lines: [`- Updated fields: ${Object.keys(body).join(", ")}.`],
            },
          ],
          data: { project: projectSummary(project, "full", query.include) },
          nextCalls: [`GET /api/agents/projects/${project.id}`],
        },
        { format: query.format },
      );
    }),
  );

  app.post("/api/agents/projects/:projectId/archive", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const existingProject = services.projects.getProjectByRef(
      req.params.projectId,
      false,
    );
    const project = services.projects.archiveProject(existingProject.id);

    sendAgentMarkdown(
      res,
      {
        outcome: `Archived project \`${project.id}\`.`,
        sections: [
          {
            title: "What changed",
            lines: [
              "- Child boards, tasks, comments, and activity were not hard-deleted.",
              "- Include archived content explicitly when you need to retrieve this context.",
            ],
          },
        ],
        data: { project: projectSummary(project, "full", query.include) },
        nextCalls: [`GET /api/agents/projects/${project.id}?includeArchived=true`],
      },
      { format: query.format },
    );
  });

  app.get("/api/agents/projects/:projectId/boards", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const project = services.projects.getProjectByRef(
      req.params.projectId,
      query.includeArchived,
    );
    const boards = rankBoards(
      services.boards.listBoards(project.id, query.includeArchived),
      query.q,
    );
    const page = paginate(boards, query.offset, query.limit);
    const boardRows = page.items.map((board) => {
      const columns = services.boards.listBoardColumns(board.id);
      const tasks = services.tasks.listBoardTasks(
        project.id,
        board.id,
        query.includeArchived,
      ).tasks;
      return boardSummaryWithCounts(board, columns, tasks, query);
    });

    sendAgentMarkdown(
      res,
      {
        outcome: `Found ${page.items.length} board${plural(page.items.length)} for project \`${project.id}\`.`,
        sections: [
          {
            title: "What I found",
            lines: [
              `- Project: \`${project.id}\` ${project.name}.`,
              ...page.items.map((board) => `- \`${board.id}\` ${board.name}`),
              ...truncationLines(page.truncated, "boards", boardsNextCall(project.id, query)),
            ],
          },
        ],
        data: {
          project: { id: project.id, name: project.name },
          result: {
            view: query.view,
            truncated: page.truncated,
            offset: query.offset,
            limit: query.limit,
            total: boards.length,
          },
          boards: boardRows,
        },
        nextCalls: page.items.map(
          (board) => `GET /api/agents/projects/${project.id}/boards/${board.id}`,
        ),
      },
      { format: query.format },
    );
  });

  app.post(
    "/api/agents/projects/:projectId/boards",
    asyncHandler(async (req, res) => {
      const query = parseQuery(req, agentReadQuerySchema);
      const body = parseBody(req, boardCreateSchema);
      const project = services.projects.getProjectByRef(req.params.projectId, false);
      const created = await services.boards.createBoard(project.id, body);

      sendAgentMarkdown(
        res,
        {
          outcome: `Created board \`${created.board.id}\`.`,
          sections: [
            {
              title: "What changed",
              lines: [
                `- Board \`${created.board.name}\` has ${created.columns.length} workflow columns.`,
              ],
            },
          ],
          data: {
            board: boardSummary(created.board, created.columns, "full", query.include),
          },
          nextCalls: [
            `GET /api/agents/projects/${created.board.projectId}/boards/${created.board.id}`,
            `POST /api/agents/projects/${created.board.projectId}/boards/${created.board.id}/tasks`,
          ],
        },
        { status: 201, format: query.format },
      );
    }),
  );

  app.get("/api/agents/projects/:projectId/boards/:boardId", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const project = services.projects.getProjectByRef(
      req.params.projectId,
      query.includeArchived,
    );
    const board = services.boards.getBoardByRef(
      project.id,
      req.params.boardId,
      query.includeArchived,
    );
    const columns = services.boards.listBoardColumns(board.id);
    const tasks = query.includeTasks
      ? services.tasks.listBoardTasks(project.id, board.id, query.includeArchived).tasks
      : [];
    const grouped = query.includeTasks
      ? groupTasksByColumn(project, board, columns, tasks, query)
      : undefined;

    sendAgentMarkdown(
      res,
      {
        outcome: `Read board \`${board.id}\`.`,
        sections: [
          {
            title: "What I found",
            lines: [
              `- Project: \`${project.id}\` ${project.name}.`,
              `- Board: \`${board.id}\` ${board.name}.`,
              `- Columns: ${columns.map((column) => column.key).join(", ")}.`,
              ...(grouped?.truncated
                ? [
                    `- Some columns were truncated; continue with \`${boardTasksNextCall(project.id, board.id, query)}\`.`,
                  ]
                : []),
            ],
          },
        ],
        data: {
          project: { id: project.id, name: project.name },
          board: boardSummary(board, columns, query.view, query.include),
          tasks: grouped?.columns,
          result: {
            includeTasks: query.includeTasks,
            perColumnLimit: query.perColumnLimit,
            truncated: grouped?.truncated ?? false,
          },
        },
        nextCalls: [
          `GET /api/agents/tasks?boardId=${board.id}&view=brief`,
          `POST /api/agents/projects/${project.id}/boards/${board.id}/tasks`,
        ],
      },
      { format: query.format },
    );
  });

  app.patch(
    "/api/agents/projects/:projectId/boards/:boardId",
    asyncHandler(async (req, res) => {
      const query = parseQuery(req, agentReadQuerySchema);
      const body = parseNonEmptyBody(req, boardUpdateSchema);
      const project = services.projects.getProjectByRef(
        req.params.projectId,
        false,
      );
      const existingBoard = services.boards.getBoardByRef(
        project.id,
        req.params.boardId,
        false,
      );
      const board = await services.boards.updateBoard(
        project.id,
        existingBoard.id,
        body,
      );
      const columns = services.boards.listBoardColumns(board.id);

      sendAgentMarkdown(
        res,
        {
          outcome: `Updated board \`${board.id}\`.`,
          sections: [
            {
              title: "What changed",
              lines: [`- Updated fields: ${Object.keys(body).join(", ")}.`],
            },
          ],
          data: { board: boardSummary(board, columns, "full", query.include) },
          nextCalls: [
            `GET /api/agents/projects/${board.projectId}/boards/${board.id}`,
          ],
        },
        { format: query.format },
      );
    }),
  );

  app.post("/api/agents/projects/:projectId/boards/:boardId/archive", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const project = services.projects.getProjectByRef(req.params.projectId, false);
    const existingBoard = services.boards.getBoardByRef(
      project.id,
      req.params.boardId,
      false,
    );
    const board = services.boards.archiveBoard(
      project.id,
      existingBoard.id,
    );
    const columns = services.boards.listBoardColumns(board.id);

    sendAgentMarkdown(
      res,
      {
        outcome: `Archived board \`${board.id}\`.`,
        sections: [
          {
            title: "What changed",
            lines: [
              "- Child tasks, comments, and activity were not hard-deleted.",
              "- Include archived content explicitly when you need to retrieve this board.",
            ],
          },
        ],
        data: { board: boardSummary(board, columns, "full", query.include) },
        nextCalls: [
          `GET /api/agents/projects/${board.projectId}/boards/${board.id}?includeArchived=true`,
        ],
      },
      { format: query.format },
    );
  });

  app.get(
    "/api/agents/tasks",
    asyncHandler(async (req, res) => {
      const query = parseQuery(req, agentTaskListQuerySchema);
      const rows = await discoverTasks(services, query);
      const page = paginate(rows, query.offset, query.limit);
      const groups = groupDiscoveryRows(page.items, query);

      sendAgentMarkdown(
        res,
        {
          outcome: `Found ${page.items.length} task${plural(page.items.length)}.`,
          sections: [
            {
              title: "What I found",
              lines: [
                ...page.items.map(
                  (row) =>
                    `- \`${row.task.id}\` ${row.task.title} (${row.column.key}, ${row.task.priority})`,
                ),
                ...truncationLines(page.truncated, "tasks", tasksNextCall(query)),
              ],
            },
          ],
          data: {
            result: {
              view: query.view,
              status: query.status,
              truncated: page.truncated,
              offset: query.offset,
              limit: query.limit,
              total: rows.length,
            },
            groups,
          },
          nextCalls: page.items.map(
            (row) => `GET /api/agents/tasks/${row.task.id}/context?view=full&include=comments,activity`,
          ),
        },
        { format: query.format },
      );
    }),
  );

  app.post(
    "/api/agents/projects/:projectId/boards/:boardId/tasks",
    asyncHandler(async (req, res) => {
      const query = parseQuery(req, agentReadQuerySchema);
      const body = parseBody(req, taskCreateSchema);
      const project = services.projects.getProjectByRef(req.params.projectId, false);
      const board = services.boards.getBoardByRef(
        project.id,
        req.params.boardId,
        false,
      );
      const created = await services.tasks.createTask(
        project.id,
        board.id,
        body,
      );
      const context = loadTaskWithParents(services, created.task.id, true);

      sendAgentMarkdown(
        res,
        {
          outcome: `Created task \`${created.task.id}\`.`,
          sections: [
            {
              title: "What changed",
              lines: [
                `- Added \`${created.task.title}\` to column \`${context.column.key}\`.`,
                `- Generated activity \`${created.activity.id}\`.`,
              ],
            },
          ],
          data: {
            task: taskSummary(context, "full", query.include),
            activity: serializeActivity(created.activity),
          },
          nextCalls: taskNextCalls(created.task.id),
        },
        { status: 201, format: query.format },
      );
    }),
  );

  app.get("/api/agents/tasks/:taskId", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const context = loadTaskWithParents(
      services,
      req.params.taskId,
      query.includeArchived,
    );

    sendAgentMarkdown(
      res,
      {
        outcome: `Read task \`${context.task.id}\`.`,
        sections: [
          {
            title: "What I found",
            lines: [
              ...taskMarkdownIntroLines(context, query.view),
              `- Project: \`${context.project.id}\` ${context.project.name}.`,
              `- Board: \`${context.board.id}\` ${context.board.name}.`,
              `- Column: \`${context.column.key}\` ${context.column.name}.`,
              `- Comments: ${context.comments.length}; activity entries: ${context.activity.length}.`,
            ],
          },
        ],
        data: {
          task: taskSummary(context, query.view, query.include),
          comments: includedCollection(
            context.comments,
            query,
            "comments",
          ).map(serializeComment),
          activity: includedCollection(
            context.activity,
            query,
            "activity",
          ).map(serializeActivity),
        },
        nextCalls: taskNextCalls(context.task.id),
      },
      { format: query.format },
    );
  });

  app.patch(
    "/api/agents/tasks/:taskId",
    asyncHandler(async (req, res) => {
      const query = parseQuery(req, agentReadQuerySchema);
      const body = parseNonEmptyBody(req, taskUpdateSchema);
      const updated = await services.tasks.updateTask(req.params.taskId, body);
      const context = loadTaskWithParents(services, updated.task.id, true);

      sendAgentMarkdown(
        res,
        {
          outcome: `Updated task \`${updated.task.id}\`.`,
          sections: [
            {
              title: "What changed",
              lines: [
                `- Updated fields: ${Object.keys(body).join(", ")}.`,
                `- Generated activity \`${updated.activity.id}\`.`,
              ],
            },
          ],
          data: {
            task: taskSummary(context, "full", query.include),
            activity: serializeActivity(updated.activity),
          },
          nextCalls: taskNextCalls(updated.task.id),
        },
        { format: query.format },
      );
    }),
  );

  app.post("/api/agents/tasks/:taskId/move", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const body = parseBody(req, taskMoveSchema);
    const moved = services.tasks.moveTask(req.params.taskId, body);
    const context = loadTaskWithParents(services, moved.task.id, true);

    sendAgentMarkdown(
      res,
      {
        outcome: `Moved task \`${moved.task.id}\`.`,
        sections: [
          {
            title: "What changed",
            lines: [
              `- Task is now in column \`${context.column.key}\`.`,
              "- Moving into a done column sets `completedAt`; moving out of one clears it.",
              `- Generated activity \`${moved.activity.id}\`.`,
            ],
          },
        ],
        data: {
          task: taskSummary(context, "full", query.include),
          activity: serializeActivity(moved.activity),
        },
        nextCalls: taskNextCalls(moved.task.id),
      },
      { format: query.format },
    );
  });

  app.post("/api/agents/tasks/:taskId/complete", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const completed = services.tasks.completeTask(req.params.taskId);
    const context = loadTaskWithParents(services, completed.task.id, true);

    sendAgentMarkdown(
      res,
      {
        outcome: `Completed task \`${completed.task.id}\`.`,
        sections: [
          {
            title: "What changed",
            lines: [
              "- `completedAt` was set without changing the task column.",
              `- Generated activity \`${completed.activity.id}\`.`,
            ],
          },
        ],
        data: {
          task: taskSummary(context, "full", query.include),
          activity: serializeActivity(completed.activity),
        },
        nextCalls: taskNextCalls(completed.task.id),
      },
      { format: query.format },
    );
  });

  app.post("/api/agents/tasks/:taskId/archive", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const archived = services.tasks.archiveTask(req.params.taskId);
    const context = loadTaskWithParents(services, archived.task.id, true);

    sendAgentMarkdown(
      res,
      {
        outcome: `Archived task \`${archived.task.id}\`.`,
        sections: [
          {
            title: "What changed",
            lines: [
              "- Comments and activity remain attached.",
              "- Include archived content explicitly when you need to retrieve this task.",
              `- Generated activity \`${archived.activity.id}\`.`,
            ],
          },
        ],
        data: {
          task: taskSummary(context, "full", query.include),
          activity: serializeActivity(archived.activity),
        },
        nextCalls: [
          `GET /api/agents/tasks/${archived.task.id}?includeArchived=true`,
          `GET /api/agents/tasks/${archived.task.id}/context?includeArchived=true&include=comments,activity`,
        ],
      },
      { format: query.format },
    );
  });

  app.get("/api/agents/tasks/:taskId/context", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const context = loadTaskWithParents(
      services,
      req.params.taskId,
      query.includeArchived,
    );
    const commentPage = limitCollection(context.comments, query.commentLimit);
    const activityPage = limitCollection(context.activity, query.activityLimit);
    const includeComments = query.include.includes("comments");
    const includeActivity = query.include.includes("activity");

    sendAgentMarkdown(
      res,
      {
        outcome: `Loaded context for project \`${context.project.name}\`, board \`${context.board.name}\`, task \`${context.task.id}\`.`,
        sections: [
          {
            title: "What I found",
            lines: [
              ...taskMarkdownIntroLines(context, query.view),
              `- Parent project: \`${context.project.id}\` ${context.project.name}.`,
              `- Parent board: \`${context.board.id}\` ${context.board.name}.`,
              `- Attachments: ${context.attachments.length}.`,
              `- Comments returned: ${includeComments ? commentPage.items.length : 0} of ${context.comments.length}.`,
              `- Activity returned: ${includeActivity ? activityPage.items.length : 0} of ${context.activity.length}.`,
              ...truncationLines(
                includeComments && commentPage.truncated,
                "comments",
                `GET /api/agents/tasks/${context.task.id}/comments?offset=${query.commentLimit}&limit=${query.commentLimit}`,
              ),
              ...truncationLines(
                includeActivity && activityPage.truncated,
                "activity entries",
                `GET /api/agents/tasks/${context.task.id}/activity?offset=${query.activityLimit}&limit=${query.activityLimit}`,
              ),
            ],
          },
          ...(includeComments
            ? [
                {
                  title: "Comments",
                  lines: markdownCommentLines(commentPage.items),
                },
              ]
            : []),
          ...(includeActivity
            ? [
                {
                  title: "Activity",
                  lines: markdownActivityLines(activityPage.items),
                },
              ]
            : []),
          ...(context.attachments.length > 0
            ? [
                {
                  title: "Attachments",
                  lines: markdownAttachmentLines(context.attachments),
                },
              ]
            : []),
        ],
        nextCalls: taskNextCalls(context.task.id),
      },
      { format: query.format },
    );
  });

  app.get("/api/agents/tasks/:taskId/comments", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const context = loadTaskWithParents(
      services,
      req.params.taskId,
      query.includeArchived,
    );
    const page = paginate(context.comments, query.offset, query.limit);

    sendAgentMarkdown(
      res,
      {
        outcome: `Found ${page.items.length} comment${plural(page.items.length)} for task \`${context.task.id}\`.`,
        sections: [
          {
            title: "What I found",
            lines: [
              ...page.items.map(
                (comment) =>
                  `- \`${comment.id}\` ${comment.authorType}${comment.authorName ? ` ${comment.authorName}` : ""}: ${snippet(comment.body)}`,
              ),
              ...truncationLines(
                page.truncated,
                "comments",
                commentsNextCall(context.task.id, query),
              ),
            ],
          },
        ],
        data: {
          task: { id: context.task.id, title: context.task.title },
          comments: page.items.map(serializeComment),
          result: {
            truncated: page.truncated,
            offset: query.offset,
            limit: query.limit,
            total: context.comments.length,
          },
        },
        nextCalls: [
          `POST /api/agents/tasks/${context.task.id}/comments`,
          `GET /api/agents/tasks/${context.task.id}/context?include=comments,activity`,
        ],
      },
      { format: query.format },
    );
  });

  app.get("/api/agents/tasks/:taskId/attachments", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const context = loadTaskWithParents(
      services,
      req.params.taskId,
      query.includeArchived,
    );

    sendAgentMarkdown(
      res,
      {
        outcome: `Found ${context.attachments.length} attachment${plural(context.attachments.length)} for task \`${context.task.id}\`.`,
        sections: [
          {
            title: "What I found",
            lines: markdownAttachmentLines(context.attachments),
          },
        ],
        data: {
          task: { id: context.task.id, title: context.task.title },
          attachments: context.attachments.map(serializeAgentAttachment),
        },
        nextCalls: [`GET /api/agents/tasks/${context.task.id}/context`],
      },
      { format: query.format },
    );
  });

  app.post(
    "/api/agents/tasks/:taskId/attachments",
    uploadAttachmentFile,
    asyncHandler(async (req, res) => {
      const query = parseQuery(req, agentReadQuerySchema);
      if (!req.file) {
        throw new ApiError(400, "invalid_request", "Attachment file is required");
      }

      const created = await services.attachments.createTaskAttachment(
        req.params.taskId,
        req.file,
      );
      const context = loadTaskWithParents(
        services,
        created.attachment.taskId,
        true,
      );

      sendAgentMarkdown(
        res,
        {
          outcome: `Uploaded attachment \`${created.attachment.id}\` to task \`${context.task.id}\`.`,
          sections: [
            {
              title: "What changed",
              lines: [
                `- Stored \`${created.attachment.originalName}\` at \`${created.attachment.relativePath}\`.`,
                `- Generated activity \`${created.activity.id}\`.`,
              ],
            },
          ],
          data: {
            task: { id: context.task.id, title: context.task.title },
            attachment: serializeAgentAttachment(created.attachment),
            activity: serializeActivity(created.activity),
          },
          nextCalls: [
            `GET /api/agents/tasks/${context.task.id}/attachments`,
            `GET /api/agents/tasks/${context.task.id}/context`,
          ],
        },
        { status: 201, format: query.format },
      );
    }),
  );

  app.post(
    "/api/agents/tasks/:taskId/comments",
    asyncHandler(async (req, res) => {
      const query = parseQuery(req, agentReadQuerySchema);
      const body = parseBody(req, commentCreateSchema);
      const created = await services.comments.createComment(req.params.taskId, body);

      sendAgentMarkdown(
        res,
        {
          outcome: `Created comment \`${created.comment.id}\`.`,
          sections: [
            {
              title: "What changed",
              lines: [
                `- Added a comment to task \`${created.comment.taskId}\`.`,
                `- Generated activity \`${created.activity.id}\`.`,
              ],
            },
          ],
          data: {
            comment: serializeComment(created.comment),
            activity: serializeActivity(created.activity),
          },
          nextCalls: [
            `GET /api/agents/tasks/${created.comment.taskId}/context?include=comments,activity`,
            `GET /api/agents/tasks/${created.comment.taskId}/comments`,
          ],
        },
        { status: 201, format: query.format },
      );
    }),
  );

  app.get("/api/agents/tasks/:taskId/activity", (req, res) => {
    const query = parseQuery(req, agentReadQuerySchema);
    const context = loadTaskWithParents(
      services,
      req.params.taskId,
      query.includeArchived,
    );
    const page = paginate(context.activity, query.offset, query.limit);

    sendAgentMarkdown(
      res,
      {
        outcome: `Found ${page.items.length} activity entr${page.items.length === 1 ? "y" : "ies"} for task \`${context.task.id}\`.`,
        sections: [
          {
            title: "What I found",
            lines: [
              ...page.items.map(
                (activity) =>
                  `- \`${activity.id}\` ${activity.eventType}: ${activity.summary}`,
              ),
              ...truncationLines(
                page.truncated,
                "activity entries",
                activityNextCall(context.task.id, query),
              ),
            ],
          },
        ],
        data: {
          task: { id: context.task.id, title: context.task.title },
          activity: page.items.map((activity) =>
            query.view === "brief"
              ? {
                  id: activity.id,
                  eventType: activity.eventType,
                  summary: activity.summary,
                  createdAt: serializeActivity(activity).createdAt,
                }
              : serializeActivity(activity),
          ),
          result: {
            truncated: page.truncated,
            offset: query.offset,
            limit: query.limit,
            total: context.activity.length,
          },
        },
        nextCalls: [
          `GET /api/agents/tasks/${context.task.id}/context?include=comments,activity`,
        ],
      },
      { format: query.format },
    );
  });

  app.get(
    "/api/agents/search",
    asyncHandler(async (req, res) => {
      const query = parseQuery(req, agentSearchQuerySchema);
      const scope = resolveAgentScope(services, query, query.includeArchived);
      const input: SearchInput = {
        query: query.q,
        projectId: scope.project?.id,
        boardId: scope.board?.id,
        taskId: query.taskId,
        sourceTypes: query.sourceTypes,
        includeArchived: query.includeArchived,
        limit: query.limit,
      };
      const results = await services.search.search(input);
      sendSearchResponse(res, query.format, input.query, results);
    }),
  );

  app.post(
    "/api/agents/search",
    asyncHandler(async (req, res) => {
      const query = parseQuery(req, agentReadQuerySchema);
      const body = parseBody(req, searchSchema);
      const scope = resolveAgentScope(services, body, body.includeArchived);
      const input = {
        ...body,
        projectId: scope.project?.id,
        boardId: scope.board?.id,
      };
      const results = await services.search.search(input);
      sendSearchResponse(res, query.format, body.query, results);
    }),
  );

  app.use("/api/agents", agentErrorHandler);
}

function sendSearchResponse(
  res: Parameters<typeof sendAgentMarkdown>[0],
  format: AgentFormat,
  query: string,
  results: SearchResult[],
) {
  sendAgentMarkdown(
    res,
    {
      outcome: `Found ${results.length} search result${plural(results.length)} for \`${query}\`.`,
      sections: [
        {
          title: "What I found",
          lines: results.map(
            (result) =>
              `- ${result.sourceType} \`${result.sourceId}\`: ${snippet(result.snippet)}`,
          ),
        },
      ],
      data: {
        query,
        results: results.map((result) => ({
          ...result,
          next: taskContextCallForSearchResult(result),
        })),
      },
      nextCalls: results
        .map(taskContextCallForSearchResult)
        .filter((call): call is string => Boolean(call)),
    },
    { format },
  );
}

function taskContextCallForSearchResult(result: SearchResult) {
  const taskId =
    result.taskId ?? (result.sourceType === "task" ? result.sourceId : undefined);
  return taskId
    ? `GET /api/agents/tasks/${taskId}/context?include=comments,activity`
    : undefined;
}

const agentErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  void next;

  const format = formatFromRequest(req);
  if (error instanceof ApiError) {
    res.status(error.status).type("text/markdown").send(renderAgentError(error, format));
    return;
  }

  console.error(error);
  const internal = new ApiError(500, "internal_error", "Internal server error");
  res.status(500).type("text/markdown").send(renderAgentError(internal, format));
};

function formatFromRequest(req: Request): AgentFormat {
  const value = Array.isArray(req.query.format)
    ? req.query.format[0]
    : req.query.format;
  return value === "yaml" || value === "json" || value === "none"
    ? value
    : "toon";
}

function rankProjects(projects: Project[], query: AgentReadQuery) {
  if (!query.q && !query.repositoryPath) {
    return projects;
  }

  const needle = query.q?.toLowerCase();
  const repositoryPath = query.repositoryPath?.toLowerCase();
  return [...projects].sort(
    (left, right) =>
      projectScore(right, needle, repositoryPath) -
      projectScore(left, needle, repositoryPath),
  );
}

function projectScore(
  project: Project,
  needle: string | undefined,
  repositoryPath: string | undefined,
) {
  let score = 0;
  const name = project.name.toLowerCase();
  const description = project.description?.toLowerCase() ?? "";
  const path = project.repositoryPath?.toLowerCase() ?? "";

  if (needle && name.includes(needle)) {
    score += 10;
  }
  if (needle && description.includes(needle)) {
    score += 4;
  }
  if (needle && path.includes(needle)) {
    score += 6;
  }
  if (repositoryPath && path === repositoryPath) {
    score += 20;
  }
  if (repositoryPath && path.includes(repositoryPath)) {
    score += 8;
  }

  return score;
}

function rankBoards(boards: Board[], q: string | undefined) {
  if (!q) {
    return boards;
  }

  const needle = q.toLowerCase();
  return [...boards].sort((left, right) => {
    const rightScore = boardMatches(right, needle) ? 1 : 0;
    const leftScore = boardMatches(left, needle) ? 1 : 0;
    return rightScore - leftScore;
  });
}

function boardMatches(board: Board, needle: string) {
  return (
    board.name.toLowerCase().includes(needle) ||
    (board.description?.toLowerCase().includes(needle) ?? false)
  );
}

async function discoverTasks(
  services: ApiServices,
  query: AgentTaskListQuery,
): Promise<TaskDiscoveryRow[]> {
  const includeArchived =
    query.includeArchived || query.status === "archived" || query.status === "all";
  const scope = resolveAgentScope(services, query, includeArchived);
  const semanticIds =
    query.q && query.semantic
      ? await semanticTaskIds(services, query, includeArchived, scope)
      : undefined;
  const semanticOrder = new Map(
    semanticIds?.map((result, index) => [result.sourceId, { result, index }]) ?? [],
  );
  const projects = scope.project
    ? [scope.project]
    : services.projects.listProjects(includeArchived);
  const rows: TaskDiscoveryRow[] = [];

  for (const project of projects) {
    const boards = scope.board
      ? scope.board.projectId === project.id
        ? [scope.board]
        : []
      : services.boards.listBoards(project.id, includeArchived);

    for (const board of boards) {
      const columns = services.boards.listBoardColumns(board.id);
      const tasks = services.tasks.listBoardTasks(project.id, board.id, includeArchived).tasks;
      for (const task of tasks) {
        const column = columnForTask(columns, task);
        const comments = services.comments.listTaskComments(task.id);
        const activity = services.comments.listTaskActivity(task.id);
        const attachments = services.attachments.listTaskAttachments(task.id);
        const row: TaskDiscoveryRow = {
          project,
          board,
          columns,
          column,
          task,
          comments,
          activity,
          attachments,
          search: semanticOrder.get(task.id)?.result,
        };

        if (matchesTaskQuery(row, query, semanticOrder)) {
          rows.push(row);
        }
      }
    }
  }

  return rows.sort((left, right) => {
    if (semanticOrder.size > 0) {
      return (
        (semanticOrder.get(left.task.id)?.index ?? Number.MAX_SAFE_INTEGER) -
        (semanticOrder.get(right.task.id)?.index ?? Number.MAX_SAFE_INTEGER)
      );
    }

    return (
      left.project.name.localeCompare(right.project.name) ||
      left.board.name.localeCompare(right.board.name) ||
      left.column.position - right.column.position ||
      left.task.position - right.task.position ||
      left.task.createdAt.getTime() - right.task.createdAt.getTime()
    );
  });
}

async function semanticTaskIds(
  services: ApiServices,
  query: AgentTaskListQuery,
  includeArchived: boolean,
  scope: AgentScope,
) {
  if (!query.q) {
    return [];
  }

  return services.search.search({
    query: query.q,
    projectId: scope.project?.id,
    boardId: scope.board?.id,
    sourceTypes: ["task"],
    includeArchived,
    limit: Math.min(50, Math.max(query.limit + query.offset, query.limit)),
  });
}

type AgentScopeInput = {
  projectId?: string;
  boardId?: string;
};

type AgentScope = {
  project?: Project;
  board?: Board;
};

function resolveAgentScope(
  services: ApiServices,
  input: AgentScopeInput,
  includeArchived: boolean,
): AgentScope {
  const project = input.projectId
    ? services.projects.getProjectByRef(input.projectId, includeArchived)
    : undefined;
  const board = input.boardId
    ? project
      ? services.boards.getBoardByRef(project.id, input.boardId, includeArchived)
      : services.boards.getBoardByRefAcrossProjects(
          input.boardId,
          includeArchived,
        )
    : undefined;
  const boardProject =
    board && !project
      ? services.projects.getProject(board.projectId, includeArchived)
      : undefined;

  return {
    project: project ?? boardProject,
    board,
  };
}

function matchesTaskQuery(
  row: TaskDiscoveryRow,
  query: AgentTaskListQuery,
  semanticOrder: Map<string, { result: SearchResult; index: number }>,
) {
  if (semanticOrder.size > 0 && !semanticOrder.has(row.task.id)) {
    return false;
  }
  if (query.columnKey && row.column.key !== query.columnKey) {
    return false;
  }
  if (query.priority && row.task.priority !== query.priority) {
    return false;
  }
  if (query.labels.length > 0) {
    const labels = normalizeLabels(row.task.labels);
    if (!query.labels.every((label) => labels.includes(label))) {
      return false;
    }
  }
  if (query.q && !query.semantic && !matchesTextQuery(row.task, query.q)) {
    return false;
  }

  return matchesStatus(row, query.status);
}

function matchesTextQuery(task: Task, q: string) {
  const needle = q.toLowerCase();
  return (
    task.title.toLowerCase().includes(needle) ||
    (task.description?.toLowerCase().includes(needle) ?? false) ||
    normalizeLabels(task.labels).some((label) => label.toLowerCase().includes(needle))
  );
}

function matchesStatus(row: TaskDiscoveryRow, status: AgentTaskListQuery["status"]) {
  const archived = Boolean(row.task.archivedAt);
  const done = Boolean(row.task.completedAt) || row.column.isDone;

  if (status === "all") {
    return true;
  }
  if (status === "archived") {
    return archived;
  }
  if (archived) {
    return false;
  }
  if (status === "pending") {
    return !done;
  }
  if (status === "done") {
    return done;
  }
  if (status === "blocked") {
    return row.column.key === "blocked";
  }
  if (status === "review") {
    return row.column.key === "review";
  }
  if (status === "active") {
    return !done && row.column.key !== "blocked";
  }

  return true;
}

function loadTaskWithParents(
  services: ApiServices,
  taskId: string,
  includeArchived: boolean,
): TaskWithParents {
  const task = services.tasks.getTask(taskId, includeArchived);
  const project = services.projects.getProject(task.projectId, includeArchived);
  const board = services.boards.getBoard(project.id, task.boardId, includeArchived);
  const columns = services.boards.listBoardColumns(board.id);
  const column = columnForTask(columns, task);
  const comments = services.comments.listTaskComments(task.id);
  const activity = services.comments.listTaskActivity(task.id);
  const attachments = services.attachments.listTaskAttachments(task.id, true);
  return { project, board, columns, column, task, comments, activity, attachments };
}

function columnForTask(columns: BoardColumn[], task: Task) {
  const column = columns.find((item) => item.id === task.columnId);
  if (!column) {
    throw new ApiError(409, "invalid_state", "Task column no longer exists");
  }

  return column;
}

function taskMarkdownIntroLines(
  context: TaskWithParents,
  view: AgentReadQuery["view"],
) {
  return [
    `- Task: ${context.task.title}.`,
    ...(view === "full" && context.task.description?.trim()
      ? [context.task.description]
      : []),
  ];
}

function markdownCommentLines(comments: TaskComment[]) {
  if (comments.length === 0) {
    return ["No comments matched this request."];
  }

  return comments.flatMap((comment, index) => [
    ...(index > 0 ? ["---"] : []),
    `### Comment ${index + 1}`,
    `Author: ${comment.authorType}${comment.authorName ? ` ${comment.authorName}` : ""}`,
    `Created: ${comment.createdAt.toISOString()}`,
    comment.body,
  ]);
}

function markdownActivityLines(activity: TaskActivity[]) {
  if (activity.length === 0) {
    return ["No activity entries matched this request."];
  }

  return activity.map(
    (entry) =>
      `- ${entry.createdAt.toISOString()} ${entry.eventType}: ${entry.summary}`,
  );
}

function markdownAttachmentLines(attachments: TaskAttachment[]) {
  if (attachments.length === 0) {
    return ["No attachments matched this request."];
  }

  return attachments.map(
    (attachment) =>
      `- \`${attachment.relativePath}\` ${attachment.originalName} (${attachment.contentType}, ${attachment.sizeBytes} bytes)`,
  );
}

function projectSummary(
  project: Project,
  view: AgentReadQuery["view"],
  include: AgentReadQuery["include"],
) {
  return pruneEmpty({
    id: project.id,
    name: project.name,
    description:
      view === "brief" && !include.includes("description")
        ? undefined
        : project.description,
    repositoryPath: project.repositoryPath,
    defaultBranch: project.defaultBranch,
    metadata: include.includes("metadata") || view === "full" ? project.metadata : undefined,
    archivedAt: serializeProject(project).archivedAt,
    createdAt: view === "full" ? serializeProject(project).createdAt : undefined,
    updatedAt: view === "full" ? serializeProject(project).updatedAt : undefined,
  });
}

function boardSummary(
  board: Board,
  columns: BoardColumn[],
  view: AgentReadQuery["view"],
  include: AgentReadQuery["include"],
) {
  return pruneEmpty({
    id: board.id,
    projectId: board.projectId,
    name: board.name,
    description:
      view === "brief" && !include.includes("description")
        ? undefined
        : board.description,
    columns:
      view === "brief"
        ? columns.map((column) => ({
            id: column.id,
            key: column.key,
            name: column.name,
            isDone: column.isDone,
          }))
        : columns.map(serializeBoardColumn),
    metadata: include.includes("metadata") || view === "full" ? board.metadata : undefined,
    archivedAt: serializeBoard(board).archivedAt,
    createdAt: view === "full" ? serializeBoard(board).createdAt : undefined,
    updatedAt: view === "full" ? serializeBoard(board).updatedAt : undefined,
  });
}

function boardSummaryWithCounts(
  board: Board,
  columns: BoardColumn[],
  tasks: Task[],
  query: AgentReadQuery,
) {
  const counts = Object.fromEntries(
    columns.map((column) => [
      column.key,
      tasks.filter((task) => task.columnId === column.id).length,
    ]),
  );

  return {
    ...boardSummary(board, columns, query.view, query.include),
    taskCounts: counts,
  };
}

function taskSummary(
  context: TaskWithParents,
  view: AgentReadQuery["view"],
  include: AgentReadQuery["include"],
) {
  const serialized = serializeTask(context.task);
  return pruneEmpty({
    id: context.task.id,
    projectId: context.project.id,
    projectName: context.project.name,
    boardId: context.board.id,
    boardName: context.board.name,
    columnId: context.column.id,
    columnKey: context.column.key,
    columnName: context.column.name,
    title: context.task.title,
    description:
      view === "brief" && !include.includes("description")
        ? undefined
        : view === "full" || include.includes("description")
          ? context.task.description
          : snippet(context.task.description),
    priority: context.task.priority,
    labels: normalizeLabels(context.task.labels),
    position: context.task.position,
    comments: context.comments.length,
    activity: context.activity.length,
    attachments: context.attachments.length,
    externalReferences:
      include.includes("externalReferences") || view === "full"
        ? serialized.externalReferences
        : undefined,
    metadata: include.includes("metadata") || view === "full" ? context.task.metadata : undefined,
    completedAt: serialized.completedAt,
    archivedAt: serialized.archivedAt,
    createdAt: view === "full" ? serialized.createdAt : undefined,
    updatedAt: view === "full" ? serialized.updatedAt : undefined,
    next: `GET /api/agents/tasks/${context.task.id}/context?include=comments,activity`,
  });
}

function groupTasksByColumn(
  project: Project,
  board: Board,
  columns: BoardColumn[],
  tasks: Task[],
  query: AgentReadQuery,
) {
  let truncated = false;
  const grouped = columns.map((column) => {
    const columnTasks = tasks.filter((task) => task.columnId === column.id);
    const page = limitCollection(columnTasks, query.perColumnLimit);
    truncated ||= page.truncated;

    return {
      key: column.key,
      name: column.name,
      total: columnTasks.length,
      truncated: page.truncated,
      tasks: page.items.map((task) =>
        taskSummary(
          {
            project,
            board,
            columns,
            column,
            task,
            comments: [],
            activity: [],
            attachments: [],
          },
          query.view,
          query.include,
        ),
      ),
      next: page.truncated
        ? `GET /api/agents/tasks?boardId=${board.id}&columnKey=${column.key}&offset=${query.perColumnLimit}&limit=${query.perColumnLimit}`
        : undefined,
    };
  });

  return { columns: grouped, truncated };
}

function groupDiscoveryRows(
  rows: TaskDiscoveryRow[],
  query: AgentTaskListQuery,
) {
  const grouped = new Map<string, JsonObject>();
  for (const row of rows) {
    const key = `${row.project.id}:${row.board.id}`;
    const existing = grouped.get(key);
    const task = taskSummary(row, query.view, query.include);
    if (existing) {
      (existing.tasks as JsonArray).push(task);
      continue;
    }

    grouped.set(key, {
      project: { id: row.project.id, name: row.project.name },
      board: { id: row.board.id, name: row.board.name },
      tasks: [task],
    });
  }

  return [...grouped.values()];
}

function includedCollection<T>(
  items: T[],
  query: AgentReadQuery,
  collection: "comments" | "activity",
) {
  if (query.view === "full" || query.include.includes(collection)) {
    const limit = collection === "comments" ? query.commentLimit : query.activityLimit;
    return limitCollection(items, limit).items;
  }

  return [];
}

function limitCollection<T>(items: T[], limit: number) {
  return {
    items: items.slice(0, limit),
    truncated: items.length > limit,
  };
}

function paginate<T>(items: T[], offset: number, limit: number) {
  return {
    items: items.slice(offset, offset + limit),
    truncated: offset + limit < items.length,
  };
}

function normalizeLabels(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function snippet(value: string | null | undefined, maxLength = 180) {
  if (!value) {
    return "";
  }

  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}...` : compact;
}

function plural(count: number) {
  return count === 1 ? "" : "s";
}

function truncationLines(truncated: boolean, label: string, nextCall: string) {
  return truncated
    ? [`- More ${label} were omitted. Continue with \`${nextCall}\`.`]
    : [];
}

function pruneEmpty(value: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function taskNextCalls(taskId: string) {
  return [
    `GET /api/agents/tasks/${taskId}/context?include=comments,activity`,
    `GET /api/agents/tasks/${taskId}/attachments`,
    `POST /api/agents/tasks/${taskId}/attachments`,
    `GET /api/agents/tasks/${taskId}/comments`,
    `GET /api/agents/tasks/${taskId}/activity`,
    `POST /api/agents/tasks/${taskId}/move`,
    `POST /api/agents/tasks/${taskId}/complete`,
    `POST /api/agents/tasks/${taskId}/archive`,
    `POST /api/agents/tasks/${taskId}/comments`,
  ];
}

function projectListNextCall(query: AgentReadQuery) {
  return `GET /api/agents/projects?offset=${query.offset + query.limit}&limit=${query.limit}`;
}

function boardsNextCall(projectId: string, query: AgentReadQuery) {
  return `GET /api/agents/projects/${projectId}/boards?offset=${query.offset + query.limit}&limit=${query.limit}`;
}

function boardTasksNextCall(projectId: string, boardId: string, query: AgentReadQuery) {
  return `GET /api/agents/projects/${projectId}/boards/${boardId}?includeTasks=true&perColumnLimit=${query.perColumnLimit}`;
}

function tasksNextCall(query: AgentTaskListQuery) {
  const params = new URLSearchParams({
    offset: String(query.offset + query.limit),
    limit: String(query.limit),
    status: query.status,
  });
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.boardId) params.set("boardId", query.boardId);
  if (query.columnKey) params.set("columnKey", query.columnKey);
  if (query.priority) params.set("priority", query.priority);
  if (query.labels.length > 0) params.set("labels", query.labels.join(","));
  if (query.q) params.set("q", query.q);
  if (query.semantic) params.set("semantic", "true");
  if (query.includeArchived) params.set("includeArchived", "true");
  return `GET /api/agents/tasks?${params.toString()}`;
}

function commentsNextCall(taskId: string, query: AgentReadQuery) {
  return `GET /api/agents/tasks/${taskId}/comments?offset=${query.offset + query.limit}&limit=${query.limit}`;
}

function activityNextCall(taskId: string, query: AgentReadQuery) {
  return `GET /api/agents/tasks/${taskId}/activity?offset=${query.offset + query.limit}&limit=${query.limit}`;
}
