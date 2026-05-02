import type {
  Board,
  BoardColumn,
  JsonArray,
  Project,
  Task,
  TaskActivity,
  TaskComment,
} from "../db/schema.js";

export function serializeProject(project: Project) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    repositoryPath: project.repositoryPath,
    defaultBranch: project.defaultBranch,
    metadata: project.metadata,
    archivedAt: serializeDate(project.archivedAt),
    createdAt: serializeDate(project.createdAt),
    updatedAt: serializeDate(project.updatedAt),
  };
}

export function serializeBoard(
  board: Board,
  includes: { columns?: BoardColumn[]; tasks?: Task[] } = {},
) {
  return {
    id: board.id,
    projectId: board.projectId,
    name: board.name,
    description: board.description,
    metadata: board.metadata,
    archivedAt: serializeDate(board.archivedAt),
    createdAt: serializeDate(board.createdAt),
    updatedAt: serializeDate(board.updatedAt),
    ...(includes.columns
      ? { columns: includes.columns.map(serializeBoardColumn) }
      : {}),
    ...(includes.tasks ? { tasks: includes.tasks.map(serializeTask) } : {}),
  };
}

export function serializeBoardColumn(column: BoardColumn) {
  return {
    id: column.id,
    boardId: column.boardId,
    key: column.key,
    name: column.name,
    position: column.position,
    isDone: column.isDone,
    createdAt: serializeDate(column.createdAt),
    updatedAt: serializeDate(column.updatedAt),
  };
}

export function serializeTask(task: Task) {
  return {
    id: task.id,
    projectId: task.projectId,
    boardId: task.boardId,
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    position: task.position,
    priority: task.priority,
    labels: task.labels as string[],
    externalReferences: task.externalReferences as JsonArray,
    metadata: task.metadata,
    completedAt: serializeDate(task.completedAt),
    archivedAt: serializeDate(task.archivedAt),
    createdAt: serializeDate(task.createdAt),
    updatedAt: serializeDate(task.updatedAt),
  };
}

export function serializeComment(comment: TaskComment) {
  return {
    id: comment.id,
    projectId: comment.projectId,
    boardId: comment.boardId,
    taskId: comment.taskId,
    authorType: comment.authorType,
    authorName: comment.authorName,
    authorRef: comment.authorRef,
    body: comment.body,
    metadata: comment.metadata,
    createdAt: serializeDate(comment.createdAt),
  };
}

export function serializeActivity(activity: TaskActivity) {
  return {
    id: activity.id,
    projectId: activity.projectId,
    boardId: activity.boardId,
    taskId: activity.taskId,
    actorType: activity.actorType,
    actorName: activity.actorName,
    actorRef: activity.actorRef,
    eventType: activity.eventType,
    summary: activity.summary,
    data: activity.data,
    createdAt: serializeDate(activity.createdAt),
  };
}

function serializeDate(value: Date | null) {
  return value?.toISOString() ?? null;
}
