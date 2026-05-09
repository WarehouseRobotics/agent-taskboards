import type { Express } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { parseBody, parseQuery } from "../http/validation.js";
import {
  checkpointCreateSchema,
  includeArchivedQuerySchema,
} from "../models/request-schemas.js";
import { serializeBoard, serializeCheckpoint } from "../models/serializers.js";
import type { ApiServices } from "../services/index.js";

export function registerCheckpointRoutes(app: Express, services: ApiServices) {
  app.get(
    "/api/projects/:projectId/boards/:boardId/checkpoints",
    (req, res) => {
      const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
      const checkpoints = services.checkpoints.listCheckpoints(
        req.params.projectId,
        req.params.boardId,
        includeArchived,
      );

      res.json({
        checkpoints: checkpoints.map((checkpoint) =>
          serializeCheckpoint(checkpoint),
        ),
      });
    },
  );

  app.post(
    "/api/projects/:projectId/boards/:boardId/checkpoints",
    (req, res) => {
      const body = parseBody(req, checkpointCreateSchema);
      const checkpoint = services.checkpoints.createCheckpoint(
        req.params.projectId,
        req.params.boardId,
        body,
      );

      res.status(201).json({
        checkpoint: serializeCheckpoint(checkpoint),
      });
    },
  );

  app.get(
    "/api/projects/:projectId/boards/:boardId/checkpoints/:checkpointId",
    (req, res) => {
      const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
      const checkpoint = services.checkpoints.getCheckpoint(
        req.params.projectId,
        req.params.boardId,
        req.params.checkpointId,
        includeArchived,
      );

      res.json({
        checkpoint: serializeCheckpoint(checkpoint, { includeSnapshot: true }),
      });
    },
  );

  app.post(
    "/api/projects/:projectId/boards/:boardId/checkpoints/:checkpointId/restore",
    asyncHandler(async (req, res) => {
      const restored = await services.checkpoints.restoreCheckpoint(
        req.params.projectId,
        req.params.boardId,
        req.params.checkpointId,
      );

      res.json({
        checkpoint: serializeCheckpoint(restored.checkpoint),
        board: serializeBoard(restored.board, {
          columns: restored.columns,
          tasks: restored.tasks,
        }),
        warnings: restored.warnings,
        idMappings: restored.idMappings,
      });
    }),
  );

  app.delete(
    "/api/projects/:projectId/boards/:boardId/checkpoints/:checkpointId",
    (req, res) => {
      const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
      const checkpoint = services.checkpoints.deleteCheckpoint(
        req.params.projectId,
        req.params.boardId,
        req.params.checkpointId,
        includeArchived,
      );

      res.json({ checkpoint: serializeCheckpoint(checkpoint) });
    },
  );
}
