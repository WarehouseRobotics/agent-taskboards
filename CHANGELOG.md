# Changelog

Important changes to Agent Taskboards are documented in this file.

## Released

### 2026-09-24

- **Block drag-reorder for selected tasks** (`allow-drag-reorder-for-eb5o0y`):
  A selection of tasks within one board column can now be dragged onto another
  card in that column to reorder it as a block, taking the target card's slot.
  Non-contiguous selections gather into one block. Same-column drops, for
  single cards too, now only reorder under the `Position` sort instead of
  writing the visible index of another sort as the stored position.

### 2026-09-20

- **Prompt library tools** (`prompt-library-tools-n084qh`): Added a global
  library for organizing reusable prompts into categories, maintaining the
  built-in prompt catalog, and tracking recently used prompts. The task detail
  prompt picker can copy prompts with task, parent-task, board, and project
  tokens filled in. The feature also includes prompt and category management in
  the UI and REST API support.
