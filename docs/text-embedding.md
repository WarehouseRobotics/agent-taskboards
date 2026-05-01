# Text Embeddings and Semantic Search

Agent Taskboards will use local text embeddings to make projects, boards, tasks,
and comments searchable as long-term memory for coding agents. The goal is to
let agents retrieve useful local context without sending task data to a hosted
embedding service.

## Planned Stack

The planned v1 embedding stack is:

- `node-llama-cpp` for loading and running a local GGUF embedding model
- `models-gguf/bge-small-en-v1.5-f32.gguf` as the bundled embedding model
- SQLite for source-of-truth task data
- `sqlite-vec` for vector storage and nearest-neighbor search

This design keeps task data and embeddings on the developer's machine.

## Indexed Content

The embedding index should cover content that helps humans and agents recover
project context:

- project names and descriptions
- board names and descriptions
- task titles and descriptions
- task comments
- important activity summaries when they contain useful semantic context

Each indexed chunk should store enough metadata to trace a search result back to
the canonical object: object type, object ID, project ID, board ID when
applicable, task ID when applicable, and timestamps.

## Search Behavior

Semantic search should be exposed through the API as a retrieval primitive for
agents. A typical agent should be able to ask for related tasks or comments
before starting work, after encountering a blocker, or during handoff.

Search should support:

- global queries across active content
- scoped queries within a project or board
- optional inclusion of archived content
- result limits
- compact snippets that explain why a result matched

Search results should be useful without requiring a second query, but they
should also include stable IDs so agents can fetch full canonical records.

## Index Lifecycle

Embeddings should be created or refreshed when indexed text changes. The API and
UI should also expose maintenance operations for reindexing when needed.

Expected lifecycle events:

- create embeddings when projects, boards, tasks, or comments are created
- update embeddings when indexed text changes
- preserve or mark embeddings for archived content depending on search filters
- support full reindexing as a maintenance action

## Privacy and Limits

Embedding search is local-first. It should not require network calls during
normal operation. The app should favor predictable resource use over aggressive
background processing, because the expected environment is a developer laptop or
workstation running Docker.

The embedding system is a memory aid, not the source of truth. SQLite records
remain canonical; vector rows are derived data that can be rebuilt.
