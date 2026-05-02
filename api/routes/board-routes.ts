import type { Express } from "express";
import { parseBody, parseNonEmptyBody, parseQuery } from "../http/validation.js";
import {
  boardCreateSchema,
  boardUpdateSchema,
  includeArchivedQuerySchema,
} from "../models/request-schemas.js";
import { serializeBoard } from "../models/serializers.js";
import type { ApiServices } from "../services/index.js";

export function registerBoardRoutes(app: Express, services: ApiServices) {
  app.get("/api/projects/:projectId/boards", (req, res) => {
    const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
    const boards = services.boards.listBoards(
      req.params.projectId,
      includeArchived,
    );
    res.json({ boards: boards.map((board) => serializeBoard(board)) });
  });

  app.post("/api/projects/:projectId/boards", (req, res) => {
    const body = parseBody(req, boardCreateSchema);
    const created = services.boards.createBoard(req.params.projectId, body);

    res.status(201).json({
      board: serializeBoard(created.board, { columns: created.columns }),
    });
  });

  app.get("/api/projects/:projectId/boards/:boardId", (req, res) => {
    const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
    services.projects.getProject(req.params.projectId, includeArchived);
    const board = services.boards.getBoard(
      req.params.projectId,
      req.params.boardId,
      includeArchived,
    );
    const columns = services.boards.listBoardColumns(board.id);
    const includeTasks = req.query.includeTasks === "true";
    const taskRows = includeTasks
      ? services.tasks.listBoardTasks(
          req.params.projectId,
          board.id,
          includeArchived,
        ).tasks
      : [];

    res.json({
      board: serializeBoard(board, {
        columns,
        tasks: includeTasks ? taskRows : undefined,
      }),
    });
  });

  app.patch("/api/projects/:projectId/boards/:boardId", (req, res) => {
    const body = parseNonEmptyBody(req, boardUpdateSchema);
    const board = services.boards.updateBoard(
      req.params.projectId,
      req.params.boardId,
      body,
    );

    res.json({
      board: serializeBoard(board, {
        columns: services.boards.listBoardColumns(board.id),
      }),
    });
  });

  app.post("/api/projects/:projectId/boards/:boardId/archive", (req, res) => {
    const board = services.boards.archiveBoard(
      req.params.projectId,
      req.params.boardId,
    );

    res.json({
      board: serializeBoard(board, {
        columns: services.boards.listBoardColumns(board.id),
      }),
    });
  });
}
