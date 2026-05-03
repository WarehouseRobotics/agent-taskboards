# Agentic API

The agentic API is a planned markdown-first API for coding agents that want
taskboard context in a form that is easy to read, cite, and continue from inside
an agent transcript. It is mounted under:

```text
/api/agents
```

The canonical JSON API documented in `docs/api.md` remains the source of truth
for resource semantics. The agentic API mirrors those operations but presents
responses as natural language with optional compact structured blocks.

Project and board names are URL-safe slugs (`^[a-z0-9_-]+$`). Agentic path and
query parameters named `projectId` or `boardId` accept either the durable ID or
the slug name. Resolution is exact and tries ID first, then name.

## Design Goals

- Help agents orient themselves quickly across projects, boards, and pending
  work.
- Preserve stable IDs, parent context, and exact follow-up calls in every useful
  response.
- Avoid context overload when boards, comments, or activity streams are large.
- Keep write request bodies deterministic JSON even when responses are
  markdown.
- Make the response readable by humans while still giving agents parseable
  facts.

The agentic API is optimized for trusted local coding agents, not for generic
public API clients.

## Response Contract

Responses default to `text/markdown`. A successful response should use this
shape:

1. A short natural-language outcome.
2. A `What I found` or `What changed` section with the reasoning-relevant
   summary.
3. A fenced structured block when `format` is not `none`.
4. A `Next calls` section when there are obvious useful follow-up requests.

The default structured block format is TOON because it is compact and easy for
agents to scan:

````markdown
Found 3 active tasks on board `board_123`.

## What I found

- 2 tasks are ready.
- 1 task is blocked and has recent agent context.
- Comments and activity were summarized only; fetch task context for the full
  thread.

```toon
result:
  project: project_abc | Agent Taskboards
  board: board_123 | Implementation
  view: normal
  truncated: false
tasks[3]:
  id | column | priority | title | comments | activity | next
  task_1 | ready | high | Build agent API spec | 2 | 5 | GET /api/agents/tasks/task_1/context?view=full&include=comments,activity
  task_2 | ready | normal | Add task filters | 0 | 1 | GET /api/agents/tasks/task_2
  task_3 | blocked | high | Wire semantic search | 4 | 8 | GET /api/agents/tasks/task_3/context?include=comments
```

## Next calls

- `GET /api/agents/tasks/task_1/context?view=full&include=comments,activity`
- `GET /api/agents/tasks?boardId=board_123&columnKey=ready&view=brief`
````

### Format Control

Read endpoints accept:

```text
?format=toon|yaml|json|none
```

Default: `toon`.

- `toon`: include compact fenced `toon` blocks.
- `yaml`: include fenced YAML blocks for callers that prefer common tooling.
- `json`: include fenced JSON blocks, not a JSON HTTP response.
- `none`: return markdown prose only.

The normal JSON API remains available under `/api` for clients that need
machine-only JSON responses.

### Detail Control

Read endpoints accept:

```text
?view=brief|normal|full
?include=comments,activity,metadata,description,externalReferences
```

Default `view`: `normal`.

`view` controls the baseline amount of detail:

- `brief`: IDs, parent IDs, title/name, status column, priority, labels, and
  counts. No descriptions, comments, activity, metadata, or long snippets.
- `normal`: enough context for task selection, including short descriptions or
  snippets, labels, priority, column, timestamps, and comment/activity counts.
- `full`: full resource detail for the selected object. Expensive child
  collections are still governed by `include` and per-collection limits.

`include` opts into fields that are normally omitted from list responses:

- `description`
- `comments`
- `activity`
- `metadata`
- `externalReferences`

If `include` conflicts with `view`, explicit `include` wins. For example,
`view=brief&include=comments` returns a brief task summary with bounded comment
context.

### Context Guards

Endpoints that can return multiple records or long child collections accept:

```text
?limit=20
?offset=0
?perColumnLimit=10
?commentLimit=5
?activityLimit=5
```

Limits should be conservative by default:

- general list `limit`: 25
- board task `perColumnLimit`: 20
- comments in task context: 5
- activity in task context: 10
- search results: 10

Every truncated response must say what was omitted and include an exact next
call. Truncation metadata should also appear in the structured block.

### Archived Content

Read endpoints exclude archived projects, boards, and tasks by default. They
accept:

```text
?includeArchived=true
```

Archived content included in a response must be marked clearly in prose and in
structured data.

## Orientation Endpoints

### `GET /api/agents/help`

Returns a markdown overview of available agentic endpoints, response controls,
and write request examples. This endpoint should be safe for agents to call
when they do not remember the API shape.

### `GET /api/agents/health`

Mirrors `GET /api/health` but explains operational status in markdown. The
structured block should include database state, migration status, and any known
embedding/search availability.

## Projects

### `GET /api/agents/projects`

Lists projects. Supports:

```text
?q=agent-taskboards
?repositoryPath=/workspace/agent-taskboards
?includeArchived=true
?view=brief|normal|full
```

The response should help an agent choose the likely project. If `q` or
`repositoryPath` is provided, likely matches should be grouped before other
projects.

### `POST /api/agents/projects`

Creates a project using the same JSON request body as `POST /api/projects`.
Returns markdown summarizing the created project and a structured block with the
canonical ID.

### `GET /api/agents/projects/:projectId`

Reads one project and, in `normal` or `full` views, summarizes its active boards
and task counts when available.
`:projectId` may be either a project ID or project name.

### `PATCH /api/agents/projects/:projectId`

Updates project metadata using the same JSON body as the normal API.

### `POST /api/agents/projects/:projectId/archive`

Archives a project. The response must explicitly state that child boards, tasks,
comments, and activity are not hard-deleted.

## Boards

### `GET /api/agents/projects/:projectId/boards`

Lists boards for a project. Supports `q`, `includeArchived`, `view`, `limit`,
and `format`.
`:projectId` may be either a project ID or project name.

The response should show enough parent context for agents to avoid mixing
boards:

- project ID and name
- board ID and name
- workflow columns
- active task counts by column when available

### `POST /api/agents/projects/:projectId/boards`

Creates a board using the same JSON request body as
`POST /api/projects/:projectId/boards`.

### `GET /api/agents/projects/:projectId/boards/:boardId`

Reads a board. Supports:

```text
?includeTasks=true
?perColumnLimit=20
?include=metadata
```

When `includeTasks=true`, tasks should be grouped by workflow column. Large
columns must be truncated independently with exact follow-up calls.
`:projectId` and `:boardId` may use IDs or slug names.

### `PATCH /api/agents/projects/:projectId/boards/:boardId`

Updates board metadata using the same JSON body as the normal API. Workflow
column editing remains out of scope until the canonical API supports it.

### `POST /api/agents/projects/:projectId/boards/:boardId/archive`

Archives a board without hard-deleting tasks, comments, or activity.

## Tasks

Task list responses should never include every comment or every activity entry
by default. They should include counts, recent timestamps, and follow-up calls
for expansion.

### `GET /api/agents/tasks`

Main endpoint for getting tasks. Discovers tasks across projects and boards. This is the primary endpoint for
agents that know what work they want but may not know the board.

Supported query parameters:

```text
?projectId=project_abc
?boardId=board_123
?columnKey=ready
?status=pending|active|blocked|review|done|archived|all
?priority=low|normal|high|urgent
?labels=api,agent
?q=semantic search
?semantic=true
?includeArchived=true
?view=brief|normal|full
?include=description,metadata
?limit=25
?offset=0
```

Filtering semantics:

- `projectId` scopes results to one project.
- `boardId` scopes results to one board and implies its project when possible.
  If a board name is used without a project and the name exists in multiple
  projects, the request must include `projectId`.
- `columnKey` matches board workflow column keys.
- `status` is an agent-friendly grouping. `done` maps to done columns or
  completed tasks; `archived` requires archived records; `pending` excludes done
  and archived tasks.
- `labels` matches all requested labels.
- `q` performs text matching when `semantic` is omitted or false.
- `q` with `semantic=true` uses the semantic search pipeline and should return
  ranked task-oriented results.

The response should group results by project and board unless a single board is
explicitly selected.

### `POST /api/agents/projects/:projectId/boards/:boardId/tasks`

Creates a task using the same JSON body as the normal API:

```json
{
  "title": "Build agent task discovery",
  "description": "Expose a markdown-first task discovery endpoint.",
  "columnKey": "ready",
  "priority": "high",
  "labels": ["api", "agent"],
  "externalReferences": [],
  "metadata": {}
}
```

The response should summarize the created task, the destination column, and the
activity entry that was generated.

### `GET /api/agents/tasks/:taskId`

Reads one task. Supports `view`, `include`, `commentLimit`, `activityLimit`, and
`includeArchived`.

Default `normal` view should include:

- project, board, and column identity
- task title, priority, labels, and completion/archive state
- description snippet when present
- comment and activity counts
- exact calls for full context, comments, activity, move, complete, archive, and
  comment creation

### `PATCH /api/agents/tasks/:taskId`

Updates mutable task fields using the same JSON body as `PATCH /api/tasks/:id`.
The response should call out the changed fields and generated activity ID.

### `POST /api/agents/tasks/:taskId/move`

Moves a task using the same JSON body as `POST /api/tasks/:id/move`:

```json
{
  "columnKey": "blocked",
  "position": 0
}
```

The response must mention completion side effects:

- moving into a done column sets `completedAt`
- moving out of a done column clears `completedAt`

### `POST /api/agents/tasks/:taskId/complete`

Completes a task without moving it. The response should explain that this
mirrors the canonical API and does not change the task column.

### `POST /api/agents/tasks/:taskId/archive`

Archives a task. The response should state that comments and activity remain
attached and searchable when archived content is included.

## Comments, Activity, And Context

### `GET /api/agents/tasks/:taskId/context`

Returns task context for handoff or implementation. Supports:

```text
?view=normal|full
?include=comments,activity,metadata,externalReferences
?commentLimit=20
?activityLimit=20
```

Default behavior should include the task, parent project and board, ordered
workflow columns, recent comments, recent activity, and truncation notices. Full
comments and activity require explicit `include` or `view=full`.

### `GET /api/agents/tasks/:taskId/comments`

Lists comments in creation order. Supports `limit`, `offset`, and `format`.
Comments should preserve author type, optional author name/ref, creation time,
and body.

### `POST /api/agents/tasks/:taskId/comments`

Creates a comment using the same JSON body as the normal API:

```json
{
  "authorType": "agent",
  "authorName": "Codex",
  "authorRef": "local-session",
  "body": "Implementation started.",
  "metadata": {}
}
```

The response should include the new comment ID, generated activity ID, and task
ID.

### `GET /api/agents/tasks/:taskId/activity`

Lists task activity in creation order. Supports `limit`, `offset`, and
`format`. Activity entries should stay compact unless `view=full` is requested.

## Search

### `GET /api/agents/search`

Runs search from query parameters:

```text
?q=vector search
?projectId=project_abc
?boardId=board_123
?taskId=task_456
?sourceTypes=board,task,comment
?includeArchived=true
?limit=10
```

### `POST /api/agents/search`

Runs search with the same JSON body as `POST /api/search`:

```json
{
  "query": "vector search",
  "projectId": "project_abc",
  "boardId": "board_123",
  "sourceTypes": ["task", "comment"],
  "includeArchived": false,
  "limit": 10
}
```

Search uses the existing semantic search implementation over boards, tasks, and
comments. Project and activity result types are reserved for future indexing and
must not be documented as implemented until the canonical search service indexes
them.

Search responses should include:

- matched source type and ID
- parent project, board, and task IDs when available
- compact snippets
- relevance distance or score when available
- exact calls for fetching the canonical task or context

## Error Responses

Agentic errors should use markdown but preserve canonical error codes:

````markdown
The task could not be found.

## Error

`not_found`: Task not found.

```toon
error:
  code: not_found
  message: Task not found
  details: {}
next:
  - GET /api/agents/tasks?includeArchived=true&q=<known task title>
  - GET /api/agents/help
```
````

Stable error codes match the normal API:

- `invalid_request`
- `not_found`
- `invalid_state`
- `internal_error`

HTTP status codes should also match the canonical JSON API.

## Implementation Notes

- Register agentic routes separately from the normal JSON routes so response
  rendering can evolve without affecting `/api` clients.
- Reuse the existing service layer for all reads and writes. Do not duplicate
  task movement, completion, archival, comment, or search semantics.
- Keep request validation aligned with the normal API schemas wherever the
  request body is the same.
- Build response rendering as a small formatter layer that can emit markdown
  plus TOON, YAML, JSON, or no structured block.
- Do not include full comments or activity in task lists unless explicitly
  requested.
- Every truncation must include stable IDs and an exact follow-up call.

## Acceptance Scenarios

- An agent can discover the likely project and board from a repository path or
  loose project query.
- An agent can list pending work without receiving full comments or activity for
  every task.
- An agent can expand one task into full context, including comments and
  activity, by using explicit detail controls.
- An agent can search semantically across active board, task, and comment memory
  and fetch exact task context from stable IDs.
- An agent can create, move, comment on, complete, and archive tasks through
  `/api/agents` while preserving canonical state-transition rules.
- Large boards and chatty tasks return clear truncation notices and exact next
  calls instead of overflowing the response.
