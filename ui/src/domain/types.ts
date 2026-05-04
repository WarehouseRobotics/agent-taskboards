export type Theme = "dark" | "light";

export type View = "activity" | "board" | "projects" | "search" | "maintenance" | "settings";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type ActorType = "human" | "agent" | "system";

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  repositoryPath: string | null;
  defaultBranch: string | null;
  metadata: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BoardColumn {
  id: string;
  boardId: string;
  key: string;
  name: string;
  position: number;
  isDone: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Board {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  columns?: BoardColumn[];
  tasks?: Task[];
}

export interface Task {
  id: string;
  projectId: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  position: number;
  priority: TaskPriority;
  labels: string[];
  externalReferences: unknown[];
  metadata: Record<string, unknown>;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TaskComment {
  id: string;
  projectId: string;
  boardId: string;
  taskId: string;
  authorType: ActorType;
  authorName: string | null;
  authorRef: string | null;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string | null;
}

export interface TaskActivity {
  id: string;
  projectId: string;
  boardId: string;
  taskId: string;
  actorType: ActorType;
  actorName: string | null;
  actorRef: string | null;
  eventType: string;
  summary: string;
  data: Record<string, unknown>;
  createdAt: string | null;
}

export interface TaskAttachment {
  id: string;
  projectId: string;
  boardId: string;
  taskId: string;
  relativePath: string;
  url: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string | null;
}

export interface Health {
  ok: boolean;
  database?: {
    ok: boolean;
    path?: string;
    error?: string;
    migrations?: {
      applied: string[];
      skipped: string[];
    };
  };
}

export interface ProjectTreeItem {
  project: Project;
  boards: Board[];
  taskCount: number | null;
}

export type SearchSourceType = "board" | "task" | "comment";

export interface SearchInput {
  query: string;
  projectId?: string;
  boardId?: string;
  taskId?: string;
  sourceTypes?: SearchSourceType[];
  includeArchived?: boolean;
  limit?: number;
}

export interface SearchResult {
  searchDocumentId: string;
  sourceType: SearchSourceType;
  sourceId: string;
  projectId: string | null;
  boardId: string | null;
  taskId: string | null;
  title: string | null;
  snippet: string;
  distance: number;
  metadata: unknown;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export interface TaskContext {
  project: Project;
  board: Board;
  task: Task;
  comments: TaskComment[];
  activity: TaskActivity[];
  attachments: TaskAttachment[];
}

export type ActivitySort = "asc" | "desc";

interface ActivityParentContext {
  project: Pick<Project, "id" | "name">;
  board: Pick<Board, "id" | "name">;
  task: Pick<Task, "id" | "title" | "priority" | "archivedAt">;
}

export type ProjectActivityItem =
  | (ActivityParentContext & {
      id: string;
      type: "activity";
      activityId: string;
      actorType: ActorType;
      actorName: string | null;
      actorRef: string | null;
      eventType: string;
      summary: string;
      data: Record<string, unknown>;
      createdAt: string | null;
    })
  | (ActivityParentContext & {
      id: string;
      type: "comment";
      commentId: string;
      authorType: ActorType;
      authorName: string | null;
      authorRef: string | null;
      body: string;
      createdAt: string | null;
    });

export interface ProjectActivityResponse {
  items: ProjectActivityItem[];
  hasMore: boolean;
  limit: number;
  offset: number;
  sort: ActivitySort;
}
