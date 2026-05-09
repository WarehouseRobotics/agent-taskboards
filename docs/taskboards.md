# Agent Taskboards Product Spec

Agent Taskboards is a local-first, single-user Kanban task board app for
developers who manage coding work across multiple projects. Its primary job is
to make agentic AI coding workflows easier to coordinate: projects have boards,
boards have tasks, and both humans and coding agents can use the same task data
through a UI and a deterministic API.

The current codebase includes a starter implementation for the project, board,
task, comment, and activity API. The docs in this directory describe the
implemented starter surface and intended v1 behavior for areas that are still
planned.

## Core Idea

The app is management infrastructure for local development work. A developer
runs it on their machine, creates projects for repositories or workstreams, and
uses boards to organize tasks by state. Human users can manage the work visually
in the React UI. Coding agents such as Codex and Claude Code can manage the same
work through an API designed for shell scripts and agent tool calls.

The product has two main differentiators:

- an agent-friendly API for creating, moving, updating, querying, and annotating
  work items without brittle UI automation
- local text embedding search over boards, tasks, and comments, so agents can
  retrieve useful project memory without sending private task context to a
  hosted service

## Audience

The primary user is a developer running local coding agents against one or more
software projects. They need a lightweight way to keep task state visible,
durable, searchable, and accessible to both humans and agents.

Secondary users are the agents themselves. The API should treat agents as first
class clients: predictable JSON, durable IDs, explicit state transitions, and
clear error responses matter more than broad multi-user workflow features.

## Product Model

The main hierarchy is:

```text
project -> board -> task -> comments/activity
```

- Projects represent repositories, products, or workstreams.
- Boards organize tasks for a project. A project may have multiple boards for
  different scopes such as backlog, active sprint, bug triage, or release work.
- Boards can have manually saved checkpoints, also called revisions, that
  snapshot and restore complete board task state. See `docs/checkpoints.md`.
- Tasks are the primary unit of work. They have titles, descriptions, state,
  ordering, optional metadata, and durable identifiers.
- Comments and activity provide append-only context for task decisions, agent
  notes, handoffs, and status updates.

Columns represent workflow state on a board. The exact default columns can
evolve, but the model should support common Kanban states such as backlog,
ready, in progress, blocked, review, and done.

## Human Workflow

The UI is a human control surface for the same data exposed by the API. It
should make it easy to:

- switch between projects and boards
- scan task state across columns
- create, update, move, archive, and search tasks
- inspect comments and activity to understand recent work
- run maintenance actions such as cleanup and embedding reindexing

The UI should be dense, calm, and work-focused. This is an operational tool, not
a marketing site.

## Agent Workflow

Coding agents should be able to use Agent Taskboards as durable shared memory
for a local development session. The planned workflow is:

- query projects and boards to determine scope
- find relevant tasks by ID, status, text search, or embedding search
- create tasks when discovering new work
- move tasks through explicit workflow states
- append comments for progress, blockers, decisions, and handoffs
- search historical task and comment context before acting

The project also plans to include agent skills and a bash control script that
teach agents how to call the API consistently. Those skills should wrap the API
without hiding the core semantics.

## Local-First Principles

Agent Taskboards is intentionally single-user and local:

- runs in Docker on the developer's machine
- stores task data in SQLite
- uses local text embeddings through `node-llama-cpp`
- stores and queries vectors with `sqlite-vec`
- ships with a local GGUF embedding model at
  `models-gguf/bge-small-en-v1.5-f32.gguf`

The app is not trying to be a hosted team project-management system. Privacy,
low operational overhead, and reliable local agent access are more important
than accounts, permissions, or collaboration features.

## Runtime Shape

The project has two runtime components:

- `api/`: Express API server. In production it also serves the built UI from
  `dist/ui`.
- `ui/`: Vite + React frontend. In debug mode Vite serves the UI and proxies
  `/api` requests to the Express server.

Normal project operations should run through Docker. Dependency installation is
intended to happen inside the container, not on the host machine.

## Runtime Directories

Docker Compose maps host-visible runtime folders from the repository root into
the container:

- `data/` maps to `/data` and stores durable local application data. The default
  SQLite database path is `/data/taskboards.sqlite`.
- `uploads/` maps to `/uploads` and stores durable uploaded, imported, or
  agent-provided files associated with taskboard workflows.
- `tmp/` maps to `/tmp/taskboards` and stores temporary scratch files, staging
  output, and generated intermediates that can be discarded.

Only the directory placeholders are meant to be tracked in git. Runtime contents
should stay local and ignored.

## Supporting Docs

- `docs/tasks-and-boards.md`: domain model and ownership rules
- `docs/checkpoints.md`: board checkpoint and restore semantics
- `docs/api.md`: implemented starter API contract and planned API areas
- `docs/agent-api.md`: planned markdown-first API contract for coding agents
- `docs/data.md`: storage, timestamps, JSON fields, and low-level data details
- `docs/text-embedding.md`: local embedding and semantic search design
- `docs/ui.md`: UI architecture and user experience principles
- `docs/design.md`: visual and interaction design rules
- `docs/maintenance.md`: cleanup, archival, and reindexing expectations
- `docs/skills/tasks-management/SKILL.md`: planned agent skill behavior
