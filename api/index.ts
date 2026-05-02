import express from "express";
import { join, resolve } from "node:path";
import { createApp } from "./app.js";
import { closeDatabaseClient, getDatabaseClient } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";

const port = Number(process.env.PORT ?? 3000);
const migrationResult = runMigrations();
const databaseClient = getDatabaseClient();
const app = createApp({
  databaseClient,
  migrationResult,
});

if (process.env.NODE_ENV === "production") {
  const uiDistPath = resolve(process.cwd(), "dist/ui");

  app.use(express.static(uiDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(join(uiDistPath, "index.html"));
  });
}

const server = app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}; shutting down`);

  server.close((error) => {
    try {
      closeDatabaseClient();
    } finally {
      if (error) {
        console.error("Error while closing API server", error);
        process.exitCode = 1;
      }

      process.exit();
    }
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
