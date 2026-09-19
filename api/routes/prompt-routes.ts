import type { Express } from "express";
import { parseBody, parseNonEmptyBody, parseQuery } from "../http/validation.js";
import {
  promptCategoryCreateSchema,
  promptCategoryUpdateSchema,
  promptCreateSchema,
  promptListQuerySchema,
  promptUpdateSchema,
} from "../models/request-schemas.js";
import {
  serializePrompt,
  serializePromptCategory,
} from "../models/serializers.js";
import type { ApiServices } from "../services/index.js";

export function registerPromptRoutes(app: Express, services: ApiServices) {
  app.get("/api/prompt-categories", (_req, res) => {
    const categories = services.prompts.listCategories();
    res.json({ categories: categories.map(serializePromptCategory) });
  });

  app.post("/api/prompt-categories", (req, res) => {
    const body = parseBody(req, promptCategoryCreateSchema);
    const category = services.prompts.createCategory(body);
    res.status(201).json({ category: serializePromptCategory(category) });
  });

  app.patch("/api/prompt-categories/:categoryId", (req, res) => {
    const body = parseNonEmptyBody(req, promptCategoryUpdateSchema);
    const category = services.prompts.updateCategory(
      req.params.categoryId,
      body,
    );
    res.json({ category: serializePromptCategory(category) });
  });

  app.delete("/api/prompt-categories/:categoryId", (req, res) => {
    const category = services.prompts.deleteCategory(req.params.categoryId);
    res.json({ category: serializePromptCategory(category) });
  });

  app.get("/api/prompts", (req, res) => {
    const query = parseQuery(req, promptListQuerySchema);
    const results = services.prompts.listPrompts(query);
    res.json({
      prompts: results.map(({ prompt, categoryIds }) =>
        serializePrompt(prompt, categoryIds),
      ),
    });
  });

  app.post("/api/prompts", (req, res) => {
    const body = parseBody(req, promptCreateSchema);
    const { prompt, categoryIds } = services.prompts.createPrompt(body);
    res.status(201).json({ prompt: serializePrompt(prompt, categoryIds) });
  });

  // Restore-defaults is registered before /api/prompts/:promptId so the
  // static segment is not captured as a prompt id.
  app.post("/api/prompts/restore-defaults", (_req, res) => {
    const result = services.prompts.restoreDefaults();
    res.json({
      restored: result.restored,
      categories: result.categories.map(serializePromptCategory),
      prompts: result.prompts.map(({ prompt, categoryIds }) =>
        serializePrompt(prompt, categoryIds),
      ),
    });
  });

  app.get("/api/prompts/:promptId", (req, res) => {
    const { prompt, categoryIds } = services.prompts.getPrompt(
      req.params.promptId,
    );
    res.json({ prompt: serializePrompt(prompt, categoryIds) });
  });

  app.patch("/api/prompts/:promptId", (req, res) => {
    const body = parseNonEmptyBody(req, promptUpdateSchema);
    const { prompt, categoryIds } = services.prompts.updatePrompt(
      req.params.promptId,
      body,
    );
    res.json({ prompt: serializePrompt(prompt, categoryIds) });
  });

  app.delete("/api/prompts/:promptId", (req, res) => {
    const { prompt, categoryIds } = services.prompts.deletePrompt(
      req.params.promptId,
    );
    res.json({ prompt: serializePrompt(prompt, categoryIds) });
  });

  app.post("/api/prompts/:promptId/use", (req, res) => {
    const { prompt, categoryIds } = services.prompts.recordPromptUse(
      req.params.promptId,
    );
    res.json({ prompt: serializePrompt(prompt, categoryIds) });
  });
}
