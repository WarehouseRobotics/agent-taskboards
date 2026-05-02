# Agent-Friendly API

The API is the main interface for coding agents and scripts. It exposes stable
JSON operations for managing local task state without driving the UI. The
implemented starter API covers projects, boards, board columns, tasks, task
movement, task completion, archival, comments, activity, and task context.

Text embedding search is implemented for boards, tasks, and comments. Broader
maintenance APIs and file attachment APIs are still planned areas.

## API Principles

- JSON-first: request and response bodies use JSON.
- Stable IDs: resources use durable string IDs suitable for agent memory.
- Canonical writes: create, update, move, complete, archive, and comment writes
  return the canonical changed resource.
- Explicit transitions: task movement, completion, and archival are separate
  operations instead of whole-board rewrites.
- Active by default: archived projects, boards, and tasks are hidden unless a
  read endpoint supports `includeArchived=true`.
- Predictable errors: failures use a consistent JSON error shape.
- Local semantics: there are no accounts, workspaces, teams, or permission
  concepts in v1.

## Common Conventions

All examples below show response envelopes at a high level. Timestamp fields are
returned as ISO 8601 strings or `null`.

Read endpoints that support archived records accept:

```text
?includeArchived=true
```

When omitted, `includeArchived` is false.

Errors use:

```json
{
  "error": {
    "code": "not_found",
    "message": "Task not found",
    "details": {}
  }
}
```

Current stable error codes:

- `invalid_request`: request body or query parameters failed validation
- `not_found`: the requested resource or parent/child relationship was not found
- `invalid_state`: persisted state prevents the operation
- `internal_error`: unexpected server failure

## Health

`GET /api/health`

Returns API and database status:

```json
{
  "ok": true,
  "database": {
    "ok": true,
    "path": "/data/taskboards.sqlite",
    "migrations": {
      "applied": [],
      "skipped": ["0000_initial_schema.sql"]
    }
  }
}
```

## Projects

Project fields:

- `id`
- `name`
- `description`
- `repositoryPath`
- `defaultBranch`
- `metadata`
- `archivedAt`
- `createdAt`
- `updatedAt`

### `GET /api/projects`

Lists projects, excluding archived projects by default.

Response:

```json
{
  "projects": []
}
```

### `POST /api/projects`

Creates a project.

Request:

```json
{
  "name": "Agent Taskboards",
  "description": "Local agent work tracking",
  "repositoryPath": "/workspace/agent-taskboards",
  "defaultBranch": "main",
  "metadata": {}
}
```

Required fields:

- `name`

Response status: `201`

Response:

```json
{
  "project": {}
}
```

### `GET /api/projects/:projectId`

Reads one project. Archived projects require `includeArchived=true`.

### `PATCH /api/projects/:projectId`

Updates project metadata. The body must contain at least one mutable field.

Mutable fields:

- `name`
- `description`
- `repositoryPath`
- `defaultBranch`
- `metadata`

### `POST /api/projects/:projectId/archive`

Archives a project by setting `archivedAt`. It does not hard-delete child
boards, tasks, comments, or activity.

## Boards

Board fields:

- `id`
- `projectId`
- `name`
- `description`
- `metadata`
- `archivedAt`
- `createdAt`
- `updatedAt`
- optional `columns`
- optional `tasks`

Column fields:

- `id`
- `boardId`
- `key`
- `name`
- `position`
- `isDone`
- `createdAt`
- `updatedAt`

### `GET /api/projects/:projectId/boards`

Lists boards for a project, excluding archived boards by default.

### `POST /api/projects/:projectId/boards`

Creates a board. If no `columns` array is provided, the API creates the default
workflow columns:

```text
backlog, ready, in_progress, blocked, review, done
```

The `done` column has `isDone: true`; all other default columns have
`isDone: false`.

Request:

```json
{
  "name": "Implementation",
  "description": "Starter API work",
  "metadata": {},
  "columns": [
    { "key": "todo", "name": "Todo" },
    { "key": "done", "name": "Done", "isDone": true }
  ]
}
```

Required fields:

- `name`

Column keys must be unique within the board and match lowercase letters,
numbers, underscores, and hyphens after an initial lowercase letter or number.

Response status: `201`

Response includes the created board and columns.

### `GET /api/projects/:projectId/boards/:boardId`

Reads one board and includes its ordered columns.

Optional query:

```text
?includeTasks=true
```

When `includeTasks=true`, the response includes task summaries for the board.
Archived tasks are included only when `includeArchived=true` is also present.

### `PATCH /api/projects/:projectId/boards/:boardId`

Updates board metadata. The body must contain at least one mutable field.

Mutable fields:

- `name`
- `description`
- `metadata`

Workflow column editing is not implemented yet.

### `POST /api/projects/:projectId/boards/:boardId/archive`

Archives a board by setting `archivedAt`. It does not hard-delete tasks,
comments, or activity.

## Tasks

Task fields:

- `id`
- `projectId`
- `boardId`
- `columnId`
- `title`
- `description`
- `position`
- `priority`
- `labels`
- `externalReferences`
- `metadata`
- `completedAt`
- `archivedAt`
- `createdAt`
- `updatedAt`

Supported priorities:

```text
low, normal, high, urgent
```

### `GET /api/projects/:projectId/boards/:boardId/tasks`

Lists tasks for a board, excluding archived tasks by default.

Tasks are ordered by column, then position, then creation time.

### `POST /api/projects/:projectId/boards/:boardId/tasks`

Creates a task and appends a `task.created` activity entry.

Request:

```json
{
  "title": "Build starter API",
  "description": "Expose project, board, task, and comment routes.",
  "columnKey": "ready",
  "priority": "high",
  "labels": ["api", "starter"],
  "externalReferences": [],
  "metadata": {}
}
```

Required fields:

- `title`

Column selection:

- provide `columnId`, or
- provide `columnKey`, or
- omit both to use the board's first column by position

`columnId` and `columnKey` are mutually exclusive. New tasks are placed at the
end of the destination column. If the destination column has `isDone: true`, the
task is created with `completedAt` set.

Response status: `201`

Response:

```json
{
  "task": {},
  "activity": {}
}
```

### `GET /api/tasks/:taskId`

Reads one task. Archived tasks require `includeArchived=true`.

### `PATCH /api/tasks/:taskId`

Updates task fields and appends a `task.updated` activity entry. The body must
contain at least one mutable field.

Mutable fields:

- `title`
- `description`
- `priority`
- `labels`
- `externalReferences`
- `metadata`

### `POST /api/tasks/:taskId/move`

Moves a task to another column and optional position, reordering affected tasks
inside a database transaction. The operation appends a `task.moved` activity
entry.

Request:

```json
{
  "columnKey": "blocked",
  "position": 0
}
```

Column selection uses either `columnId` or `columnKey`. `position` is optional;
when omitted, the task moves to the end of the destination column.

Moving into an `isDone` column sets `completedAt` if it is not already set.
Moving to a non-done column clears `completedAt`.

### `POST /api/tasks/:taskId/complete`

Sets `completedAt` and appends a `task.completed` activity entry. This does not
move the task to a done column.

### `POST /api/tasks/:taskId/archive`

Sets `archivedAt` and appends a `task.archived` activity entry.

## Comments, Activity, And Context

Comment fields:

- `id`
- `projectId`
- `boardId`
- `taskId`
- `authorType`
- `authorName`
- `authorRef`
- `body`
- `metadata`
- `createdAt`

Supported author and actor types:

```text
human, agent, system
```

Activity fields:

- `id`
- `projectId`
- `boardId`
- `taskId`
- `actorType`
- `actorName`
- `actorRef`
- `eventType`
- `summary`
- `data`
- `createdAt`

### `GET /api/tasks/:taskId/comments`

Lists comments for a task in creation order.

### `POST /api/tasks/:taskId/comments`

Creates a comment and appends a `comment.created` activity entry.

Request:

```json
{
  "authorType": "agent",
  "authorName": "Codex",
  "authorRef": "local-session",
  "body": "Implementation started.",
  "metadata": {}
}
```

Required fields:

- `authorType`
- `body`

Response status: `201`

Response:

```json
{
  "comment": {},
  "activity": {}
}
```

### `GET /api/tasks/:taskId/activity`

Lists task activity entries in creation order.

Current generated event types:

- `task.created`
- `task.updated`
- `task.moved`
- `task.completed`
- `task.archived`
- `comment.created`

### `GET /api/tasks/:taskId/context`

Fetches combined task context for agent handoff or UI detail views.

Response:

```json
{
  "project": {},
  "board": {},
  "task": {},
  "comments": [],
  "activity": []
}
```

The `board` object includes ordered columns.

## Search

`POST /api/search`

Runs local semantic search over indexed board, task, and comment documents.
Search uses local embeddings and `sqlite-vec`; it does not call hosted services.

Request:

```json
{
  "query": "blocked tasks about sqlite migrations",
  "projectId": "optional",
  "boardId": "optional",
  "taskId": "optional",
  "sourceTypes": ["board", "task", "comment"],
  "includeArchived": false,
  "limit": 10
}
```

Required fields:

- `query`

Defaults:

- `sourceTypes`: all indexed source types
- `includeArchived`: `false`
- `limit`: `10`

Response:

```json
{
  "query": "blocked tasks about sqlite migrations",
  "results": [
    {
      "searchDocumentId": "doc-id",
      "sourceType": "task",
      "sourceId": "task-id",
      "projectId": "project-id",
      "boardId": "board-id",
      "taskId": "task-id",
      "title": "SQLite migration blocker",
      "snippet": "Task: SQLite migration blocker ...",
      "distance": 0.123,
      "metadata": {}
    }
  ]
}
```

Archived projects, boards, and tasks are excluded unless
`includeArchived: true` is provided. Comments inherit archive visibility from
their parent task, board, and project.

## Planned API Areas

The following areas are documented as product direction but are not implemented
in the starter API yet:

- workflow column editing after board creation
- hard deletion and purge operations
- file attachments and upload workflows
