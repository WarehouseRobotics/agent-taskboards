# Agent Taskboards

Agent Taskboards is a local-first Kanban task board for developers who coordinate
coding work with AI agents. It gives humans a React board UI and gives agents a
stable API for creating, moving, searching, and annotating tasks without brittle
UI automation.

![Agent Taskboards demo board](screenshot.jpg)

The app is intentionally single-user and local. It runs in Docker, stores task
data in SQLite, and supports local semantic search over boards, tasks, and
comments with a GGUF embedding model.

## Use Cases

- Track implementation work across multiple repositories, projects, or local
  workstreams.
- Give coding agents durable task memory that survives chat sessions and
  container restarts.
- Keep project context searchable through task descriptions, comments, and board
  state.
- Coordinate handoffs by leaving append-only comments and preserving task
  activity history.
- Avoid driving a web UI from agents when a deterministic JSON API is available.

## Features

- Projects, boards, workflow columns, tasks, comments with activity history and uploads.
- Default Kanban workflow columns: `backlog`, `ready`, `in_progress`, `blocked`,
  `review`, and `done`.
- React UI for human task management.
- Express API for scripts and AI agents.
- SQLite persistence in `data/taskboards.sqlite`.
- Local semantic search over boards, tasks, and comments using `node-llama-cpp`
  and `sqlite-vec`.
- Agent helper skill and wrapper script under `skills/tasks-management/`.

## Before First Run: Download the Embeddings Model

The local embedding model is expected at:

```text
models-gguf/bge-small-en-v1.5-f32.gguf
```

The model directory is ignored by git so model weights stay local. To download
the expected GGUF file from Hugging Face:

```sh
mkdir -p models-gguf
curl -L \
  -o models-gguf/bge-small-en-v1.5-f32.gguf \
  https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf/resolve/main/bge-small-en-v1.5-f32.gguf
```

GGUF is the model file format used by `llama.cpp` and `node-llama-cpp`. The
`f32` file is the unquantized version expected by this repo's default settings;
smaller quantized files exist, but use the exact filename above unless you also
set `TASKBOARDS_EMBEDDING_MODEL_PATH` to point at a different model file.

## Quick Start

Start the app in Docker:

```sh
docker compose up --build
```

Then open:

```text
http://localhost:8142
```

By default, Docker Compose sets `TASKBOARDS_DEBUG=1`. In debug mode, the Vite UI
runs on port `8142`, the Express API runs on port `3000`, and Vite proxies
`/api` requests to the API server.

Run release mode by unsetting `TASKBOARDS_DEBUG`:

```sh
TASKBOARDS_DEBUG= docker compose up --build
```

In release mode, the container builds the API and UI into `dist/` and serves the
compiled Express app and static UI from port `8142`.

## Install the Skill for Claude Code

The repo ships a Claude Code skill at `skills/tasks-management/` that teaches
agents how to drive the taskboards API through the bundled `taskboards` bash
wrapper. To make Claude Code load it automatically, symlink the skill directory
into one of Claude Code's skill search paths.

User-global (skill is available in every project):

```sh
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/tasks-management" ~/.claude/skills/tasks-management
```

Project-local (skill is available only inside one repo):

```sh
mkdir -p /path/to/your/project/.claude/skills
ln -s "$PWD/skills/tasks-management" \
  /path/to/your/project/.claude/skills/tasks-management
```

Optional environment variables (defaults work for the local Docker setup):

- `TASKBOARDS_HOST_URL` — base URL, default `http://localhost:8142`.
- `TASKBOARDS_API_KEY` — bearer token; only sent when set.
- `TASKBOARDS_AGENT_NAME` — comment author name, default `Claude Code`.
- `TASKBOARDS_AGENT_REF` — comment author reference; falls back to
  `$CLAUDE_SESSION_ID` or `local`.

Verify the install by starting a fresh Claude Code session in a project where
the skill is installed and asking it to run `taskboards health`. The agent
should pick the skill up automatically and respond with a healthy status block.

If you played around and feel secure about letting the task management skill
work freely, add a permission rule to `.claude/settings.json` (shared with the
project) or `.claude/settings.local.json` (personal, gitignored) so Claude Code
stops prompting on every wrapper call:

```json
{
  "permissions": {
    "allow": [
      "Bash(*/skills/tasks-management/scripts/taskboards *)",
      "Bash(*/skills/tasks-management/scripts/taskboards)"
    ]
  }
}
```

The wildcard prefix matches the wrapper regardless of install location
(`~/.claude/skills/...`, `<project>/.claude/skills/...`, or the literal
`${CLAUDE_SKILL_DIR}/...` form the agent may type). The second entry covers
the bare `taskboards` invocation with no trailing arguments. Permission
patterns match the literal command string the agent sends to the Bash tool —
they are not shell-expanded — so list every form you want to allow.

Other agents that follow Claude's `SKILL.md` convention can use the same
symlink approach into their own skill directory.

## Adjust Your Project AGENTS.md/CLAUDE.md

Go to the UI and create the project and the board (that's optional, but recommended). 
Then, in your project instructions file, add the following (or similar):

```
## Project Task Management

Use the task-management skill for tracking project tasks. When performing tasks, you should check taskboard context and track tasks' states using the taskboards skill. This project data:

- taskboards project: `my-project-name` _(create if not found)_
- main board: `main` _(create if not found)_

Keep up with the task boards: **check and update taskboard tasks often!**

```



## Runtime Data

Docker Compose bind-mounts local runtime directories from the repository root:

- `data/` -> `/data`: durable application data. The default SQLite database is
  `/data/taskboards.sqlite`.
- `uploads/` -> `/uploads`: durable uploaded or imported files.
- `tmp/` -> `/tmp/taskboards`: scratch space for temporary generated files.

These directories are ignored by git except for their `.keep` placeholders.

## Development Commands

Project scripts are intended to run inside Docker. Do not run `npm install` on
the host machine.

Run checks in the running container:

```sh
docker compose exec taskboards npm run typecheck
docker compose exec taskboards npm run lint
docker compose exec taskboards npm run test
```

Build the app:

```sh
docker compose exec taskboards npm run build
```

Rebuild local embedding search data:

```sh
docker compose exec taskboards npm run embeddings:reindex
```

Run the embedding smoke test:

```sh
docker compose exec taskboards npm run test:embeddings
```

## Typical Workflows

Create a project for a repository or workstream, then create one or more boards
for active implementation, backlog planning, release work, or bug triage.

Use the board UI to create tasks, edit descriptions, assign labels and
priorities, move work through columns, inspect task context, and search prior
work. Active boards hide archived content by default so the working view stays
focused.

Use comments as durable memory. Humans and agents can leave progress notes,
blockers, decisions, and handoff context on a task. Activity entries preserve
important state changes such as task creation, updates, movement, completion,
archival, and new comments.

Agents can use the API or the wrapper script in
`skills/tasks-management/scripts/taskboards` to orient themselves before doing
work:

```sh
skills/tasks-management/scripts/taskboards health
skills/tasks-management/scripts/taskboards get projects repositoryPath="$PWD"
skills/tasks-management/scripts/taskboards get projects/<projectId>/boards
skills/tasks-management/scripts/taskboards context <taskId>
skills/tasks-management/scripts/taskboards move <taskId> in_progress
skills/tasks-management/scripts/taskboards comment <taskId> --body-file /tmp/taskboards-note.md
```

Use file-backed writes for generated markdown, multiline comments, and long
task descriptions. Short inline comments are supported, but agents should use
`--body-file FILE`, `--field-file description=FILE`, or full JSON via
`--data FILE` when text contains quotes, backticks, braces, or newlines.

Search before creating new tasks so agents can update existing work instead of
duplicating it:

```sh
skills/tasks-management/scripts/taskboards get search q="sqlite migration blocker" limit=10
```

## API Orientation

The JSON API is mounted under `/api`.

Useful starting points:

- `GET /api/health`: check API and database status.
- `GET /api/projects`: list active projects.
- `POST /api/projects`: create a project.
- `GET /api/projects/:projectId/boards`: list boards for a project.
- `POST /api/projects/:projectId/boards`: create a board.
- `GET /api/projects/:projectId/boards/:boardId?includeTasks=true`: read a
  board with tasks.
- `POST /api/projects/:projectId/boards/:boardId/tasks`: create a task.
- `POST /api/tasks/:taskId/move`: move a task to another column.
- `POST /api/tasks/:taskId/comments`: append a task comment.
- `GET /api/tasks/:taskId/context`: fetch task, comments, activity, and parent
  board context.
- `POST /api/search`: run local semantic search over indexed board, task, and
  comment content.

See [docs/api.md](docs/api.md) for the full API contract.

## Documentation

- [docs/taskboards.md](docs/taskboards.md): product goals and workflows.
- [docs/tasks-and-boards.md](docs/tasks-and-boards.md): domain model.
- [docs/api.md](docs/api.md): JSON API structure.
- [docs/agent-api.md](docs/agent-api.md): markdown-first agent API design.
- [docs/ui.md](docs/ui.md): UI architecture and principles.
- [docs/text-embedding.md](docs/text-embedding.md): local embeddings and vector
  search.
- [docs/maintenance.md](docs/maintenance.md): archival, cleanup, and reindexing.

## Tech Stack

- React 19 and Vite for the UI.
- Express 4 for the API server.
- TypeScript across API and UI code.
- Drizzle ORM and SQLite for storage.
- `node-llama-cpp` and `sqlite-vec` for local semantic search.
- Docker Compose for normal local operation.
