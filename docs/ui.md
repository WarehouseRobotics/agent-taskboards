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
- search view for text and semantic search across tasks and comments
- maintenance view for reindexing, cleanup, and storage health

The first screen should be the working app, not a marketing landing page.

## Board Experience

The board view should make task state easy to scan and change:

- columns represent workflow states
- tasks can be created, edited, moved, archived, and completed
- task cards show compact, high-signal information
- blocked or review states should be visually obvious
- archived content should stay out of active board views by default

The UI should keep movement semantics aligned with the API. Moving a card in the
UI should map to the same explicit task move operation that agents use.

## Task Detail Experience

Task detail should preserve enough context for humans and agents to coordinate:

- title, description, status, priority, labels, and references
- comments for progress notes and handoffs
- activity entries for important state changes
- stable task ID visible enough for API or script usage
- related search results when useful

Comments should be treated as durable task memory, not disposable chat.

## Search Experience

Search should support both human recall and agent memory inspection:

- text search for exact titles, IDs, labels, and keywords
- semantic search for related work and prior decisions
- filters for project, board, active content, and archived content
- result cards that clearly show object type and parent context

Search results should link directly to the relevant project, board, task, or
comment context.

## Maintenance Experience

Maintenance tools should be visible but calm. The UI should support:

- viewing storage and embedding index health
- triggering embedding reindexing
- reviewing archived data
- purging old archived data through deliberate actions

Potentially destructive actions should be clearly labeled and require explicit
confirmation in the UI.
