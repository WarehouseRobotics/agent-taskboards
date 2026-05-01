# Tasks, Boards, Projects, and Other Objects

This document defines the domain model for Agent Taskboards. The main product
spec is `docs/taskboards.md`; this file expands the object relationships and
state semantics.

## Ownership Model

The app is single-user and local. There are no accounts, teams, tenants, or
permission boundaries in the v1 model. The ownership hierarchy is:

```text
project -> board -> task -> comments/activity
```

A project owns boards. A board owns tasks. A task owns its comments and activity
entries.

## Projects

A project represents a repository, product, customer workstream, or other
developer-owned scope. Projects are the top-level unit that agents use to avoid
mixing context across unrelated work.

Projects should have:

- a durable ID
- a human-readable name
- an optional description
- optional local metadata such as repository path or default branch
- timestamps for creation and last update
- an archived state instead of hard deletion by default

## Boards

A board organizes tasks for one project. A project may have several boards when
the user wants separate views for different efforts, such as a backlog, release
plan, bug queue, or active agent work session.

Boards should have:

- a durable ID
- a parent project ID
- a name and optional description
- an ordered set of workflow columns
- timestamps for creation and last update
- an archived state

Columns represent workflow state. The app should support common Kanban states
such as backlog, ready, in progress, blocked, review, and done, while allowing
future customization.

## Tasks

Tasks are the primary unit of work. They should be small enough for a human or
coding agent to reason about and update, but flexible enough to carry the
context needed for implementation.

Tasks should have:

- a durable ID
- parent project and board IDs
- a title and optional description
- a column or status
- an order within the column
- optional priority, labels, and external references
- timestamps for creation, last update, and completion when applicable
- an archived state

Moving a task is an explicit state transition. API clients should not need to
infer movement by rewriting a whole board.

## Comments and Activity

Comments and activity provide task history. They are especially important for
agent workflows because they preserve decisions, partial progress, blockers,
handoffs, and useful memory.

Comments are user- or agent-authored notes. Activity entries are structured
events produced by the system when tasks are created, moved, updated, archived,
or completed.

The v1 docs should treat comments and activity as append-oriented. Existing
entries should remain stable so agents can cite and search historical context.

## Archival and Deletion

Archive should be the default way to remove projects, boards, and tasks from
active views. Hard deletion can exist as a maintenance operation, but it should
be deliberate because old task context may still be useful for semantic search
and agent memory.

Archived objects should be excluded from normal active views unless explicitly
requested.
