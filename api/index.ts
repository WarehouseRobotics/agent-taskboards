import express from "express";
import { join, resolve } from "node:path";
import { getDatabaseClient } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const migrationResult = runMigrations();
const databaseClient = getDatabaseClient();

app.use(express.json());

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
        error: error instanceof Error ? error.message : "Unknown database error",
      },
    });
  }
});

if (process.env.NODE_ENV === "production") {
  const uiDistPath = resolve(process.cwd(), "dist/ui");

  app.use(express.static(uiDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(join(uiDistPath, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
