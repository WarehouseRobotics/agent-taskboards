# UI Architecture and Principles

The React UI is the human control surface for Agent Taskboards. It should expose
the same core project, board, task, comment, search, and maintenance operations
that agents can perform through the API.

The current UI is a starter shell. This document describes the intended v1 UI
behavior.

## Primary Screens

The v1 UI should prioritize operational workflows:

- project switcher for selecting the current local work scope
- board list for a project
- Kanban board view with columns and ordered tasks
- task detail panel or route with description, metadata, comments, and activity
- project activity view for recent changes and comments across one or more
  projects
- search view for text and semantic search across tasks and comments
- maintenance view for reindexing, cleanup, and storage health

The first screen should be the working app, not a marketing landing page.

Browser document titles should reflect the current work context rather than a
static app name. Board routes use `{project name} / {board name}`. Task routes
use `{board name} / {task title}`. Other routes may fall back to
`Agent Taskboards` unless they have a similarly useful contextual title.

Project and board name forms should show the URL-safe naming rule while the
user types. Creating or renaming a project or board should make invalid
characters visually obvious before submit, using the same rule enforced by the
API: lowercase letters, numbers, underscores, and hyphens only.

## Board Experience

The board view should make task state easy to scan and change:

- columns represent workflow states
- tasks can be created, edited, moved, archived, and completed
- task checkboxes support range selection, group dragging, and immediate bulk archival from the board toolbar
- task cards show compact, high-signal information
- blocked or review states should be visually obvious
- archived content should stay out of active board views by default

The UI should keep movement semantics aligned with the API. Moving a card in the
UI should map to the same explicit task move operation that agents use.

Task creation should be quick and local to the board context. A column-level
`New task` affordance opens an inline form in that column with the minimum useful
fields: title, optional description, labels, and priority. Focus states inside
the form must render fully inside the column scroller so keyboard users can see
the active field without clipped outlines.

## Task Detail Experience

Task detail should preserve enough context for humans and agents to coordinate:

- title, description, status, priority, labels, and references
- attachments, with image attachments shown as compact thumbnails
- comments for progress notes and handoffs
- activity entries for important state changes
- stable task ID visible enough for API or script usage
- open-ended task metadata, shown read-only in its own Metadata section
- related search results when useful

The task detail surface is an editing workspace, not just a read-only property
rail. When a task is open from the board, the detail sidebar should become wide
enough for focused task work while still preserving board context. The task
title and description are editable in place, saved explicitly with a Save action
or Cmd/Ctrl+Enter, and cancellable before save. Blank titles should be rejected
near the field. Successful edits should produce calm in-app feedback and refresh
the board card and task context from the API.

Attachments are listed in the task detail panel with filename, size, and a link
to the stored upload. Attachments whose `contentType` starts with `image/`
should render a small thumbnail from the original uploaded file URL; no separate
thumbnail-generation flow is required for v1.

Task metadata is agent-authored and open-ended, so it gets its own Metadata
section below Properties rather than sharing that grid: its keys are verbatim
identifiers, not the uppercase prose micro-labels the built-in property rows
use. The section renders whatever keys a task carries, in the order they were
written and under their exact key names, and is absent entirely when a task has
no metadata. Values that name another task resolve to that task's title and
link to it; an id that cannot be resolved stays visible as plain text. Lists render one value per entry and nested objects collapse behind a
disclosure. Metadata is read-only in the UI: it is written through the API.

Comments should be treated as durable task memory, not disposable chat.

## Activity Experience

The Activity view shows a merged chronological stream of task changes and
comments. It defaults to all active projects, newest first, and lets users
filter down to one or more projects. Board headers should link to the same view
with the current project selected.

Activity rows stay dense: task-change events are single-line summaries with
event type and parent context, while comments show compact inline previews so
handoffs and decisions can be scanned without opening every task. Opening a row
navigates to the task detail route.

## Search Experience

Search should support both human recall and agent memory inspection:

- text search for exact titles, IDs, labels, and keywords
- semantic search for related work and prior decisions
- filters for project, board, active content, and archived content
- result cards that clearly show object type and parent context

Search results should link directly to the relevant project, board, task, or
comment context.

## Prompt Library Experience

The prompt library manages reusable prompt texts for agent sessions. It opens
from the sidebar `Prompts` entry, between Search and Maintenance:

- a left rail lists All prompts, Uncategorized, and each category with counts
- the middle list shows prompts for the current filter with usage metadata
- the right editor pane edits name, note, body, and category membership in
  place; the author's note shows as static text and becomes editable on click
- editor changes save explicitly with Save or Cmd/Ctrl+Enter from any field;
  the shortcut also submits the new-category and rename-category forms
- toolbar actions cover new prompt, new category, and restore defaults
- prompts and rail categories reorder by dragging, with a drop indicator on the
  side the dragged row will land on; `Alt+Up`/`Alt+Down` on a focused row is the
  pointer-free equivalent, stepping one visible row at a time
- deletes are hard deletes behind explicit confirmation dialogs

Prompt names are user-authored data and may contain emoji; the chrome around
them stays glyph-free.

## Prompt Picker Experience

The prompt picker brings the library to the task detail:

- it opens from a toggle in the task detail header and extends as a nested
  sidebar on the task detail's left, attached rather than floating
- the initial state leads with recently used prompts for one-click copying
- one click copies the prompt body with `{{TASK}}`, `{{PARENT_TASK}}`,
  `{{BOARD}}` and `{{PROJECT}}` tokens rendered from the open task and its
  board context; a row expands to preview the exact text
- an expanded row shows the author's note after the preview; the note is never
  copied
- unresolved tokens copy as their bare names and never block the copy
- prompts in a category group reorder by dragging, writing the same global
  order the library view shows; `Recent` is usage-sorted and never draggable,
  and dragging is suppressed while the filter hides rows

## Maintenance Experience

Maintenance tools should be visible but calm. The UI should support:

- viewing storage and embedding index health
- triggering embedding reindexing
- reviewing archived data
- purging old archived data through deliberate actions

Potentially destructive actions should be clearly labeled and require explicit
confirmation in the UI.
