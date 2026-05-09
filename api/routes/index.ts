import type { Express } from "express";
import type { DatabaseClient } from "../db/client.js";
import type { MigrationResult } from "../db/migrate.js";
import type { ApiServices } from "../services/index.js";
import { registerActivityRoutes } from "./activity-routes.js";
import { registerAgentRoutes } from "./agent-routes.js";
import { registerBoardRoutes } from "./board-routes.js";
import { registerCheckpointRoutes } from "./checkpoint-routes.js";
import { registerHealthRoutes } from "./health-routes.js";
import { registerProjectRoutes } from "./project-routes.js";
import { registerSearchRoutes } from "./search-routes.js";
import { registerTaskRoutes } from "./task-routes.js";

export interface RegisterRoutesOptions {
  databaseClient: DatabaseClient;
  migrationResult: MigrationResult;
  services: ApiServices;
}

export function registerRoutes(app: Express, options: RegisterRoutesOptions) {
  registerHealthRoutes(app, options.databaseClient, options.migrationResult);
  registerProjectRoutes(app, options.services);
  registerBoardRoutes(app, options.services);
  registerCheckpointRoutes(app, options.services);
  registerTaskRoutes(app, options.services);
  registerActivityRoutes(app, options.services);
  registerSearchRoutes(app, options.services);
  registerAgentRoutes(app, options);
}
