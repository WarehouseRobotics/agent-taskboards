/* global React, Sidebar, Topbar, Btn, I, KBD, StatusIcon, PriorityFlag, Badge, Label, Mono, Avatar */

/* ----- Mock data ----- */
const PROJECTS = [
  { id: "atb", name: "agent-taskboards", glyph: "AT", color: "oklch(0.78 0.14 250)", taskCount: 47,
    boards: [
      { id: "atb-active", name: "Active Sprint", active: true },
      { id: "atb-backlog", name: "Backlog" },
      { id: "atb-bugs", name: "Bug Triage" },
    ]},
  { id: "ide", name: "ide-extension", glyph: "IE", color: "oklch(0.78 0.13 295)", taskCount: 23,
    boards: [{ id: "ide-active", name: "Active Sprint", active: true }, { id: "ide-design", name: "Design Spikes" }]},
  { id: "embed", name: "embed-server", glyph: "ES", color: "oklch(0.78 0.13 145)", taskCount: 12,
    boards: [{ id: "embed-active", name: "Active Sprint" }]},
  { id: "shell", name: "agent-shell", glyph: "AS", color: "oklch(0.78 0.14 65)", taskCount: 8,
    boards: [{ id: "shell-active", name: "Active Sprint" }]},
  { id: "docs", name: "developer-docs", glyph: "DD", color: "oklch(0.78 0.08 200)", taskCount: 14,
    boards: [{ id: "docs-active", name: "Writing Pipeline" }]},
  { id: "infra", name: "infra-scripts", glyph: "IS", color: "oklch(0.7 0.04 250)", taskCount: 5,
    boards: [{ id: "infra-active", name: "Operations" }]},
];

const COLUMNS = [
  { id: "backlog", name: "Backlog", status: "backlog" },
  { id: "ready", name: "Ready", status: "ready" },
  { id: "progress", name: "In Progress", status: "progress", limit: 4 },
  { id: "blocked", name: "Blocked", status: "blocked" },
  { id: "review", name: "Review", status: "review" },
  { id: "done", name: "Done", status: "done" },
];

const TASKS = {
  backlog: [
    { id: "TSK-241", title: "Add agent skill for bulk task transitions", priority: "p2", labels: [["agent", "agent"]], comments: 2, agent: false },
    { id: "TSK-238", title: "Document task move semantics for column re-ordering", priority: "p3", labels: [["docs", "docs"]], comments: 0, agent: false },
    { id: "TSK-235", title: "Reduce embedding model load time on cold boot", priority: "p2", labels: [["perf", "perf"], ["embed", "embed"]], comments: 1, agent: true, agentNote: "researching mmap" },
    { id: "TSK-231", title: "Stable IDs in task list keyboard nav (j/k)", priority: "p2", labels: [["ui", "ui"]], comments: 0 },
    { id: "TSK-227", title: "Surface SQLite WAL checkpoint metric on maintenance view", priority: "p3", labels: [["infra", "infra"]], comments: 3 },
    { id: "TSK-225", title: "Allow agents to query tasks by created-after timestamp", priority: "p2", labels: [["api", "api"], ["agent", "agent"]], comments: 1 },
  ],
  ready: [
    { id: "TSK-219", title: "Drag-and-drop reorder within column", priority: "p1", labels: [["ui", "ui"]], comments: 4 },
    { id: "TSK-216", title: "POST /tasks/:id/comments accepts authorKind=agent|human|system", priority: "p1", labels: [["api", "api"]], comments: 2 },
    { id: "TSK-212", title: "Embedding reindex progress events over SSE", priority: "p2", labels: [["embed", "embed"], ["api", "api"]], comments: 1, agent: true, agentNote: "scoped" },
    { id: "TSK-208", title: "Confirm dialog for purge-archive action", priority: "p2", labels: [["ui", "ui"]], comments: 0 },
    { id: "TSK-204", title: "Show parent project + board in search result cards", priority: "p2", labels: [["ui", "ui"]], comments: 2 },
  ],
  progress: [
    { id: "TSK-198", title: "Kanban column virtualization for 500+ tasks", priority: "p1", labels: [["perf", "perf"], ["ui", "ui"]], comments: 6, assignee: { kind: "human", name: "M" } },
    { id: "TSK-194", title: "Local-first auth: device key for API requests", priority: "p0", labels: [["api", "api"], ["infra", "infra"]], comments: 9, assignee: { kind: "human", name: "M" } },
    { id: "TSK-189", title: "Wire sqlite-vec hybrid query (BM25 + cosine)", priority: "p1", labels: [["embed", "embed"]], comments: 3, agent: true, agentNote: "drafting tests", assignee: { kind: "agent", name: "Claude" } },
  ],
  blocked: [
    { id: "TSK-184", title: "GGUF model integrity check on container start", priority: "p1", labels: [["infra", "infra"]], comments: 5, blockedBy: "TSK-194" },
  ],
  review: [
    { id: "TSK-178", title: "Activity entries for archive/unarchive transitions", priority: "p2", labels: [["api", "api"]], comments: 3, assignee: { kind: "human", name: "M" } },
    { id: "TSK-175", title: "Refactor task move to single explicit endpoint", priority: "p1", labels: [["api", "api"]], comments: 8, agent: true, agentNote: "PR ready", assignee: { kind: "agent", name: "Codex" } },
  ],
  done: [
    { id: "TSK-170", title: "Initial Express + Vite project scaffold", priority: "p2", labels: [["infra", "infra"]], comments: 1 },
    { id: "TSK-167", title: "SQLite schema for projects, boards, tasks", priority: "p1", labels: [["api", "api"]], comments: 4 },
    { id: "TSK-161", title: "Choose default embedding model (bge-small-en-v1.5)", priority: "p2", labels: [["embed", "embed"]], comments: 6 },
    { id: "TSK-158", title: "Docker Compose with persistent volume for sqlite", priority: "p3", labels: [["infra", "infra"]], comments: 0 },
  ],
};

window.PROJECTS = PROJECTS;
window.COLUMNS = COLUMNS;
window.TASKS = TASKS;
