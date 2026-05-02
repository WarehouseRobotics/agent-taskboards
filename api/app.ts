import express from "express";
import type { DatabaseClient } from "./db/client.js";
import type { MigrationResult } from "./db/migrate.js";
import { errorHandler } from "./http/errors.js";
import { registerRoutes } from "./routes/index.js";
import { createServices } from "./services/index.js";

export interface CreateAppOptions {
  databaseClient: DatabaseClient;
  migrationResult: MigrationResult;
}

export function createApp({
  databaseClient,
  migrationResult,
}: CreateAppOptions) {
  const app = express();
  const services = createServices(databaseClient);

  app.use(express.json());
  registerRoutes(app, { databaseClient, migrationResult, services });
  app.use(errorHandler);

  return app;
}
