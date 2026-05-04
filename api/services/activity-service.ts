import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  type SQL,
} from "drizzle-orm";
import type { DatabaseClient } from "../db/client.js";
import {
  boards,
  projects,
  type Board,
  type Project,
  type Task,
  type TaskActivity,
  taskActivity,
  type TaskComment,
  taskComments,
  tasks,
} from "../db/schema.js";
import type { ActivityQuery } from "../models/request-schemas.js";
import type { ProjectService } from "./project-service.js";

export type ProjectActivityFeedItem =
  | {
      type: "activity";
      id: string;
      createdAt: Date;
      project: Project;
      board: Board;
      task: Task;
      activity: TaskActivity;
    }
  | {
      type: "comment";
      id: string;
      createdAt: Date;
      project: Project;
      board: Board;
      task: Task;
      comment: TaskComment;
    };

export interface ProjectActivityFeed {
  items: ProjectActivityFeedItem[];
  hasMore: boolean;
  limit: number;
  offset: number;
  sort: "asc" | "desc";
}

export class ActivityService {
  private readonly db: DatabaseClient["db"];

  constructor(
    databaseClient: DatabaseClient,
    private readonly projectService: ProjectService,
  ) {
    this.db = databaseClient.db;
  }

  listProjectActivity(input: ActivityQuery): ProjectActivityFeed {
    const projectIds = [...new Set(input.projectId)];
    for (const projectId of projectIds) {
      this.projectService.getProject(projectId, input.includeArchived);
    }

    const rowLimit = input.offset + input.limit + 1;
    const activityRows = this.listActivityRows(input, projectIds, rowLimit);
    const commentRows = this.listCommentRows(input, projectIds, rowLimit);
    const merged = [...activityRows, ...commentRows].sort((a, b) =>
      compareFeedItems(a, b, input.sort),
    );
    const paged = merged.slice(input.offset, input.offset + input.limit);

    return {
      items: paged,
      hasMore: merged.length > input.offset + input.limit,
      limit: input.limit,
      offset: input.offset,
      sort: input.sort,
    };
  }

  private listActivityRows(
    input: ActivityQuery,
    projectIds: string[],
    limit: number,
  ): ProjectActivityFeedItem[] {
    const conditions = baseConditions(input, projectIds);
    conditions.push(ne(taskActivity.eventType, "comment.created"));

    return this.db
      .select({
        activity: taskActivity,
        project: projects,
        board: boards,
        task: tasks,
      })
      .from(taskActivity)
      .innerJoin(projects, eq(projects.id, taskActivity.projectId))
      .innerJoin(boards, eq(boards.id, taskActivity.boardId))
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .where(and(...conditions))
      .orderBy(
        input.sort === "asc"
          ? asc(taskActivity.createdAt)
          : desc(taskActivity.createdAt),
        input.sort === "asc" ? asc(taskActivity.id) : desc(taskActivity.id),
      )
      .limit(limit)
      .all()
      .map((row) => ({
        type: "activity" as const,
        id: row.activity.id,
        createdAt: row.activity.createdAt,
        project: row.project,
        board: row.board,
        task: row.task,
        activity: row.activity,
      }));
  }

  private listCommentRows(
    input: ActivityQuery,
    projectIds: string[],
    limit: number,
  ): ProjectActivityFeedItem[] {
    const conditions = baseConditions(input, projectIds);

    return this.db
      .select({
        comment: taskComments,
        project: projects,
        board: boards,
        task: tasks,
      })
      .from(taskComments)
      .innerJoin(projects, eq(projects.id, taskComments.projectId))
      .innerJoin(boards, eq(boards.id, taskComments.boardId))
      .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
      .where(and(...conditions))
      .orderBy(
        input.sort === "asc"
          ? asc(taskComments.createdAt)
          : desc(taskComments.createdAt),
        input.sort === "asc" ? asc(taskComments.id) : desc(taskComments.id),
      )
      .limit(limit)
      .all()
      .map((row) => ({
        type: "comment" as const,
        id: row.comment.id,
        createdAt: row.comment.createdAt,
        project: row.project,
        board: row.board,
        task: row.task,
        comment: row.comment,
      }));
  }
}

function baseConditions(input: ActivityQuery, projectIds: string[]) {
  const conditions: SQL[] = [];

  if (projectIds.length > 0) {
    conditions.push(inArray(projects.id, projectIds));
  }

  if (!input.includeArchived) {
    conditions.push(isNull(projects.archivedAt));
    conditions.push(isNull(boards.archivedAt));
    conditions.push(isNull(tasks.archivedAt));
  }

  return conditions;
}

function compareFeedItems(
  a: ProjectActivityFeedItem,
  b: ProjectActivityFeedItem,
  sort: "asc" | "desc",
) {
  const timeA = a.createdAt.getTime();
  const timeB = b.createdAt.getTime();
  const timeDiff = timeA - timeB;
  if (timeDiff !== 0) {
    return sort === "asc" ? timeDiff : -timeDiff;
  }

  const idDiff = a.id.localeCompare(b.id);
  return sort === "asc" ? idDiff : -idDiff;
}
