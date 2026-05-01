import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDatabaseClient, getDatabasePath } from "./client.js";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export interface RunMigrationsOptions {
  databasePath?: string;
  migrationsDir?: string;
}

interface AppliedMigration {
  id: string;
  checksum: string;
}

export function runMigrations({
  databasePath = getDatabasePath(),
  migrationsDir = resolve(process.cwd(), "drizzle"),
}: RunMigrationsOptions = {}): MigrationResult {
  const client = createDatabaseClient(databasePath);
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    client.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY NOT NULL,
        checksum TEXT NOT NULL,
        applied_at INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER))
      );
    `);

    if (!existsSync(migrationsDir)) {
      return { applied, skipped };
    }

    const appliedMigrations = new Map(
      client.sqlite
        .prepare("SELECT id, checksum FROM schema_migrations")
        .all()
        .map((migration) => {
          const appliedMigration = migration as AppliedMigration;
          return [appliedMigration.id, appliedMigration.checksum] as const;
        }),
    );

    const migrationFiles = readdirSync(migrationsDir)
      .filter((fileName) => fileName.endsWith(".sql"))
      .sort();

    for (const fileName of migrationFiles) {
      const migrationPath = resolve(migrationsDir, fileName);
      const sql = readFileSync(migrationPath, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existingChecksum = appliedMigrations.get(fileName);

      if (existingChecksum) {
        if (existingChecksum !== checksum) {
          throw new Error(
            `Applied migration ${fileName} has checksum ${existingChecksum}, expected ${checksum}`,
          );
        }

        skipped.push(fileName);
        continue;
      }

      const applyMigration = client.sqlite.transaction(() => {
        client.sqlite.exec(sql);
        client.sqlite
          .prepare(
            "INSERT INTO schema_migrations (id, checksum) VALUES (?, ?)",
          )
          .run(fileName, checksum);
      });

      applyMigration();
      applied.push(fileName);
    }

    return { applied, skipped };
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runMigrations();
  console.log(
    JSON.stringify(
      {
        databasePath: getDatabasePath(),
        ...result,
      },
      null,
      2,
    ),
  );
}
