# Prompt Library

The prompt library stores reusable prompt texts that humans copy into coding
agent sessions. It is managed in the UI under the sidebar `Prompts` entry and
surfaced next to the task detail through the prompt picker.

## Data Model

Prompts and categories are global: they live outside the project/board
hierarchy, and one library is shared across all projects.

- `prompt_categories`: flat list of categories (no nesting). Names are unique
  and may contain emoji. Categories carry a `position` for ordering and an
  optional `default_key` marking seeded defaults.
- `prompts`: prompt `name` (emoji allowed), `body`, `position`, usage counters
  (`usage_count`, `last_used_at`), and an optional `default_key`.
- `prompt_category_links`: many-to-many links between prompts and categories.
  A prompt with no links is "root level" (uncategorized).

Deletion is hard deletion behind a confirmation dialog; prompts are not
archivable. Deleting a category removes only the category and its links —
prompts survive and fall back to the root level.

Prompts are not indexed into `search_documents`, so they do not appear in
semantic search.

## Ordering

Prompts carry a single global order in `prompts.position`. A category view is
only a projection of that order, so a prompt linked to two categories keeps
the same relative order in both, and dragging it inside one category rewrites
the one list. Categories have their own order in `prompt_categories.position`,
which drives the library's left rail and the picker's groups.

`prompt_category_links.position` is unrelated to either: it orders the
categories *within* a prompt, and reordering never touches it.

Both orders are edited through the reorder endpoints in `docs/api.md`, which
rewrite the affected list as `0..n-1`. The picker's `Recent` group is sorted by
`lastUsedAt` rather than by position, so it is never reorderable, and a
reorder never counts as a use.

## Tokens

Prompt bodies may contain case-sensitive tokens that the prompt picker
replaces when copying:

- `{{TASK}}`: the open task, formatted as `"...title..." ( id=... )`
- `{{PARENT_TASK}}`: the task's parent/umbrella task in the same format

A token that cannot be resolved never blocks the copy and produces no
warning: the braces are stripped, so `{{PARENT_TASK}}` copies as
`PARENT_TASK` and is easy to spot and replace by hand. Unknown `{{...}}`
sequences are left untouched.

### Parent Task Resolution

`{{PARENT_TASK}}` resolves through a heuristic cascade with no task schema
change:

1. A parent id in the task's metadata: `parentTaskId` first, then the older
   `parentTask`, `umbrellaTaskId`, and `umbrella` keys. The value must be a
   bare task id; a title or flag falls through to the next step.
2. The first description line that starts with a parent label:
   `Umbrella task:`, `Umbrella:`, `Parent task:`, or `Parent:`. Labels are
   case-insensitive and may be preceded by markdown list, quote, or bold
   decoration, but not by prose — `part of the umbrella: x` does not match.
   An `id=...` reference on the label line wins; otherwise the rest of the
   line must be a bare task id of at most 96 characters, after stripping
   surrounding backticks, quotes, and brackets and trailing `.,;:`. A label
   followed by a title or a sentence falls through to the next step.
3. The first description line that mentions "umbrella" (case-insensitive) and
   contains an `id=...` reference.
4. The first `id=...` reference anywhere in the description.
5. Otherwise unresolved.

Self references are skipped. If the parent id resolves but the task cannot be
fetched, the token renders as `( id=<id> )` so the pasted prompt is still
actionable.

## Default Prompts

The `0006_prompt_library.sql` migration seeds a default category
`☂️ Umbrella` with three prompts, keyed by stable `default_key` values:

- `umbrella-implement` — ☂️ Umbrella Task Implement
- `umbrella-code-review` — ☂️ Umbrella Task Code Review
- `address-review-findings` — Address Code Review Findings

The seed values mirror `api/models/default-prompts.ts`, which also backs the
`Restore defaults` action (`POST /api/prompts/restore-defaults`). Restore
re-creates only rows whose `default_key` is missing, so it is idempotent and
never overwrites edited defaults. If a user-created category already owns the
default category name, restored prompts are linked to it instead.

## Prompt Picker

The prompt picker opens from a toggle in the task detail header and extends
as a nested sidebar on the task detail's left. It shows:

- a filter input over prompt names and bodies
- a `Recent` group with the most recently used prompts for one-click copying
- prompts grouped by category, with root-level prompts last

Clicking a prompt row copies the rendered body (tokens replaced) to the
clipboard, records usage through `POST /api/prompts/:promptId/use`, and blinks
a confirmation. A row can be expanded to preview the exact rendered text
before copying.

One prompt can be rendered as several rows at once: in `Recent` and again in
each category it is linked to. Row state is keyed per row, so expanding a
preview or blinking the copy confirmation affects only the row that was
clicked, not its twins elsewhere in the picker.

## API

See the Prompt Library section in `docs/api.md` for the REST endpoints. The
markdown-first agent API (`/api/agents/prompts`) is deferred to a follow-up
task.
