import express from "express";
import type { DatabaseClient } from "./db/client.js";
import type { MigrationResult } from "./db/migrate.js";
import { errorHandler } from "./http/errors.js";
import { registerRoutes } from "./routes/index.js";
import { getUploadsPath } from "./services/attachment-service.js";
import { createServices, type CreateServicesOptions } from "./services/index.js";

export interface CreateAppOptions extends CreateServicesOptions {
  databaseClient: DatabaseClient;
  migrationResult: MigrationResult;
}

export function createApp({
  databaseClient,
  migrationResult,
  embeddingModel,
  taskIdSuffixGenerator,
}: CreateAppOptions) {
  const app = express();
  const services = createServices(databaseClient, {
    embeddingModel,
    taskIdSuffixGenerator,
  });

  app.use(express.json());
  app.use("/uploads", express.static(getUploadsPath()));
  registerRoutes(app, { databaseClient, migrationResult, services });
  app.use(errorHandler);

  return app;
}
