import type { Express } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { ApiError } from "../http/errors.js";
import {
  parseBody,
  parseNonEmptyBody,
  parseQuery,
} from "../http/validation.js";
import {
  commentCreateSchema,
  includeArchivedQuerySchema,
  taskCreateSchema,
  taskMoveSchema,
  taskUpdateSchema,
} from "../models/request-schemas.js";
import {
  serializeAttachment,
  serializeActivity,
  serializeBoard,
  serializeComment,
  serializeProject,
  serializeTask,
} from "../models/serializers.js";
import type { ApiServices } from "../services/index.js";
import { uploadAttachmentFile } from "./attachment-upload.js";

export function registerTaskRoutes(app: Express, services: ApiServices) {
  app.get("/api/projects/:projectId/boards/:boardId/tasks", (req, res) => {
    const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
    const { tasks } = services.tasks.listBoardTasks(
      req.params.projectId,
      req.params.boardId,
      includeArchived,
    );

    res.json({ tasks: tasks.map(serializeTask) });
  });

  app.post(
    "/api/projects/:projectId/boards/:boardId/tasks",
    asyncHandler(async (req, res) => {
      const body = parseBody(req, taskCreateSchema);
      const created = await services.tasks.createTask(
        req.params.projectId,
        req.params.boardId,
        body,
      );

      res.status(201).json({
        task: serializeTask(created.task),
        activity: serializeActivity(created.activity),
      });
    }),
  );

  app.get("/api/tasks/:taskId", (req, res) => {
    const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
    const task = services.tasks.getTask(req.params.taskId, includeArchived);
    res.json({ task: serializeTask(task) });
  });

  app.patch(
    "/api/tasks/:taskId",
    asyncHandler(async (req, res) => {
      const body = parseNonEmptyBody(req, taskUpdateSchema);
      const updated = await services.tasks.updateTask(req.params.taskId, body);

      res.json({
        task: serializeTask(updated.task),
        activity: serializeActivity(updated.activity),
      });
    }),
  );

  app.post("/api/tasks/:taskId/move", (req, res) => {
    const body = parseBody(req, taskMoveSchema);
    const moved = services.tasks.moveTask(req.params.taskId, body);

    res.json({
      task: serializeTask(moved.task),
      activity: serializeActivity(moved.activity),
    });
  });

  app.post("/api/tasks/:taskId/complete", (req, res) => {
    const completed = services.tasks.completeTask(req.params.taskId);

    res.json({
      task: serializeTask(completed.task),
      activity: serializeActivity(completed.activity),
    });
  });

  app.post("/api/tasks/:taskId/archive", (req, res) => {
    const archived = services.tasks.archiveTask(req.params.taskId);

    res.json({
      task: serializeTask(archived.task),
      activity: serializeActivity(archived.activity),
    });
  });

  app.get("/api/tasks/:taskId/comments", (req, res) => {
    const comments = services.comments.listTaskComments(req.params.taskId);
    res.json({ comments: comments.map(serializeComment) });
  });

  app.post(
    "/api/tasks/:taskId/comments",
    asyncHandler(async (req, res) => {
      const body = parseBody(req, commentCreateSchema);
      const created = await services.comments.createComment(
        req.params.taskId,
        body,
      );

      res.status(201).json({
        comment: serializeComment(created.comment),
        activity: serializeActivity(created.activity),
      });
    }),
  );

  app.get("/api/tasks/:taskId/activity", (req, res) => {
    const activity = services.comments.listTaskActivity(req.params.taskId);
    res.json({ activity: activity.map(serializeActivity) });
  });

  app.get("/api/tasks/:taskId/attachments", (req, res) => {
    const attachments = services.attachments.listTaskAttachments(
      req.params.taskId,
    );
    res.json({ attachments: attachments.map(serializeAttachment) });
  });

  app.post(
    "/api/tasks/:taskId/attachments",
    uploadAttachmentFile,
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new ApiError(400, "invalid_request", "Attachment file is required");
      }

      const created = await services.attachments.createTaskAttachment(
        req.params.taskId,
        req.file,
      );

      res.status(201).json({
        attachment: serializeAttachment(created.attachment),
        activity: serializeActivity(created.activity),
      });
    }),
  );

  app.delete(
    "/api/tasks/:taskId/attachments/:attachmentId",
    asyncHandler(async (req, res) => {
      const { attachment, activity } =
        await services.attachments.deleteTaskAttachment(
          req.params.taskId,
          req.params.attachmentId,
        );

      res.json({
        attachment: serializeAttachment(attachment),
        activity: serializeActivity(activity),
      });
    }),
  );

  app.get("/api/tasks/:taskId/context", (req, res) => {
    const context = services.comments.getTaskContext(req.params.taskId);
    const attachments = services.attachments.listTaskAttachments(
      req.params.taskId,
    );

    res.json({
      project: serializeProject(context.project),
      board: serializeBoard(context.board, { columns: context.columns }),
      task: serializeTask(context.task),
      comments: context.comments.map(serializeComment),
      activity: context.activity.map(serializeActivity),
      attachments: attachments.map(serializeAttachment),
    });
  });
}
