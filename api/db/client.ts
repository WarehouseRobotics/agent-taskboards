import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";

export const DEFAULT_DATABASE_PATH = "/data/taskboards.sqlite";

export interface DatabaseClient {
  databasePath: string;
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
  close: () => void;
}

let databaseClient: DatabaseClient | undefined;

export function getDatabasePath() {
  return process.env.TASKBOARDS_DB_PATH ?? DEFAULT_DATABASE_PATH;
}

export function createDatabaseClient(
  databasePath = getDatabasePath(),
): DatabaseClient {
  ensureDatabaseDirectory(databasePath);

  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");

  return {
    databasePath,
    sqlite,
    db: drizzle(sqlite, { schema }),
    close: () => sqlite.close(),
  };
}

export function getDatabaseClient() {
  databaseClient ??= createDatabaseClient();
  return databaseClient;
}

export function closeDatabaseClient() {
  databaseClient?.close();
  databaseClient = undefined;
}

function ensureDatabaseDirectory(databasePath: string) {
  if (databasePath === ":memory:" || databasePath.startsWith("file:")) {
    return;
  }

  mkdirSync(dirname(databasePath), { recursive: true });
}
