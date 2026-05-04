---
name: tasks-management
description: Manage coding tasks boards - read, create, move, comment on, and search Kanban tasks/boards/projects in coding agent taskboards.
metadata:
  author: WarehouseRobotics
  version: "0.2.0"
---

## When to use

Use this skill whenever the user wants you to track work, look up existing
tasks, leave handoff notes, or query historical project context in Agent Taskboards. 
Strong signals: the user mentions "taskboard", "the board", "this task" 
or if the tasks management skill and taskboards are mentioned in project instructions.

## The `taskboards` wrapper

All calls go through the bash wrapper at:

```text
${CLAUDE_SKILL_DIR}/scripts/taskboards
```

It absorbs base-URL detection, bearer auth, query-string encoding, JSON body
construction, and multipart attachment upload for the high-traffic shortcuts.
Do not hand-roll `curl` unless you need an endpoint or option the wrapper does
not cover.

Invocation grammar:

```text
taskboards <verb> <path-or-shortcut> [key=value ...] [--json BODY | --data @FILE]
```

- `<verb>` is `get`, `post`, `patch`, `delete`, or one of the shortcuts below.
- `<path>` is API-relative (the wrapper prepends `/api/agents/`).
- Bare `key=value` args become URL-encoded query parameters.
- `--json '<body>'` sets a JSON request body inline.

Responses are returned verbatim — markdown narrative plus a fenced TOON block
by default. Add `format=yaml|json|none` as a `key=value` arg to switch.

### Environment

Read from the shell; the wrapper handles the rest:

- `TASKBOARDS_HOST_URL` — base URL. Default `http://localhost:8142`.
- `TASKBOARDS_API_KEY` — bearer token. Empty by default; sent only when set.
- `TASKBOARDS_AGENT_NAME` — comment author name. Default `Claude Code`.
- `TASKBOARDS_AGENT_REF` — comment author ref. Default `$CLAUDE_SESSION_ID` or
  `local`.

### Shortcuts

| Shortcut                                | Resolves to                                                              |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `taskboards health`                     | `GET /api/agents/health`                                                 |
| `taskboards help`                       | `GET /api/agents/help`                                                   |
| `taskboards context <taskId>`           | `GET /api/agents/tasks/<id>/context?view=full&include=comments,activity` |
| `taskboards move <taskId> <columnKey>`  | `POST /api/agents/tasks/<id>/move`                                       |
| `taskboards complete <taskId>`          | `POST /api/agents/tasks/<id>/complete`                                   |
| `taskboards archive <taskId>`           | `POST /api/agents/tasks/<id>/archive`                                    |
| `taskboards comment <taskId> <body...>` | `POST /api/agents/tasks/<id>/comments` with auto-filled agent identity   |
| `taskboards attach <taskId> <filePath>` | `POST /api/agents/tasks/<id>/attachments` with multipart `file` upload   |

The `comment` shortcut auto-fills `authorType=agent`, `authorName`, and
`authorRef` from env. Pass `--json '{...}'` to override the whole body.

## Orientation flow (do this before substantive work)

1. `taskboards get projects/<projectNameOrId>` — find the project. If name or id is unknown, try using `taskboards get projects repositoryPath="$PWD"`. Fall
   back to `q=<name>` if no match.
2. `taskboards get projects/<projectNameOrId>/boards` — pick the board.
3. `taskboards get tasks boardId=<boardNameOrId> status=pending` — see open work
   before creating anything.

Keep the returned IDs visible in your prose so handoffs stay traceable.

## Common operations

Search before create:

```sh
taskboards get tasks q="<phrase>" semantic=true boardId=<boardNameOrId>
```

Read one task with full context (use the `context` shortcut for handoff or
implementation work):

```sh
taskboards context <taskId>
```

Create a task (`columnKey` defaults to the board's first column on the server
side):

```sh
taskboards post projects/<projectNameOrId>/boards/<boardNameOrId>/tasks \
  --json '{"title":"...","description":"...","columnKey":"ready","priority":"normal","labels":[]}'
```

Move a task — the shortcut sends `{"columnKey":"<key>"}`. Moving into a done
column sets `completedAt`; moving out clears it.

```sh
taskboards move <taskId> in_progress
```

Comment (identity auto-filled from env):

```sh
taskboards comment <taskId> "Implementation started; see commit abc123."
```

Attach evidence such as a screenshot, log, or trace file:

```sh
taskboards attach <taskId> ./screenshot.png
```

Update fields (`title`, `description`, `priority`, `labels`,
`externalReferences`, `metadata`):

```sh
taskboards patch tasks/<taskId> --json '{"priority":"high"}'
```

Complete (sets `completedAt` without moving columns) and archive:

```sh
taskboards complete <taskId>
taskboards archive <taskId>
```

Semantic search across boards, tasks, and comments:

```sh
taskboards get search q="<phrase>" projectId=<projectNameOrId> limit=10
```

When you do not remember a route, run `taskboards help`.

## Using names instead of IDs

For projects and boards you can use their URL-compliant names instead of IDs. Tasks still require an ID.

## Response controls (token cost knobs)

Pass these as bare `key=value` args:

- `format=toon|yaml|json|none` — default `toon`.
- `view=brief|normal|full` — default `normal`. Use `brief` for scans, `full`
  only when you actually need descriptions/metadata.
- `include=description,comments,activity,metadata,externalReferences` —
  opt-in; explicit `include` overrides `view`.
- `limit` (default 25, search 10), `offset`, `perColumnLimit` (20),
  `commentLimit` (5), `activityLimit` (10).
- `includeArchived=true` — required to see archived projects/boards/tasks.

Truncated responses always carry exact follow-up calls in their `Next calls`
section — read and use them instead of guessing.

## Workflow rules

- Search before create. On a clear match, update or comment on the existing
  task instead of duplicating.
- Move tasks explicitly when their state changes. Do not rely on `complete` as
  a substitute for moving to a done column unless the user asked for that.
- Leave a comment for blockers, decisions, and handoffs — comments are the
  durable record, chat is not.
- Archive instead of deleting; there is no hard-delete endpoint. Confirm with
  the user before archiving anything they did not ask to archive.
- Prefer using names for projects and boards, rather than IDs. Taskboards project and board names can sometimes be found in project instructions.
- When mentioning tasks, mention at least the name and ID (not just the ID alone)
- Keep object IDs or names (`project_…`, `board_…`, `task_…`) visible in your replies.

## Errors

Errors arrive as markdown with a fenced block carrying a stable code:
`invalid_request`, `not_found`, `invalid_state`, `internal_error`. The
response usually includes a `Next calls` section — follow it (e.g. retry with
`includeArchived=true`, or run `taskboards help`).
