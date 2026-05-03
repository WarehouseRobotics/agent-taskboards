---
name: tasks-management
description: Manage coding tasks boards: read, create, move, comment on, and search Kanban tasks/boards/projects in coding agent taskboards.
metadata:
  author: WarehouseRobotics
  version: "0.1.0"
---

## When to use

Use this skill whenever the user wants you to track work, look up existing
tasks, leave handoff notes, or query historical project context in Agent
Taskboards. Signals: the working repo contains `docs/taskboards.md`, the
host responds on `$TASKBOARDS_HOST_URL/api/agents/health`, or the user
mentions "taskboard", "the board", "this task".

## API base & auth

Read both from the environment (set in Claude Code's `settings.json`):

- `TASKBOARDS_HOST_URL` — base URL. Default `http://localhost:8142`.
- `TASKBOARDS_API_KEY` — bearer token. Empty by default (local setup).

Canonical `curl` shape — use this for **every** call:

```sh
curl -sS \
  ${TASKBOARDS_API_KEY:+-H "Authorization: Bearer $TASKBOARDS_API_KEY"} \
  "$TASKBOARDS_HOST_URL/api/agents/<path>"
```

Responses are `text/markdown` with a fenced TOON block by default. Override
with `?format=yaml|json|none`.

## Orientation flow (do this before substantive work)

1. `GET /api/agents/projects?repositoryPath=$PWD` — find the project.
   Fall back to `?q=<name>` if no match.
2. `GET /api/agents/projects/:projectId/boards` — pick the board.
3   . `GET /api/agents/tasks?boardId=:boardId&status=pending` — see open work
   before creating anything.

Keep the returned IDs visible in your prose so handoffs stay traceable.

## Common operations

Search before create:

```sh
curl -sS ${TASKBOARDS_API_KEY:+-H "Authorization: Bearer $TASKBOARDS_API_KEY"} \
  "$TASKBOARDS_HOST_URL/api/agents/tasks?q=<phrase>&semantic=true&boardId=:boardId"
```

Read one task with full context (use `view=full` only when you need it):

```sh
curl -sS ${TASKBOARDS_API_KEY:+-H "Authorization: Bearer $TASKBOARDS_API_KEY"} \
  "$TASKBOARDS_HOST_URL/api/agents/tasks/:taskId/context?view=full&include=comments,activity"
```

Create a task (POST JSON; `columnKey` defaults to the board's first column):

```sh
curl -sS -X POST -H "Content-Type: application/json" \
  ${TASKBOARDS_API_KEY:+-H "Authorization: Bearer $TASKBOARDS_API_KEY"} \
  "$TASKBOARDS_HOST_URL/api/agents/projects/:projectId/boards/:boardId/tasks" \
  -d '{"title":"...","description":"...","columnKey":"ready","priority":"normal","labels":[]}'
```

Move a task (`columnKey` xor `columnId`; moving into a done column sets
`completedAt`, moving out clears it):

```sh
curl -sS -X POST -H "Content-Type: application/json" \
  ${TASKBOARDS_API_KEY:+-H "Authorization: Bearer $TASKBOARDS_API_KEY"} \
  "$TASKBOARDS_HOST_URL/api/agents/tasks/:taskId/move" \
  -d '{"columnKey":"in_progress"}'
```

Comment (always set `authorType:"agent"` and a stable `authorName`/`authorRef`):

```sh
curl -sS -X POST -H "Content-Type: application/json" \
  ${TASKBOARDS_API_KEY:+-H "Authorization: Bearer $TASKBOARDS_API_KEY"} \
  "$TASKBOARDS_HOST_URL/api/agents/tasks/:taskId/comments" \
  -d '{"authorType":"agent","authorName":"Claude Code","authorRef":"<session-id>","body":"..."}'
```

Update fields (`title`, `description`, `priority`, `labels`,
`externalReferences`, `metadata`):

```sh
curl -sS -X PATCH -H "Content-Type: application/json" \
  ${TASKBOARDS_API_KEY:+-H "Authorization: Bearer $TASKBOARDS_API_KEY"} \
  "$TASKBOARDS_HOST_URL/api/agents/tasks/:taskId" -d '{"priority":"high"}'
```

Complete (sets `completedAt` without moving columns) and archive:

```sh
curl -sS -X POST ${TASKBOARDS_API_KEY:+-H "Authorization: Bearer $TASKBOARDS_API_KEY"} \
  "$TASKBOARDS_HOST_URL/api/agents/tasks/:taskId/complete"
curl -sS -X POST ${TASKBOARDS_API_KEY:+-H "Authorization: Bearer $TASKBOARDS_API_KEY"} \
  "$TASKBOARDS_HOST_URL/api/agents/tasks/:taskId/archive"
```

Semantic search across boards, tasks, and comments:

```sh
curl -sS ${TASKBOARDS_API_KEY:+-H "Authorization: Bearer $TASKBOARDS_API_KEY"} \
  "$TASKBOARDS_HOST_URL/api/agents/search?q=<phrase>&projectId=:projectId&limit=10"
```

When you do not remember a route, hit `GET /api/agents/help`.

## Response controls (token cost knobs)

- `format=toon|yaml|json|none` — default `toon`.
- `view=brief|normal|full` — default `normal`. Use `brief` for scans,
  `full` only when you actually need descriptions/metadata.
- `include=description,comments,activity,metadata,externalReferences` —
  opt-in; explicit `include` overrides `view`.
- `limit` (default 25, search 10), `offset`, `perColumnLimit` (20),
  `commentLimit` (5), `activityLimit` (10).
- `includeArchived=true` — required to see archived projects/boards/tasks.

Truncated responses always carry exact follow-up calls in their
`Next calls` section — read and use them instead of guessing.

## Workflow rules

- Search before create. On a clear match, update or comment on the
  existing task instead of duplicating.
- Move tasks explicitly when their state changes. Do not rely on
  `complete` as a substitute for moving to a done column unless the user
  asked for that.
- Leave a comment for blockers, decisions, and handoffs — comments are
  the durable record, chat is not.
- Archive instead of deleting; there is no hard-delete endpoint. Confirm
  with the user before archiving anything they did not ask to archive.
- Keep IDs (`project_…`, `board_…`, `task_…`) visible in your replies.

## Errors

Errors arrive as markdown with a fenced block carrying a stable code:
`invalid_request`, `not_found`, `invalid_state`, `internal_error`. The
response usually includes a `Next calls` section — follow it (e.g. retry
with `includeArchived=true`, or call `/api/agents/help`).
