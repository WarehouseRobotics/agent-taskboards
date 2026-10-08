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
- dragging a card, or a selection within one column, onto another card in the
  same column reorders it into that card's slot: after it when dragging down,
  before it when dragging up; dropping on the column background moves it to the
  end. A non-contiguous selection gathers into one block in its current order.
  Same-column reordering applies only under the `Position` sort, because other
  sorts do not show the stored order
- task cards show compact, high-signal information
- blocked or review states should be visually obvious
- archived content should stay out of active board views by default
- a `Tags` filter in the board sub-toolbar, the same type-ahead tag field as
  in search, narrows both the board and list modes to cards carrying the
  picked tags, matching all of them or any of
  them (the All/Any toggle appears once two tags are picked). The summary then
  reads `N of M tasks`. Hovering or focusing a tag chip on a card or list row
  reveals a small filter icon; clicking it adds that tag to the filter. A click
  on the chip itself opens the task like the rest of the card, so a slightly
  off-target click never narrows the board. Touch devices show the icon
  permanently. The filter lives in memory for the
  current board and resets when switching boards. Hidden cards keep their
  stored positions: drops are still planned against the full column
- while a task detail is open and the window is narrower than 1910px, the
  board sub-toolbar hides the `Tags` filter and `Sort` controls to make room;
  an active filter and sort keep applying, and the summary still reads
  `N of M tasks`

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
The shared comments and activity timeline defaults to oldest first and offers a
locally persisted toggle for switching the entire timeline to newest first.

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
- filters for project, board, tags, active content, and archived content
- result cards that clearly show object type and parent context

Search results should link directly to the relevant project, board, task, or
comment context.

The sidebar search box (`/` focuses it) shows the top five results in a
popover. When the URL names a project (a board or project page, an activity
feed filtered to one project, or a search page with a project filter), the
search covers only that project, and a row at the top of the popover says
`In <project>` with an `All projects` toggle. Widening lasts until the popover
closes; the next search starts scoped again. On other pages the sidebar
searches all projects and shows no scope row. A query shaped like a task ID,
or its trailing part such as `to-90rvs4`, always searches all projects so a
pasted ID opens its task wherever it lives. Pressing Enter or
`View all results` opens the search view with the same project selected. The
search view's project filter lives in the URL as `projectId`
(`/search?q=…&projectId=…`).

The `Tags` filter is a type-ahead field over the labels in use
(`GET /api/labels`, scoped to the selected project). Typing suggests matching
tags, prefix matches first, with their task counts. Enter or a click adds the
highlighted tag as a chip inside the field with an `x` to remove it, and
Backspace in an empty field removes the last chip. While text is typed and
suggestions are open, Tab completes: a single suggestion is added, and several
suggestions are cycled (Shift+Tab goes back); otherwise Tab moves focus as
usual. An All/Any match toggle
appears once two tags are picked. Tags alone, with an
empty text box, list the tagged tasks newest-updated first, with no relevance
score. Tags together with text keep only tasks carrying the tags and comments
on those tasks; boards drop out. The text, tags, and match mode live in the URL
(`/search?q=…&tag=a&tag=b&match=any`). Clicking a tag chip in a task's
Properties section opens this view filtered to that tag.

## Prompt Library Experience

The prompt library manages reusable prompt texts for agent sessions. It opens
from the sidebar `Prompts` entry, between Search and Maintenance:

- a wrapping row of library pills sits under the topbar, one per library in
  position order with the selected one highlighted; it wraps at narrow widths
  rather than scrolling, and a trailing `+` pill turns into an inline name
  input (Enter creates and selects the library, Escape or blur cancels);
  because creating selects, the `+` pill obeys the unsaved-changes rule below
- the selected pill scopes everything below it: the rail's categories and
  counts, the All prompts and Uncategorized filters, the prompt list, the
  editor's category checkboxes, drag reorder, and where New prompt and New
  category land; selecting a pill resets the filter to All prompts and closes
  the open draft, blocked by the same unsaved-changes rule as switching prompts
- double-click or F2 on a non-Default pill swaps it for an inline rename input
  (Enter saves, Escape or blur cancels); the Default pill ignores both and its
  tooltip says it is fixed
- non-Default pills carry an `x` that opens a confirmation naming the library
  and the number of saved prompts and categories that go with it; on the
  selected pill it obeys the unsaved-changes rule, since the open draft would
  go with the library uncounted; after the delete the selection moves to
  Default with the same reset as selecting a pill
- the selected library is remembered in the browser under
  `taskboards.prompts.libraryId` and falls back to Default when the stored id
  no longer exists
- a left rail lists All prompts, Uncategorized, and each category with counts
- the middle list shows prompts for the current filter with usage metadata
- the right editor pane edits name, note, body, and category membership in
  place; the author's note shows as static text and becomes editable on click
- editor changes save explicitly with Save or Cmd/Ctrl+Enter from any field;
  the shortcut also submits the new-category and rename-category forms
- toolbar actions cover new prompt and new category; `Restore defaults` is
  rendered only while the Default library is selected
- `Export` in the topbar downloads the selected library as
  `<name-slug>.prompt-library.json`; every pill, Default included, also
  carries an export (upload) icon, shown like the delete `x` on hover or
  focus and always keyboard-reachable, that exports that pill's library
  without selecting it; `Import` uses the download icon
- `Import` in the topbar opens a file picker; because a successful import
  selects the imported library, the button obeys the unsaved-changes rule. A
  file that is not a prompt library export is refused in place. When the
  file's library name already exists, a dialog titled `“<name>” already
  exists` offers `Append`, `Append and replace`, and `Import as copy` (see
  `docs/prompts.md` for what each touches); a failure such as duplicate
  prompt names shows inside the dialog so another mode can be picked. After
  the import the created or target library is selected, which also closes
  any open prompt so a replaced prompt is never shown through a stale draft,
  and a result line (`Imported into “Team”: 2 categories and 5 prompts added,
  3 prompts replaced, 4 skipped`) stays in the error slot until the next
  action
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
- it is visible by default; closing or reopening it saves the visibility
  preference in the browser for future task details
- when more than one library exists, a read-only row of library pills sits
  between the title row and the filter, wrapping inside the narrow rail;
  creating, renaming, and deleting libraries stays in the Prompt Library view,
  and with a single library the row is hidden
- the selected pill scopes the filter, `Recent`, the category and root-level
  groups, and drag reorder; switching pills keeps the filter text but closes
  the expanded preview and clears the copy confirmation
- the selection is remembered in the browser under
  `taskboards.task.promptPickerLibraryId`, separately from the Prompt Library
  view's, and falls back to Default when the stored id no longer exists
- the initial state leads with the selected library's recently used prompts
  for one-click copying
- one click copies the prompt body with `{{TASK}}`, `{{PARENT_TASK}}`,
  `{{BOARD}}` and `{{PROJECT}}` tokens rendered from the open task and its
  board context; a row expands to preview the exact text
- an expanded row shows the author's note after the preview; the note is never
  copied
- unresolved tokens copy as their bare names and never block the copy
- prompts in a category group reorder by dragging, writing the same
  per-library order the library view shows; `Recent` is usage-sorted and never draggable,
  and dragging is suppressed while the filter hides rows
- an empty selected library reads "No prompts in this library yet."; a filter
  with no matches keeps its own message

## Maintenance Experience

Maintenance tools should be visible but calm. The UI should support:

- viewing storage and embedding index health
- triggering embedding reindexing
- reviewing archived data
- purging old archived data through deliberate actions

Potentially destructive actions should be clearly labeled and require explicit
confirmation in the UI.
