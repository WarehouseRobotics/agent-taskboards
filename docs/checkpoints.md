# Board Checkpoints

Board checkpoints, also called revisions, are manually saved snapshots of one
board's task state. They let a human or trusted local agent return a board to a
known state after exploratory work, bulk edits, imports, or agent sessions.

Checkpoints are per board, not per project. A checkpoint can be saved, listed,
read, restored, and deleted through the regular JSON API and through the
agentic API.

## Goals

- Capture a complete board revision that can be restored later.
- Preserve durable object IDs so existing agent notes, scripts, and references
  remain valid after restore.
- Restore the board in one transaction so callers never observe a partially
  restored graph.
- Keep checkpoint operations explicit and manual in v1.
- Expose the same capability to humans in board settings and to agents through
  deterministic API calls.

## Snapshot Scope

A board checkpoint stores canonical board state, including active and archived
records.

Included in a checkpoint:

- board metadata that belongs to the board itself
- workflow columns, including IDs, keys, names, positions, and `isDone`
- all tasks on the board, including active, completed, and archived tasks
- task comments
- task activity entries
- task attachment records

Attachment records are included, but uploaded file payloads are not embedded in
the checkpoint. Restore must preserve uploaded files on disk so checkpointed
attachment records can reuse any referenced files that still exist under
`/uploads`; missing files are reported as restore warnings.

Excluded from a checkpoint:

- other boards in the project
- project-level fields
- other checkpoints for the board
- search documents and embedding vectors
- temporary files, caches, generated intermediates, and other derived data

Search data is derived state. Saving a checkpoint does not snapshot search
documents or vectors. Restoring a checkpoint should remove, rebuild, or mark
stale the affected board's search documents so later search results match the
restored board state.

## Data Model

The storage model should include a `board_checkpoints` concept.

Checkpoint fields:

- `id`: durable checkpoint ID
- `projectId`: parent project ID
- `boardId`: parent board ID
- `name`: human-readable checkpoint name
- `description`: optional longer note
- `snapshotVersion`: version number for the snapshot JSON shape
- `snapshot`: JSON payload containing the captured board graph
- `summary`: JSON count summary for list views
- `creatorType`: `human`, `agent`, or `system`
- `creatorName`: optional creator display name
- `creatorRef`: optional local agent/session reference
- `metadata`: open-ended JSON object
- `createdAt`: creation timestamp

The checkpoint row belongs to one board. It is not part of the board state that
is restored, so restoring an older checkpoint must not delete newer
checkpoints.

`summary` should include counts useful for list views, such as columns, tasks,
archived tasks, comments, activity entries, and attachment records.

## Snapshot Shape

The snapshot should be self-contained enough to restore the board without
querying current task, comment, activity, or column rows.

At minimum, the snapshot payload stores:

- board fields restored by checkpoint restore
- ordered columns
- tasks with their column references and ordering
- comments grouped by task or carrying parent IDs
- activity entries grouped by task or carrying parent IDs
- attachment records grouped by task or carrying parent IDs

Snapshots must include original object IDs. Implementations may choose the
exact JSON nesting, but the restore path must validate that every child record
belongs to the checkpoint's `projectId` and `boardId`, and that task-adjacent
records reference tasks present in the snapshot.

Duplicate IDs inside a single snapshot are invalid checkpoint data and should
fail restore with `invalid_state`.

## Save Semantics

Saving a checkpoint captures the current persisted state for one board.

Request inputs:

- `name`: optional; when omitted, the server may generate a timestamp-based
  default name
- `description`: optional
- `creatorType`: optional, defaulting to `human` for the JSON API and `agent`
  for agentic helpers when agent identity is supplied
- `creatorName`: optional
- `creatorRef`: optional
- `metadata`: optional JSON object

Save should include archived tasks and their comments, activity, and attachment
records. Save should not mutate the board, tasks, comments, activity, or search
documents.

## Restore Semantics

Restoring a checkpoint replaces the checkpointed state of the target board in
one database transaction.

Restore replaces:

- board metadata included in the snapshot
- workflow columns
- tasks
- task comments
- task activity entries
- task attachment records whose files still exist

Restore does not replace:

- the project row
- other boards
- checkpoint rows
- uploaded files on disk, including files referenced by current board data being
  replaced
- search vectors as durable source data

Restoring must not append task activity entries. The restored activity table for
the board should exactly match the checkpoint snapshot, aside from documented ID
remapping caused by collisions.

Restores are same-board only in v1. A checkpoint can be restored only to the
board that owns it.

## ID Preservation And Collisions

Checkpoint restore preserves original IDs by default. This is important because
agents and scripts may cite task, comment, activity, column, and attachment IDs
outside the app.

An ID collision exists only when the snapshot wants to restore an ID that is
already used by unrelated existing data outside the target board data being
replaced. Existing rows inside the target board are not collisions because they
are part of the graph being replaced.

Collision behavior:

- preserve the snapshot ID when there is no unrelated collision
- generate a new ID for the colliding object when an unrelated row already uses
  that ID
- remap all dependent references in the restored graph
- include the remapping in the restore response

The restore response should make collisions visible. A restore that remaps IDs
is successful, but callers need the mapping to update any external notes or
scripts they control.

## Attachment Records

Checkpoints include task attachment records and preserve their IDs when
possible. They do not include uploaded file bytes.

On restore:

- current attachment records may be deleted or replaced as part of replacing the
  board state
- uploaded files under `/uploads` must be preserved, including files no longer
  referenced after restore
- if the attachment's `relativePath` still exists under `/uploads`, recreate the
  attachment record
- if the file is missing, skip the attachment record and include a warning
  instead of creating an empty or broken attachment placeholder

Attachment warnings should include enough detail for a human or agent to
understand which record could not be restored.

## JSON API

The regular API returns JSON and uses the same error envelope documented in
`docs/api.md`.

### `GET /api/projects/:projectId/boards/:boardId/checkpoints`

Lists checkpoints for a board, newest first.

Response:

```json
{
  "checkpoints": []
}
```

List responses include checkpoint metadata and summaries, but may omit the full
`snapshot` payload.

### `POST /api/projects/:projectId/boards/:boardId/checkpoints`

Creates a checkpoint for the board.

Request:

```json
{
  "name": "Before agent refactor",
  "description": "Saved before moving the API task batch.",
  "creatorType": "human",
  "creatorName": "Denis",
  "creatorRef": null,
  "metadata": {}
}
```

Response status: `201`

Response:

```json
{
  "checkpoint": {}
}
```

### `GET /api/projects/:projectId/boards/:boardId/checkpoints/:checkpointId`

Reads one checkpoint, including its snapshot.

### `POST /api/projects/:projectId/boards/:boardId/checkpoints/:checkpointId/restore`

Restores one checkpoint to its owning board.

Response:

```json
{
  "checkpoint": {},
  "board": {},
  "warnings": [],
  "idMappings": {}
}
```

`warnings` reports skipped attachment records and other non-fatal restore
details. `idMappings` reports any object IDs changed because of actual
collisions.

### `DELETE /api/projects/:projectId/boards/:boardId/checkpoints/:checkpointId`

Deletes one checkpoint row. This does not modify the board, tasks, comments,
activity, attachment records, uploaded files, or other checkpoints.

## Agentic API

The agentic API mirrors checkpoint operations under `/api/agents`:

- `GET /api/agents/projects/:projectId/boards/:boardId/checkpoints`
- `POST /api/agents/projects/:projectId/boards/:boardId/checkpoints`
- `GET /api/agents/projects/:projectId/boards/:boardId/checkpoints/:checkpointId`
- `POST /api/agents/projects/:projectId/boards/:boardId/checkpoints/:checkpointId/restore`
- `DELETE /api/agents/projects/:projectId/boards/:boardId/checkpoints/:checkpointId`

As with existing agentic board routes, `:projectId` and `:boardId` may be either
durable IDs or slug names when resolution is unambiguous.

Agentic responses should:

- summarize what was saved, restored, listed, or deleted
- keep project, board, and checkpoint IDs visible
- show checkpoint summary counts
- show restore warnings and ID mappings prominently
- include exact next calls for reading the restored board or checkpoint list

## UI Behavior

Checkpoint management lives in the board settings surface. It should not live
in project settings because checkpoints are scoped to one board.

Board settings should support:

- listing checkpoints with name, created time, creator, and summary counts
- creating a checkpoint with name and optional description
- restoring a checkpoint
- deleting a checkpoint

Restoring is destructive to current board state. The UI must require explicit
confirmation that the restore will replace the board's columns, tasks, comments,
activity, and attachment records with the checkpointed state.

After a successful restore, the UI should refresh:

- the project tree and task counts
- the active board
- any open task detail state
- search-derived or cached board state

Missing attachment warnings and ID remapping notices should be shown calmly in
the restore result so users understand what changed.

## Error Handling

Checkpoint endpoints use existing API error codes:

- `invalid_request`: invalid request body, bad metadata, or unsupported
  parameters
- `not_found`: project, board, or checkpoint does not exist in the requested
  relationship
- `invalid_state`: snapshot is corrupt, references missing objects, has
  duplicate IDs, or cannot be restored consistently
- `internal_error`: unexpected server failure

Restore validation should fail before mutating data when the snapshot is
structurally invalid.

## Out Of Scope For V1

- automatic or scheduled checkpoints
- retention policies
- checkpoint diffs
- partial restores
- cross-board or cross-project checkpoint copy
- storing uploaded file bytes inside checkpoints
- restoring search vectors directly from snapshots

## Implementation Test Scenarios

Future implementation tests should cover:

- creating, listing, reading, deleting, and restoring checkpoints
- preserving IDs for columns, tasks, comments, activity, and attachment records
- restoring active and archived tasks
- restoring comments and activity exactly without appending restore activity
- replacing current board data in one transaction
- remapping IDs only for actual unrelated collisions
- rejecting duplicate IDs inside a snapshot
- warning about missing attachment files
- leaving other checkpoints for the board intact
- invalidating or rebuilding derived search documents after restore
