import type { Express } from "express";
import type { DatabaseClient } from "../db/client.js";
import type { MigrationResult } from "../db/migrate.js";

export function registerHealthRoutes(
  app: Express,
  databaseClient: DatabaseClient,
  migrationResult: MigrationResult,
) {
  app.get("/api/health", (_req, res) => {
    try {
      databaseClient.sqlite.prepare("SELECT 1").get();
      res.json({
        ok: true,
        database: {
          ok: true,
          path: databaseClient.databasePath,
          migrations: migrationResult,
        },
      });
    } catch (error) {
      res.status(503).json({
        ok: false,
        database: {
          ok: false,
          error:
            error instanceof Error ? error.message : "Unknown database error",
        },
      });
    }
  });
}
