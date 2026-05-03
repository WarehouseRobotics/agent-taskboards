import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { DatabaseClient } from "../db/client.js";
import { boardColumns, boards } from "../db/schema.js";
import { ApiError } from "../http/errors.js";
import { defaultBoardColumns } from "../models/default-columns.js";
import type {
  BoardCreateInput,
  BoardUpdateInput,
} from "../models/request-schemas.js";
import { runBestEffortIndex } from "./best-effort-index.js";
import type { ProjectService } from "./project-service.js";
import type { SearchService } from "./search-service.js";

export class BoardService {
  private readonly db: DatabaseClient["db"];

  constructor(
    databaseClient: DatabaseClient,
    private readonly projectService: ProjectService,
    private readonly searchService: SearchService,
  ) {
    this.db = databaseClient.db;
  }

  listBoards(projectId: string, includeArchived: boolean) {
    this.projectService.getProject(projectId, includeArchived);
    return includeArchived
      ? this.db
          .select()
          .from(boards)
          .where(eq(boards.projectId, projectId))
          .orderBy(asc(boards.name))
          .all()
      : this.db
          .select()
          .from(boards)
          .where(
            and(eq(boards.projectId, projectId), isNull(boards.archivedAt)),
          )
          .orderBy(asc(boards.name))
          .all();
  }

  async createBoard(projectId: string, input: BoardCreateInput) {
    const project = this.projectService.getProject(projectId, false);
    const inputColumns = input.columns ?? defaultBoardColumns;
    this.ensureBoardNameAvailable(project.id, input.name);

    const created = this.db.transaction((tx) => {
      const board = tx
        .insert(boards)
        .values({
          projectId: project.id,
          name: input.name,
          description: input.description,
          metadata: input.metadata,
        })
        .returning()
        .get();

      const columns = inputColumns.map((column, position) =>
        tx
          .insert(boardColumns)
          .values({
            boardId: board.id,
            key: column.key,
            name: column.name,
            position,
            isDone: column.isDone ?? false,
          })
          .returning()
          .get(),
      );

      return { board, columns };
    });

    await runBestEffortIndex(
      { sourceType: "board", sourceId: created.board.id },
      () => this.searchService.indexBoard(created.board),
    );
    return created;
  }

  getBoardByRef(projectId: string, boardRef: string, includeArchived: boolean) {
    const byId = includeArchived
      ? this.db
          .select()
          .from(boards)
          .where(and(eq(boards.id, boardRef), eq(boards.projectId, projectId)))
          .get()
      : this.db
          .select()
          .from(boards)
          .where(
            and(
              eq(boards.id, boardRef),
              eq(boards.projectId, projectId),
              isNull(boards.archivedAt),
            ),
          )
          .get();

    if (byId) {
      return byId;
    }

    const byName = includeArchived
      ? this.db
          .select()
          .from(boards)
          .where(and(eq(boards.name, boardRef), eq(boards.projectId, projectId)))
          .get()
      : this.db
          .select()
          .from(boards)
          .where(
            and(
              eq(boards.name, boardRef),
              eq(boards.projectId, projectId),
              isNull(boards.archivedAt),
            ),
          )
          .get();

    if (!byName) {
      throw new ApiError(404, "not_found", "Board not found");
    }

    return byName;
  }

  getBoardByRefAcrossProjects(boardRef: string, includeArchived: boolean) {
    const byId = includeArchived
      ? this.db.select().from(boards).where(eq(boards.id, boardRef)).all()
      : this.db
          .select()
          .from(boards)
          .where(and(eq(boards.id, boardRef), isNull(boards.archivedAt)))
          .all();

    if (byId.length === 1) {
      return byId[0];
    }

    const byName = includeArchived
      ? this.db.select().from(boards).where(eq(boards.name, boardRef)).all()
      : this.db
          .select()
          .from(boards)
          .where(and(eq(boards.name, boardRef), isNull(boards.archivedAt)))
          .all();

    if (byName.length === 1) {
      return byName[0];
    }
    if (byName.length > 1) {
      throw new ApiError(
        400,
        "invalid_request",
        "Board name is ambiguous; provide projectId",
      );
    }

    throw new ApiError(404, "not_found", "Board not found");
  }

  getBoard(projectId: string, boardId: string, includeArchived: boolean) {
    const board = includeArchived
      ? this.db
          .select()
          .from(boards)
          .where(and(eq(boards.id, boardId), eq(boards.projectId, projectId)))
          .get()
      : this.db
          .select()
          .from(boards)
          .where(
            and(
              eq(boards.id, boardId),
              eq(boards.projectId, projectId),
              isNull(boards.archivedAt),
            ),
          )
          .get();

    if (!board) {
      throw new ApiError(404, "not_found", "Board not found");
    }

    return board;
  }

  async updateBoard(
    projectId: string,
    boardId: string,
    input: BoardUpdateInput,
  ) {
    this.projectService.getProject(projectId, false);
    this.getBoard(projectId, boardId, false);
    if (input.name) {
      this.ensureBoardNameAvailable(projectId, input.name, boardId);
    }
    const board = this.db
      .update(boards)
      .set(input)
      .where(eq(boards.id, boardId))
      .returning()
      .get();

    await runBestEffortIndex({ sourceType: "board", sourceId: board.id }, () =>
      this.searchService.indexBoard(board),
    );
    return board;
  }

  archiveBoard(projectId: string, boardId: string) {
    this.projectService.getProject(projectId, false);
    this.getBoard(projectId, boardId, false);
    return this.db
      .update(boards)
      .set({ archivedAt: new Date() })
      .where(eq(boards.id, boardId))
      .returning()
      .get();
  }

  listBoardColumns(boardId: string) {
    return this.db
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.boardId, boardId))
      .orderBy(asc(boardColumns.position))
      .all();
  }

  private ensureBoardNameAvailable(
    projectId: string,
    name: string,
    exceptBoardId?: string,
  ) {
    const existing = exceptBoardId
      ? this.db
          .select({ id: boards.id })
          .from(boards)
          .where(
            and(
              eq(boards.projectId, projectId),
              eq(boards.name, name),
              ne(boards.id, exceptBoardId),
            ),
          )
          .get()
      : this.db
          .select({ id: boards.id })
          .from(boards)
          .where(and(eq(boards.projectId, projectId), eq(boards.name, name)))
          .get();

    if (existing) {
      throw new ApiError(409, "invalid_state", "Board name already exists");
    }
  }
}
