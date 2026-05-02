import { and, asc, eq, isNull } from "drizzle-orm";
import type { DatabaseClient } from "../db/client.js";
import { projects } from "../db/schema.js";
import { ApiError } from "../http/errors.js";
import type {
  ProjectCreateInput,
  ProjectUpdateInput,
} from "../models/request-schemas.js";

export class ProjectService {
  private readonly db: DatabaseClient["db"];

  constructor(databaseClient: DatabaseClient) {
    this.db = databaseClient.db;
  }

  listProjects(includeArchived: boolean) {
    return includeArchived
      ? this.db.select().from(projects).orderBy(asc(projects.name)).all()
      : this.db
          .select()
          .from(projects)
          .where(isNull(projects.archivedAt))
          .orderBy(asc(projects.name))
          .all();
  }

  createProject(input: ProjectCreateInput) {
    return this.db
      .insert(projects)
      .values({
        name: input.name,
        description: input.description,
        repositoryPath: input.repositoryPath,
        defaultBranch: input.defaultBranch,
        metadata: input.metadata,
      })
      .returning()
      .get();
  }

  getProject(projectId: string, includeArchived: boolean) {
    const project = includeArchived
      ? this.db.select().from(projects).where(eq(projects.id, projectId)).get()
      : this.db
          .select()
          .from(projects)
          .where(and(eq(projects.id, projectId), isNull(projects.archivedAt)))
          .get();

    if (!project) {
      throw new ApiError(404, "not_found", "Project not found");
    }

    return project;
  }

  updateProject(projectId: string, input: ProjectUpdateInput) {
    this.getProject(projectId, false);
    return this.db
      .update(projects)
      .set(input)
      .where(eq(projects.id, projectId))
      .returning()
      .get();
  }

  archiveProject(projectId: string) {
    this.getProject(projectId, false);
    return this.db
      .update(projects)
      .set({ archivedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning()
      .get();
  }
}
