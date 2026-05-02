export const defaultBoardColumns = [
  { key: "backlog", name: "Backlog", isDone: false },
  { key: "ready", name: "Ready", isDone: false },
  { key: "in_progress", name: "In Progress", isDone: false },
  { key: "blocked", name: "Blocked", isDone: false },
  { key: "review", name: "Review", isDone: false },
  { key: "done", name: "Done", isDone: true },
] as const;
