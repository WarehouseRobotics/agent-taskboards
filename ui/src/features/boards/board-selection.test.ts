import { describe, expect, it } from "vitest";
import type { Task } from "../../domain/types";
import {
  nextRangeSelectionAnchor,
  planTaskDrop,
  selectedTasksInVisibleOrder,
  selectTaskRange,
  toggleTaskSelection,
} from "./board-selection";

describe("task selection helpers", () => {
  it("toggles selected task ids", () => {
    expect([...toggleTaskSelection([], "task-a")]).toEqual(["task-a"]);
    expect([...toggleTaskSelection(["task-a", "task-b"], "task-a")]).toEqual(["task-b"]);
  });

  it("selects a range within one visible column", () => {
    const tasks = [
      makeTask("task-a", { columnId: "ready" }),
      makeTask("task-b", { columnId: "ready" }),
      makeTask("task-c", { columnId: "ready" }),
      makeTask("task-d", { columnId: "ready" }),
    ];

    expect([...selectTaskRange(["already"], tasks, "task-b", "task-d")]).toEqual([
      "already",
      "task-b",
      "task-c",
      "task-d",
    ]);
  });

  it("keeps an existing anchor stable during shift range selection", () => {
    expect(nextRangeSelectionAnchor("task-a", "task-c", true)).toBe("task-a");
  });

  it("uses the target task as the anchor when shift range selection has no anchor", () => {
    expect(nextRangeSelectionAnchor(null, "task-c", true)).toBe("task-c");
  });

  it("updates the anchor for non-range selection gestures", () => {
    expect(nextRangeSelectionAnchor("task-a", "task-c", false)).toBe("task-c");
  });

  it("falls back to the target task when the range anchor is outside the visible column", () => {
    const tasks = [
      makeTask("task-a", { columnId: "ready" }),
      makeTask("task-b", { columnId: "ready" }),
    ];

    expect([...selectTaskRange([], tasks, "other-column-task", "task-b")]).toEqual(["task-b"]);
  });

  it("returns selected tasks in visible order", () => {
    const tasks = [
      makeTask("backlog-a", { columnId: "backlog" }),
      makeTask("backlog-b", { columnId: "backlog" }),
      makeTask("ready-a", { columnId: "ready" }),
    ];

    expect(selectedTasksInVisibleOrder(tasks, ["ready-a", "backlog-a"]).map((task) => task.id)).toEqual([
      "backlog-a",
      "ready-a",
    ]);
  });
});

describe("task drop planning", () => {
  it("plans a single-card move when the dragged card is not selected", () => {
    const tasks = [
      makeTask("task-a", { columnId: "backlog" }),
      makeTask("task-b", { columnId: "ready" }),
    ];

    expect(planTaskDrop({
      draggedTaskId: "task-a",
      selectedTaskIds: ["task-b"],
      targetColumnId: "ready",
      targetPosition: 0,
      visibleTasks: tasks,
    })).toEqual([
      { taskId: "task-a", input: { columnId: "ready", position: 0 } },
    ]);
  });

  it("plans selected group moves in visible order for column appends", () => {
    const tasks = [
      makeTask("backlog-a", { columnId: "backlog" }),
      makeTask("backlog-b", { columnId: "backlog" }),
      makeTask("ready-a", { columnId: "ready" }),
    ];

    expect(planTaskDrop({
      draggedTaskId: "backlog-b",
      selectedTaskIds: ["backlog-b", "backlog-a"],
      targetColumnId: "ready",
      visibleTasks: tasks,
    })).toEqual([
      { taskId: "backlog-a", input: { columnId: "ready" } },
      { taskId: "backlog-b", input: { columnId: "ready" } },
    ]);
  });

  it("increments insertion positions for selected group card drops", () => {
    const tasks = [
      makeTask("backlog-a", { columnId: "backlog" }),
      makeTask("backlog-b", { columnId: "backlog" }),
      makeTask("ready-a", { columnId: "ready" }),
    ];

    expect(planTaskDrop({
      draggedTaskId: "backlog-a",
      selectedTaskIds: ["backlog-a", "backlog-b"],
      targetColumnId: "ready",
      targetPosition: 1,
      visibleTasks: tasks,
    })).toEqual([
      { taskId: "backlog-a", input: { columnId: "ready", position: 1 } },
      { taskId: "backlog-b", input: { columnId: "ready", position: 2 } },
    ]);
  });

  it("increments insertion positions for selected cards from multiple source columns", () => {
    const tasks = [
      makeTask("backlog-a", { columnId: "backlog" }),
      makeTask("ready-a", { columnId: "ready" }),
      makeTask("blocked-a", { columnId: "blocked" }),
      makeTask("review-a", { columnId: "review" }),
    ];

    expect(planTaskDrop({
      draggedTaskId: "ready-a",
      selectedTaskIds: ["blocked-a", "backlog-a", "ready-a"],
      targetColumnId: "review",
      targetPosition: 1,
      visibleTasks: tasks,
    })).toEqual([
      { taskId: "backlog-a", input: { columnId: "review", position: 1 } },
      { taskId: "ready-a", input: { columnId: "review", position: 2 } },
      { taskId: "blocked-a", input: { columnId: "review", position: 3 } },
    ]);
  });

  it("skips selected tasks that are already in the destination column", () => {
    const tasks = [
      makeTask("backlog-a", { columnId: "backlog" }),
      makeTask("ready-a", { columnId: "ready" }),
      makeTask("ready-b", { columnId: "ready" }),
    ];

    expect(planTaskDrop({
      draggedTaskId: "ready-a",
      selectedTaskIds: ["ready-a", "backlog-a", "ready-b"],
      targetColumnId: "ready",
      targetPosition: 1,
      visibleTasks: tasks,
    })).toEqual([
      { taskId: "backlog-a", input: { columnId: "ready", position: 1 } },
    ]);
  });

  it("returns no moves for selected group drops where every selected task is already in the destination column", () => {
    const tasks = [
      makeTask("ready-a", { columnId: "ready" }),
      makeTask("ready-b", { columnId: "ready" }),
    ];

    expect(planTaskDrop({
      draggedTaskId: "ready-a",
      selectedTaskIds: ["ready-a", "ready-b"],
      targetColumnId: "ready",
      targetPosition: 1,
      visibleTasks: tasks,
    })).toEqual([]);
  });
});

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
