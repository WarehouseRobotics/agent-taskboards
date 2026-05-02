# Maintenance

Agent Taskboards should stay lean and reliable on a developer's machine. Because
the app is local and single-user, maintenance can be explicit and understandable
instead of hidden behind hosted infrastructure.

## Maintenance Goals

Maintenance features should help humans and trusted local agents:

- keep active boards focused
- archive old projects, boards, and tasks
- purge old archived data when deliberately requested
- rebuild derived embedding data
- inspect basic storage and index health

SQLite records are the source of truth. Embedding vectors and search indexes are
derived data that can be rebuilt.

## Runtime Directories

The app uses repo-root bind mounts for local runtime state:

- `data/`: durable database storage, mapped to `/data` in Docker. The default
  SQLite file is `data/taskboards.sqlite` on the host and
  `/data/taskboards.sqlite` in the container.
- `uploads/`: durable uploaded or imported files, mapped to `/uploads`.
- `tmp/`: temporary scratch space, mapped to `/tmp/taskboards`.

`data/` and `uploads/` should survive normal container restarts. `tmp/` is for
files that can be regenerated or safely cleaned up. Maintenance tooling may
purge stale files from `tmp/`, but should not delete durable uploads or database
files without an explicit destructive action.

## Archival

Archive should be the default cleanup path. Archived projects, boards, and tasks
should disappear from active views unless the user asks to include them.

Archived data remains useful for semantic search and historical context, so hard
deletion should be treated as a deliberate maintenance action.

## Purging

Purge operations permanently remove old archived data. They should be available
through both API and UI maintenance tools, but require explicit confirmation.

Purge tools should report what they are about to remove and what they removed,
including counts for projects, boards, tasks, comments, activity entries, and
derived embedding rows when relevant.

## Reindexing

Embedding reindexing should be safe to run when vectors are missing, stale, or
created with a changed model. Reindexing may target:

- all content
- a project
- a board
- a task and its comments

Reindexing should rebuild derived vector data from canonical SQLite records. It
should not mutate task content.

The current developer script force-rebuilds all board, task, and comment
embeddings:

```sh
docker compose exec taskboards npm run embeddings:reindex
```

## Health Checks

Maintenance status should include simple health information:

- database availability
- embedding model availability
- vector index status
- counts of active and archived objects
- last successful reindex time when available

These checks should be exposed in a form that both humans and agents can use.
