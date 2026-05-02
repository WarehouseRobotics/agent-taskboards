import { describe, expect, it } from "vitest";
import type { BoardColumn, Task } from "../../domain/types";
import { sortBoardTasks } from "./board-view-state";

describe("board task sorting", () => {
  const columns = [
    makeColumn("ready", 1),
    makeColumn("backlog", 0),
  ];

  it("sorts position by column order and then task position", () => {
    const tasks = [
      makeTask("ready-2", { columnId: "ready", position: 2 }),
      makeTask("backlog-1", { columnId: "backlog", position: 1 }),
      makeTask("backlog-0", { columnId: "backlog", position: 0 }),
      makeTask("ready-0", { columnId: "ready", position: 0 }),
    ];

    expect(sortBoardTasks(tasks, columns, "position").map((task) => task.id)).toEqual([
      "backlog-0",
      "backlog-1",
      "ready-0",
      "ready-2",
    ]);
  });

  it("sorts priority from urgent to low", () => {
    const tasks = [
      makeTask("normal", { priority: "normal" }),
      makeTask("low", { priority: "low" }),
      makeTask("urgent", { priority: "urgent" }),
      makeTask("high", { priority: "high" }),
    ];

    expect(sortBoardTasks(tasks, columns, "priority").map((task) => task.id)).toEqual([
      "urgent",
      "high",
      "normal",
      "low",
    ]);
  });

  it("sorts titles alphanumerically", () => {
    const tasks = [
      makeTask("task-10", { title: "Task 10" }),
      makeTask("task-2", { title: "Task 2" }),
      makeTask("alpha", { title: "Alpha" }),
    ];

    expect(sortBoardTasks(tasks, columns, "title").map((task) => task.id)).toEqual([
      "alpha",
      "task-2",
      "task-10",
    ]);
  });

  it("sorts created and updated timestamps newest first with nulls last", () => {
    const tasks = [
      makeTask("missing", { createdAt: null, updatedAt: null }),
      makeTask("old", { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" }),
      makeTask("new", { createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-04T00:00:00.000Z" }),
    ];

    expect(sortBoardTasks(tasks, columns, "createdAt").map((task) => task.id)).toEqual(["new", "old", "missing"]);
    expect(sortBoardTasks(tasks, columns, "updatedAt").map((task) => task.id)).toEqual(["new", "old", "missing"]);
  });
});

function makeColumn(id: string, position: number): BoardColumn {
  return {
    boardId: "board-a",
    createdAt: "2026-01-01T00:00:00.000Z",
    id,
    isDone: false,
    key: id,
    name: id,
    position,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    archivedAt: null,
    boardId: "board-a",
    columnId: "backlog",
    completedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    description: null,
    externalReferences: [],
    id,
    labels: [],
    metadata: {},
    position: 0,
    priority: "normal",
    projectId: "project-a",
    title: id,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
