import type Database from "better-sqlite3";
import type { DatabaseClient } from "../db/client.js";

export interface StorageSizeBucket {
  dataBytes: number;
  embeddingBytes: number;
  totalBytes: number;
}

export interface StorageUsageSplit {
  active: StorageSizeBucket;
  archived: StorageSizeBucket;
  totalBytes: number;
}

export interface BoardStorageUsage extends StorageUsageSplit {
  id: string;
  name: string;
  archivedAt: string | null;
}

export interface ProjectStorageUsage extends StorageUsageSplit {
  id: string;
  name: string;
  archivedAt: string | null;
  boards: BoardStorageUsage[];
}

export interface MaintenanceStorageReport {
  calculatedAt: string;
  database: {
    path: string;
    pageSizeBytes: number;
    pageCount: number;
    databaseBytes: number;
    freeBytes: number;
    attributedBytes: number;
    unattributedBytes: number;
  };
  active: StorageSizeBucket;
  archived: StorageSizeBucket;
  projects: ProjectStorageUsage[];
}

type ScopeRow = {
  project_id: string;
  board_id: string | null;
  archived: number;
  bytes: number;
};

type ProjectRow = {
  id: string;
  name: string;
  archived_at: number | null;
};

type BoardRow = ProjectRow & {
  project_id: string;
};

type MutableUsage = {
  active: StorageSizeBucket;
  archived: StorageSizeBucket;
};

type ScopedUsage = MutableUsage & {
  id: string;
  name: string;
  archivedAt: string | null;
};

// The vec0 table is declared as `embedding FLOAT[384]` in migration 0001.
// Each FLOAT occupies four bytes, and `chunks.size` is the allocated slot count.
const embeddingDimensions = 384;
const floatBytes = 4;

const canonicalTables = [
  {
    table: "projects p",
    projectId: "p.id",
    boardId: "NULL",
    joins: "",
    archived: "p.archived_at IS NOT NULL",
    columns: [
      "p.id",
      "p.name",
      "p.description",
      "p.repository_path",
      "p.default_branch",
      "p.metadata",
      "p.archived_at",
      "p.created_at",
      "p.updated_at",
    ],
  },
  {
    table: "boards b",
    projectId: "b.project_id",
    boardId: "b.id",
    joins: "JOIN projects p ON p.id = b.project_id",
    archived: "p.archived_at IS NOT NULL OR b.archived_at IS NOT NULL",
    columns: [
      "b.id",
      "b.project_id",
      "b.name",
      "b.description",
      "b.metadata",
      "b.archived_at",
      "b.created_at",
      "b.updated_at",
    ],
  },
  {
    table: "board_columns c",
    projectId: "b.project_id",
    boardId: "c.board_id",
    joins:
      "JOIN boards b ON b.id = c.board_id JOIN projects p ON p.id = b.project_id",
    archived: "p.archived_at IS NOT NULL OR b.archived_at IS NOT NULL",
    columns: [
      "c.id",
      "c.board_id",
      "c.key",
      "c.name",
      "c.position",
      "c.is_done",
      "c.created_at",
      "c.updated_at",
    ],
  },
  {
    table: "board_checkpoints c",
    projectId: "c.project_id",
    boardId: "c.board_id",
    joins:
      "JOIN boards b ON b.id = c.board_id JOIN projects p ON p.id = c.project_id",
    archived: "p.archived_at IS NOT NULL OR b.archived_at IS NOT NULL",
    columns: [
      "c.id",
      "c.project_id",
      "c.board_id",
      "c.name",
      "c.description",
      "c.snapshot_version",
      "c.snapshot",
      "c.summary",
      "c.creator_type",
      "c.creator_name",
      "c.creator_ref",
      "c.metadata",
      "c.created_at",
    ],
  },
  {
    table: "tasks t",
    projectId: "t.project_id",
    boardId: "t.board_id",
    joins:
      "JOIN boards b ON b.id = t.board_id JOIN projects p ON p.id = t.project_id",
    archived:
      "p.archived_at IS NOT NULL OR b.archived_at IS NOT NULL OR t.archived_at IS NOT NULL",
    columns: [
      "t.id",
      "t.project_id",
      "t.board_id",
      "t.column_id",
      "t.title",
      "t.description",
      "t.position",
      "t.priority",
      "t.labels",
      "t.external_references",
      "t.metadata",
      "t.completed_at",
      "t.archived_at",
      "t.created_at",
      "t.updated_at",
    ],
  },
  {
    table: "task_comments c",
    projectId: "c.project_id",
    boardId: "c.board_id",
    joins:
      "JOIN tasks t ON t.id = c.task_id JOIN boards b ON b.id = c.board_id JOIN projects p ON p.id = c.project_id",
    archived:
      "p.archived_at IS NOT NULL OR b.archived_at IS NOT NULL OR t.archived_at IS NOT NULL",
    columns: [
      "c.id",
      "c.project_id",
      "c.board_id",
      "c.task_id",
      "c.author_type",
      "c.author_name",
      "c.author_ref",
      "c.body",
      "c.metadata",
      "c.created_at",
    ],
  },
  {
    table: "task_activity a",
    projectId: "a.project_id",
    boardId: "a.board_id",
    joins:
      "JOIN tasks t ON t.id = a.task_id JOIN boards b ON b.id = a.board_id JOIN projects p ON p.id = a.project_id",
    archived:
      "p.archived_at IS NOT NULL OR b.archived_at IS NOT NULL OR t.archived_at IS NOT NULL",
    columns: [
      "a.id",
      "a.project_id",
      "a.board_id",
      "a.task_id",
      "a.actor_type",
      "a.actor_name",
      "a.actor_ref",
      "a.event_type",
      "a.summary",
      "a.data",
      "a.created_at",
    ],
  },
  {
    table: "task_attachments a",
    projectId: "a.project_id",
    boardId: "a.board_id",
    joins:
      "JOIN tasks t ON t.id = a.task_id JOIN boards b ON b.id = a.board_id JOIN projects p ON p.id = a.project_id",
    archived:
      "p.archived_at IS NOT NULL OR b.archived_at IS NOT NULL OR t.archived_at IS NOT NULL",
    columns: [
      "a.id",
      "a.project_id",
      "a.board_id",
      "a.task_id",
      "a.relative_path",
      "a.original_name",
      "a.content_type",
      "a.size_bytes",
      "a.created_at",
    ],
  },
] as const;

const searchDocumentTable = {
  table: "search_documents d",
  projectId: "d.project_id",
  boardId: "d.board_id",
  joins:
    "JOIN projects p ON p.id = d.project_id LEFT JOIN boards b ON b.id = d.board_id LEFT JOIN tasks t ON t.id = d.task_id",
  archived:
    "p.archived_at IS NOT NULL OR b.archived_at IS NOT NULL OR t.archived_at IS NOT NULL",
  columns: [
    "d.id",
    "d.source_type",
    "d.source_id",
    "d.project_id",
    "d.board_id",
    "d.task_id",
    "d.chunk_key",
    "d.title",
    "d.body",
    "d.body_hash",
    "d.embedding_model",
    "d.embedding_dimensions",
    "d.embedding_status",
    "d.embedded_at",
    "d.embedding_error",
    "d.metadata",
    "d.created_at",
    "d.updated_at",
  ],
} as const;

export class MaintenanceService {
  private readonly sqlite: Database.Database;

  constructor(private readonly databaseClient: DatabaseClient) {
    this.sqlite = databaseClient.sqlite;
  }

  getStorageReport(): MaintenanceStorageReport {
    return this.sqlite.transaction(() => {
      const projects = this.readProjects();
      const boards = this.readBoards();
      const globalUsage = emptyUsage();
      const projectUsage = new Map<string, ScopedUsage>();
      const boardUsage = new Map<string, ScopedUsage>();

      for (const project of projects) {
        projectUsage.set(project.id, {
          id: project.id,
          name: project.name,
          archivedAt: serializeTimestamp(project.archived_at),
          ...emptyUsage(),
        });
      }

      for (const board of boards) {
        boardUsage.set(board.id, {
          id: board.id,
          name: board.name,
          archivedAt: serializeTimestamp(board.archived_at),
          ...emptyUsage(),
        });
      }

      for (const table of canonicalTables) {
        this.applyContributions(
          this.readTableUsage(table),
          "dataBytes",
          globalUsage,
          projectUsage,
          boardUsage,
        );
      }

      this.applyContributions(
        this.readTableUsage(searchDocumentTable),
        "embeddingBytes",
        globalUsage,
        projectUsage,
        boardUsage,
      );
      this.applyContributions(
        this.readVectorChunkUsage(),
        "embeddingBytes",
        globalUsage,
        projectUsage,
        boardUsage,
      );

      const pageSizeBytes = this.readPragmaNumber("page_size");
      const pageCount = this.readPragmaNumber("page_count");
      const freePageCount = this.readPragmaNumber("freelist_count");
      const databaseBytes = pageSizeBytes * pageCount;
      const freeBytes = pageSizeBytes * freePageCount;
      const attributedBytes = bucketTotal(globalUsage.active) + bucketTotal(globalUsage.archived);

      const boardProjectIds = new Map(boards.map((board) => [board.id, board.project_id]));
      const reportProjects = projects.map((project) => {
        const usage = projectUsage.get(project.id) ?? emptyScopedUsage(project);
        return {
          ...finalizeUsage(usage),
          boards: boards
            .filter((board) => boardProjectIds.get(board.id) === project.id)
            .map((board) =>
              finalizeUsage(boardUsage.get(board.id) ?? emptyScopedUsage(board)),
            ),
        };
      });

      return {
        calculatedAt: new Date().toISOString(),
        database: {
          path: this.databaseClient.databasePath,
          pageSizeBytes,
          pageCount,
          databaseBytes,
          freeBytes,
          attributedBytes,
          unattributedBytes: Math.max(0, databaseBytes - attributedBytes),
        },
        active: finalizeBucket(globalUsage.active),
        archived: finalizeBucket(globalUsage.archived),
        projects: reportProjects,
      };
    })();
  }

  private readProjects() {
    return this.sqlite
      .prepare(
        "SELECT id, name, archived_at FROM projects ORDER BY name COLLATE NOCASE, id",
      )
      .all() as ProjectRow[];
  }

  private readBoards() {
    return this.sqlite
      .prepare(
        "SELECT id, project_id, name, archived_at FROM boards ORDER BY name COLLATE NOCASE, id",
      )
      .all() as BoardRow[];
  }

  private readTableUsage(table: {
    table: string;
    projectId: string;
    boardId: string;
    joins: string;
    archived: string;
    columns: readonly string[];
  }) {
    const bytes = table.columns.map(sqliteValueBytes).join(" + ");
    return this.sqlite
      .prepare(
        `
          SELECT
            ${table.projectId} AS project_id,
            ${table.boardId} AS board_id,
            CASE WHEN ${table.archived} THEN 1 ELSE 0 END AS archived,
            SUM(${bytes}) AS bytes
          FROM ${table.table}
          ${table.joins}
          GROUP BY 1, 2, 3
        `,
      )
      .all() as ScopeRow[];
  }

  private readVectorChunkUsage() {
    return this.sqlite
      .prepare(
        `
          SELECT
            c.partition00 AS project_id,
            c.partition01 AS board_id,
            CASE WHEN
              p.archived_at IS NOT NULL OR
              b.archived_at IS NOT NULL OR
              t.archived_at IS NOT NULL
            THEN 1 ELSE 0 END AS archived,
            SUM(
              (c.size * ${embeddingDimensions} * ${floatBytes}) +
              COALESCE(length(c.validity), 0) +
              COALESCE(length(c.rowids), 0)
            ) AS bytes
          FROM search_document_vectors_chunks c
          JOIN projects p ON p.id = c.partition00
          LEFT JOIN boards b ON b.id = c.partition01
          LEFT JOIN tasks t ON t.id = c.partition02
          GROUP BY 1, 2, 3
        `,
      )
      .all() as ScopeRow[];
  }

  private readPragmaNumber(name: "page_size" | "page_count" | "freelist_count") {
    return this.sqlite.pragma(name, { simple: true }) as number;
  }

  private applyContributions(
    rows: ScopeRow[],
    field: "dataBytes" | "embeddingBytes",
    globalUsage: MutableUsage,
    projectUsage: Map<string, ScopedUsage>,
    boardUsage: Map<string, ScopedUsage>,
  ) {
    for (const row of rows) {
      const state = row.archived ? "archived" : "active";
      const bytes = Number(row.bytes ?? 0);
      const project = projectUsage.get(row.project_id);
      if (!project) {
        continue;
      }
      globalUsage[state][field] += bytes;
      project[state][field] += bytes;
      if (row.board_id) {
        const board = boardUsage.get(row.board_id);
        if (board) {
          board[state][field] += bytes;
        }
      }
    }
  }
}

function sqliteValueBytes(column: string) {
  return `CASE typeof(${column})
    WHEN 'null' THEN 0
    WHEN 'integer' THEN CASE
      WHEN ${column} IN (0, 1) THEN 0
      WHEN ${column} BETWEEN -128 AND 127 THEN 1
      WHEN ${column} BETWEEN -32768 AND 32767 THEN 2
      WHEN ${column} BETWEEN -8388608 AND 8388607 THEN 3
      WHEN ${column} BETWEEN -2147483648 AND 2147483647 THEN 4
      WHEN ${column} BETWEEN -140737488355328 AND 140737488355327 THEN 6
      ELSE 8
    END
    WHEN 'real' THEN 8
    ELSE length(CAST(${column} AS BLOB))
  END`;
}

function emptyBucket(): StorageSizeBucket {
  return { dataBytes: 0, embeddingBytes: 0, totalBytes: 0 };
}

function emptyUsage(): MutableUsage {
  return { active: emptyBucket(), archived: emptyBucket() };
}

function emptyScopedUsage(row: ProjectRow): ScopedUsage {
  return {
    id: row.id,
    name: row.name,
    archivedAt: serializeTimestamp(row.archived_at),
    ...emptyUsage(),
  };
}

function bucketTotal(bucket: StorageSizeBucket) {
  return bucket.dataBytes + bucket.embeddingBytes;
}

function finalizeBucket(bucket: StorageSizeBucket): StorageSizeBucket {
  return { ...bucket, totalBytes: bucketTotal(bucket) };
}

function finalizeUsage<T extends ScopedUsage>(usage: T): T & StorageUsageSplit {
  const active = finalizeBucket(usage.active);
  const archived = finalizeBucket(usage.archived);
  return {
    ...usage,
    active,
    archived,
    totalBytes: active.totalBytes + archived.totalBytes,
  };
}

function serializeTimestamp(value: number | null) {
  return value === null ? null : new Date(value).toISOString();
}
