import { unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type BetterSqlite3 from "better-sqlite3";
import { createDatabaseClient, getDatabasePath } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { getUploadsPath } from "../services/attachment-service.js";

export const pruneArchivedTasksConfirmation = "prune-archived-tasks";

export interface PruneArchivedTasksOptions {
  execute?: boolean;
  confirm?: string;
  databasePath?: string;
  migrationsDir?: string;
  uploadsPath?: string;
}

export interface PruneCounts {
  tasks: number;
  comments: number;
  activity: number;
  attachments: number;
  searchDocuments: number;
}

export interface AttachmentFileFailure {
  relativePath: string;
  message: string;
}

export interface PruneArchivedTasksResult {
  mode: "dry-run" | "execute";
  databasePath: string;
  checkpointPolicy: "unchanged";
  matched: PruneCounts;
  deleted: PruneCounts;
  attachmentFiles: {
    matched: number;
    removed: number;
    missing: number;
    failed: number;
    failures: AttachmentFileFailure[];
  };
}

const zeroCounts = (): PruneCounts => ({
  tasks: 0,
  comments: 0,
  activity: 0,
  attachments: 0,
  searchDocuments: 0,
});

export async function pruneArchivedTasks({
  execute = false,
  confirm,
  databasePath = getDatabasePath(),
  migrationsDir,
  uploadsPath = getUploadsPath(),
}: PruneArchivedTasksOptions = {}): Promise<PruneArchivedTasksResult> {
  if (execute && confirm !== pruneArchivedTasksConfirmation) {
    throw new Error(
      `Refusing to prune archived tasks without --confirm=${pruneArchivedTasksConfirmation}`,
    );
  }

  runMigrations({ databasePath, migrationsDir });
  const client = createDatabaseClient(databasePath);

  try {
    const matched = countArchivedTaskGraph(client.sqlite);
    const attachmentPaths = selectArchivedTaskAttachmentPaths(client.sqlite);

    if (!execute) {
      return {
        mode: "dry-run",
        databasePath,
        checkpointPolicy: "unchanged",
        matched,
        deleted: zeroCounts(),
        attachmentFiles: {
          matched: attachmentPaths.length,
          removed: 0,
          missing: 0,
          failed: 0,
          failures: [],
        },
      };
    }

    const deletedTaskCount = client.sqlite.transaction(() => {
      return client.sqlite
        .prepare("DELETE FROM tasks WHERE archived_at IS NOT NULL")
        .run().changes;
    })();

    const attachmentFiles = await removeAttachmentFilesBestEffort(
      attachmentPaths,
      uploadsPath,
    );

    return {
      mode: "execute",
      databasePath,
      checkpointPolicy: "unchanged",
      matched,
      deleted: {
        ...matched,
        tasks: deletedTaskCount,
      },
      attachmentFiles,
    };
  } finally {
    client.close();
  }
}

function countArchivedTaskGraph(sqlite: BetterSqlite3.Database): PruneCounts {
  return {
    tasks: count(sqlite, "SELECT count(*) AS count FROM tasks WHERE archived_at IS NOT NULL"),
    comments: count(
      sqlite,
      "SELECT count(*) AS count FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE archived_at IS NOT NULL)",
    ),
    activity: count(
      sqlite,
      "SELECT count(*) AS count FROM task_activity WHERE task_id IN (SELECT id FROM tasks WHERE archived_at IS NOT NULL)",
    ),
    attachments: count(
      sqlite,
      "SELECT count(*) AS count FROM task_attachments WHERE task_id IN (SELECT id FROM tasks WHERE archived_at IS NOT NULL)",
    ),
    searchDocuments: count(
      sqlite,
      "SELECT count(*) AS count FROM search_documents WHERE task_id IN (SELECT id FROM tasks WHERE archived_at IS NOT NULL)",
    ),
  };
}

function count(sqlite: BetterSqlite3.Database, query: string) {
  const row = sqlite.prepare(query).get() as { count: number };
  return row.count;
}

function selectArchivedTaskAttachmentPaths(sqlite: BetterSqlite3.Database) {
  return sqlite
    .prepare(
      "SELECT relative_path AS relativePath FROM task_attachments WHERE task_id IN (SELECT id FROM tasks WHERE archived_at IS NOT NULL)",
    )
    .all()
    .map((row) => (row as { relativePath: string }).relativePath);
}

async function removeAttachmentFilesBestEffort(
  relativePaths: readonly string[],
  uploadsPath: string,
): Promise<PruneArchivedTasksResult["attachmentFiles"]> {
  const result: PruneArchivedTasksResult["attachmentFiles"] = {
    matched: relativePaths.length,
    removed: 0,
    missing: 0,
    failed: 0,
    failures: [],
  };

  for (const relativePath of relativePaths) {
    try {
      await unlink(absoluteAttachmentPath(uploadsPath, relativePath));
      result.removed += 1;
    } catch (error) {
      if (isNotFoundError(error)) {
        result.missing += 1;
        continue;
      }

      result.failed += 1;
      result.failures.push({
        relativePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

function absoluteAttachmentPath(uploadsPath: string, relativePath: string) {
  const root = resolve(uploadsPath);
  const absolutePath = resolve(root, relativePath);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
    throw new Error(`Attachment path is invalid: ${relativePath}`);
  }

  return absolutePath;
}

function isNotFoundError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function parseArgs(argv: readonly string[]): PruneArchivedTasksOptions {
  const options: PruneArchivedTasksOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--execute") {
      options.execute = true;
      continue;
    }

    if (arg === "--confirm") {
      options.confirm = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--confirm=")) {
      options.confirm = arg.slice("--confirm=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  pruneArchivedTasks(parseArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.attachmentFiles.failed > 0) {
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
