# Changelog

Important changes to Agent Taskboards are documented in this file.

## Released

### 2026-10-07

- **Comment sort order** (`add-a-sort-parameter-68tm1s`):
  `GET /api/tasks/:taskId/comments` and `GET /api/agents/tasks/:taskId/comments`
  accept `sort=asc|desc`. `asc` (oldest first) stays the default; `desc` lists
  newest first, and agent paging next calls keep the chosen order. The agent
  task context (`GET /api/agents/tasks/:taskId/context`) accepts
  `commentSort=asc|desc`, so `commentSort=desc` returns the newest
  `commentLimit` comments.

### 2026-10-04

- **Project-scoped sidebar search** (`scope-sidebar-search-to-90rvs4`): The
  sidebar search covers only the project named in the URL, with an
  `All projects` toggle in the popover that resets when it closes. Queries
  shaped like task IDs still search every project. The search view keeps its
  project filter in the URL (`projectId`), and opening it from the sidebar
  carries the scope over.

### 2026-09-30

- **Search by tags** (`add-search-by-tags-2r5elm`): The search view has a
  `Tags` filter: a type-ahead field that suggests tags in use and adds the
  picked ones as removable chips inside it (Tab adds a single suggestion or
  cycles through several), with an All/Any match toggle. Tags alone list the tagged tasks
  and, combined with text, narrow semantic results to tagged tasks and their
  comments. The filter is kept in the URL. The board and list views gain the
  same `Tags` filter in the sub-toolbar. Clicking a tag chip on a card or list
  row filters the board by it, and clicking one in task detail opens a tag
  search. `POST /api/search` accepts `labels` and `labelMatch` and no longer
  requires `query` when labels are given, and the new `GET /api/labels` lists
  the labels in use with task counts.

### 2026-09-28

- **Prompt library import and export** (`import-and-export-prompt-3ksuvl`):
  A prompt library can be downloaded as one JSON file
  (`GET /api/prompt-libraries/:libraryId/export`, also from the `Export`
  button and an export icon on every library pill) and a file can be
  imported (`POST /api/prompt-libraries/import`, the `Import` button). The
  file carries only content and metadata, never ids, default keys, or usage
  counters. Importing a file whose library name is taken asks whether to
  append missing prompts and categories, append and replace same-named
  prompts in place (keeping order, usage, and default keys, so `Restore
  defaults` still applies), or import as a `<name> (2)` copy. Imports are
  validated whole and written in one transaction. The import route accepts
  bodies up to 5 MB, and oversized or malformed JSON bodies on any route now
  answer with `413`/`400` instead of `500`.
- **Prompt libraries** (`add-libraries-to-prompts-e9v6j9`): Prompts and
  categories are now grouped into libraries. A `Default` library holds the
  shipped catalog, cannot be renamed or deleted, and is the only place
  `Restore defaults` reads or writes; any number of further libraries can be
  created, renamed, and deleted (with their prompts, categories, and links,
  behind a confirmation that states the counts). Each library has its own
  category names, prompt order, and category order, and a prompt links only
  to categories in its own library; moving content between libraries is not
  supported. The Prompt Manager and the Prompt Picker show libraries as a
  wrapping row of pills, remember their selections separately in the
  browser, and scope lists, filters, `Recent`, and drag reorder to the
  selected library. New REST endpoints `GET`, `POST`, `PATCH`, and `DELETE`
  on `/api/prompt-libraries`; `POST /api/prompt-categories` and
  `POST /api/prompts` require `libraryId`, and the list endpoints accept a
  `libraryId` filter. Migration `0007_prompt_libraries.sql` rebuilds
  `prompt_categories` and `prompts` with a `library_id` column. On upgrade
  every existing prompt and category moves into a new `Custom` library with
  its default key cleared (ids, links, order, notes, and usage counters are
  kept), and `Default` is seeded from `api/models/default-prompts.ts` on the
  next API start. Fresh installs also end up with `Custom` holding an
  unkeyed copy of the catalog next to `Default`; delete it from its pill if
  it is not wanted. The migration runner now keeps foreign keys off during a
  run and verifies `PRAGMA foreign_key_check` after each applied file.

### 2026-09-27

- **Cross-platform lockfile repair** (`add-continuous-integration-for-tbsg8t`):
  `package-lock.json` had been written on linux/arm64 and was missing the other
  platforms' optional native packages, so `npm ci` on linux/amd64 lacked
  rollup, esbuild, sqlite-vec, and node-llama-cpp binaries and the test and
  build steps failed. The lockfile now lists every platform's packages and
  integrity hashes for all entries, with no resolved version changed.
  `scripts/lockfile.mjs` checks and repairs this, CI runs the check as a new
  `lockfile` step, and `TASKBOARDS_CI_PLATFORM=linux/amd64 scripts/ci.sh`
  reproduces the amd64 lane on Apple Silicon.
- **README rewrite for the v0.1.0 public preview**
  (`rewrite-the-readme-for-bv12lx`): The README now leads with the launch
  positioning (local Kanban and durable memory for coding agents), the
  one-command `scripts/start-local.sh` quick start, and the three
  differentiators, followed by the prompt library as a secondary
  differentiator with its current boundaries, Good fit / Not a fit, agent
  setup for Claude Code with a Codex section pending verification, supported
  platforms, privacy and LAN-security notes, troubleshooting, and a manual
  Docker Compose setup. The launcher's model menu now preselects F32, so the
  interactive path, the manual path, and the Compose default all resolve to
  `bge-small-en-v1.5-f32.gguf`.
- **Interactive first-run setup and release launcher**
  (`build-interactive-first-run-t95ve7`): `scripts/start-local.sh` checks
  Docker and Docker Compose, then interactively configures a new installation:
  embedding model (F32 by default, matching Compose; Q8, Q4, F16, or a
  validated existing GGUF file, with download sizes and tradeoffs shown), host port, data and uploads
  directories, and network binding. Curated models download to a temporary
  file, are verified against a pinned SHA-256 digest, and install atomically;
  interrupted or failed downloads clean up after themselves and print a
  recovery command. LAN binding requires an explicit acknowledgement that the
  API is unauthenticated. The script persists only its managed keys in the
  ignored `.env`, preserving other entries, reuses a valid configuration on
  later runs (`--reconfigure` to change it), and launches release mode with
  `docker compose up --build`.
- **Contributor, support, and security guidance**
  (`add-contributor-support-and-w2r4tw`): `CONTRIBUTING.md` documents the
  Docker-based development workflow, local CI via `scripts/ci.sh`, and
  pull-request expectations. `SECURITY.md` states the single-user, no-auth
  security model, explains why localhost is the safe default and LAN exposure
  is an explicit operator decision, and routes vulnerability reports through
  GitHub private vulnerability reporting. GitHub issue forms for bug reports,
  setup help, and agent-integration feedback collect platform and version
  diagnostics while explicitly excluding task content, credentials, and
  database files. The README links the new security and contributing guidance.

### 2026-09-26

- **Continuous integration** (`add-continuous-integration-for-tbsg8t`): A
  GitHub Actions workflow runs on pull requests and pushes to `main` for
  `linux/amd64` and `linux/arm64`. It builds the Docker image with cached
  layers, then runs typecheck, lint, the full test suite, and the production
  build inside the image, and validates the Compose configuration matrix. No
  dependencies are installed on the runner and the embedding model is not
  required. `scripts/ci.sh` runs the same checks locally, and the Dockerfile now
  installs dependencies with `npm ci` so images match `package-lock.json`.
- **Parameterized Docker release startup**
  (`parameterize-docker-release-startup-zeu90q`): The published port, bind
  address, data and uploads directories, and embedding model directory and file
  are now Compose variables with safe defaults, documented in `.env.example`.
  The published port binds to `127.0.0.1` unless LAN exposure is chosen
  explicitly, the model directory is mounted read-only at `/models`, and
  `GET /api/health` reports the resolved embedding model path and whether the
  file exists. `scripts/check-compose-config.sh` validates the default,
  custom-port, custom-storage, custom-model, and LAN configurations. The Docker
  build context now excludes runtime data, uploads, scratch files, SQLite
  files, and `.env`, so release images no longer embed the local database.

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
