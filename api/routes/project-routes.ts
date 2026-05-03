import type { Express } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { parseBody, parseNonEmptyBody, parseQuery } from "../http/validation.js";
import {
  includeArchivedQuerySchema,
  projectCreateSchema,
  projectUpdateSchema,
} from "../models/request-schemas.js";
import { serializeProject } from "../models/serializers.js";
import type { ApiServices } from "../services/index.js";

export function registerProjectRoutes(app: Express, services: ApiServices) {
  app.get("/api/projects", (req, res) => {
    const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
    const projects = services.projects.listProjects(includeArchived);
    res.json({ projects: projects.map(serializeProject) });
  });

  app.post("/api/projects", (req, res) => {
    const body = parseBody(req, projectCreateSchema);
    const project = services.projects.createProject(body);
    res.status(201).json({ project: serializeProject(project) });
  });

  app.get("/api/projects/:projectId", (req, res) => {
    const { includeArchived } = parseQuery(req, includeArchivedQuerySchema);
    const project = services.projects.getProject(
      req.params.projectId,
      includeArchived,
    );
    res.json({ project: serializeProject(project) });
  });

  app.patch("/api/projects/:projectId", (req, res) => {
    const body = parseNonEmptyBody(req, projectUpdateSchema);
    const project = services.projects.updateProject(req.params.projectId, body);
    res.json({ project: serializeProject(project) });
  });

  app.post("/api/projects/:projectId/archive", (req, res) => {
    const project = services.projects.archiveProject(req.params.projectId);
    res.json({ project: serializeProject(project) });
  });

  app.delete(
    "/api/projects/:projectId",
    asyncHandler(async (req, res) => {
      const deleted = services.projects.deleteProject(req.params.projectId);
      await services.attachments.removeAttachmentFilesBestEffort(
        deleted.attachmentRelativePaths,
      );

      res.json({
        project: serializeProject(deleted.project),
        deleted: { attachmentFiles: deleted.attachmentRelativePaths.length },
      });
    }),
  );
}
