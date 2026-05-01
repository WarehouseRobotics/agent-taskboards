# Kanban Task Boards with API for AI Agents

This app is a single-user Kanban task board with an API designed for AI coding
agents. It runs locally in Docker and will eventually combine a React UI,
Express API, SQLite storage, and local text embeddings.

## Core Infrastructure

The project has two runtime components:

- `api/`: Express.js API server. In production it also serves the built UI from
  `dist/ui`.
- `ui/`: Vite + React frontend. In debug mode Vite serves the UI and proxies
  `/api` requests to the Express server.

Use `docker compose ...` for normal project operations. Do not run `npm install`
on the host machine for security reasons; dependency installation should happen inside Docker.

## Docker Workflow

The app is exposed on `http://localhost:8142`.

By default, `docker-compose.yml` sets `TASKBOARDS_DEBUG=1`, which starts both
the API and UI in watch/dev mode:

```sh
docker compose up --build
```

When `TASKBOARDS_DEBUG` is unset or empty, the container runs in release mode:
it builds the API and UI into `dist/`, then starts the compiled Express server
on port `8142`.

```sh
TASKBOARDS_DEBUG= docker compose up --build
```

The debug mode process layout is:

- Vite UI: port `8142`
- Express API: port `3000`
- Vite proxy: `/api` -> `http://localhost:3000`

The release mode process layout is:

- Express API and static UI server: port `8142`

## Scripts

Scripts are defined in `package.json` and are intended to run inside Docker:

- `npm run dev`: runs API and UI watchers together
- `npm run dev:api`: runs `api/index.ts` with `tsx watch`
- `npm run dev:ui`: runs the Vite dev server
- `npm run build`: builds API and UI output into `dist/`
- `npm run start`: starts the compiled API server
- `npm run typecheck`: runs TypeScript checks
- `npm run lint`: runs ESLint
- `npm run test`: runs Vitest

## TypeScript Notes

The shared `tsconfig.json` covers both API and UI code. The API build uses
`tsconfig.api.json`, which intentionally uses ES module output, Bundler module
resolution, and `ES2023` lib support for compatibility with packages such as
`node-llama-cpp`.

## Documentation

Check the docs for scope-specific context before implementing features:

- `docs/taskboards.md`: general app goals and user workflows
- `docs/api.md`: API structure for managing tasks
- `docs/design.md`: design rules
- `docs/text-embedding.md`: text embeddings and vector search
- `docs/ui.md`: UI architecture and principles