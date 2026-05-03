import { and, asc, eq, isNull, ne } from "drizzle-orm";
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
    this.ensureProjectNameAvailable(input.name);
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

  getProjectByRef(projectRef: string, includeArchived: boolean) {
    const byId = includeArchived
      ? this.db.select().from(projects).where(eq(projects.id, projectRef)).get()
      : this.db
          .select()
          .from(projects)
          .where(and(eq(projects.id, projectRef), isNull(projects.archivedAt)))
          .get();

    if (byId) {
      return byId;
    }

    const byName = includeArchived
      ? this.db.select().from(projects).where(eq(projects.name, projectRef)).get()
      : this.db
          .select()
          .from(projects)
          .where(and(eq(projects.name, projectRef), isNull(projects.archivedAt)))
          .get();

    if (!byName) {
      throw new ApiError(404, "not_found", "Project not found");
    }

    return byName;
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
    if (input.name) {
      this.ensureProjectNameAvailable(input.name, projectId);
    }
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

  private ensureProjectNameAvailable(name: string, exceptProjectId?: string) {
    const existing = exceptProjectId
      ? this.db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.name, name), ne(projects.id, exceptProjectId)))
          .get()
      : this.db
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.name, name))
          .get();

    if (existing) {
      throw new ApiError(409, "invalid_state", "Project name already exists");
    }
  }
}
