import type { Express } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { parseBody } from "../http/validation.js";
import { searchSchema } from "../models/request-schemas.js";
import type { ApiServices } from "../services/index.js";

export function registerSearchRoutes(app: Express, services: ApiServices) {
  app.post(
    "/api/search",
    asyncHandler(async (req, res) => {
      const body = parseBody(req, searchSchema);
      const results = await services.search.search(body);

      res.json({
        query: body.query,
        results,
      });
    }),
  );
}
