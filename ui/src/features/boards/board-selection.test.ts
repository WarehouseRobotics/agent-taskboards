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
      manualOrder: true,
      selectedTaskIds: ["task-b"],
      targetColumnId: "ready",
      targetTaskId: "task-b",
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
      manualOrder: true,
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
      makeTask("ready-b", { columnId: "ready" }),
    ];

    expect(planTaskDrop({
      draggedTaskId: "backlog-a",
      manualOrder: true,
      selectedTaskIds: ["backlog-a", "backlog-b"],
      targetColumnId: "ready",
      targetTaskId: "ready-b",
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
      makeTask("review-b", { columnId: "review" }),
    ];

    expect(planTaskDrop({
      draggedTaskId: "ready-a",
      manualOrder: true,
      selectedTaskIds: ["blocked-a", "backlog-a", "ready-a"],
      targetColumnId: "review",
      targetTaskId: "review-b",
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
      manualOrder: true,
      selectedTaskIds: ["ready-a", "backlog-a", "ready-b"],
      targetColumnId: "ready",
      targetTaskId: "ready-b",
      visibleTasks: tasks,
    })).toEqual([
      { taskId: "backlog-a", input: { columnId: "ready", position: 1 } },
    ]);
  });

  it("keeps cross-column drops under non-position sorts", () => {
    const tasks = [
      makeTask("task-a", { columnId: "backlog" }),
      makeTask("task-b", { columnId: "ready" }),
    ];

    expect(planTaskDrop({
      draggedTaskId: "task-a",
      manualOrder: false,
      selectedTaskIds: [],
      targetColumnId: "ready",
      targetTaskId: "task-b",
      visibleTasks: tasks,
    })).toEqual([
      { taskId: "task-a", input: { columnId: "ready", position: 0 } },
    ]);
  });
});

describe("same-column drop planning", () => {
  const ids = ["a", "b", "c", "d", "e"];

  it("reorders a single unselected card into the target's slot", () => {
    expect(dropOrder(ids, { dragged: "b", selected: [], target: "d" })).toEqual(["a", "c", "d", "b", "e"]);
    expect(dropOrder(ids, { dragged: "d", selected: [], target: "b" })).toEqual(["a", "d", "b", "c", "e"]);
  });

  it("lands a contiguous block dragged down right after the target", () => {
    expect(dropOrder(ids, { dragged: "a", selected: ["a", "b"], target: "d" })).toEqual(["c", "d", "a", "b", "e"]);
  });

  it("lands a contiguous block dragged up right before the target", () => {
    expect(dropOrder(ids, { dragged: "e", selected: ["d", "e"], target: "b" })).toEqual(["a", "d", "e", "b", "c"]);
  });

  it("gathers a non-contiguous selection into one block in column order", () => {
    expect(dropOrder(ids, { dragged: "a", selected: ["c", "a"], target: "d" })).toEqual(["b", "d", "a", "c", "e"]);
    expect(dropOrder(ids, { dragged: "c", selected: ["e", "c"], target: "b" })).toEqual(["a", "c", "e", "b", "d"]);
  });

  it("takes direction from the grabbed card when the selection straddles the target", () => {
    expect(dropOrder(ids, { dragged: "a", selected: ["a", "e"], target: "c" })).toEqual(["b", "c", "a", "e", "d"]);
    expect(dropOrder(ids, { dragged: "e", selected: ["a", "e"], target: "c" })).toEqual(["b", "a", "e", "c", "d"]);
  });

  it("appends the block to the end on a column background drop", () => {
    expect(dropOrder(ids, { dragged: "b", selected: ["b", "d"] })).toEqual(["a", "c", "e", "b", "d"]);
  });

  it("returns no moves when the drop lands on a selected card", () => {
    expect(planSameColumnDrop(ids, { dragged: "a", selected: ["a", "c"], target: "c" })).toEqual([]);
  });

  it("returns no moves when the block is already in its final place", () => {
    expect(planSameColumnDrop(ids, { dragged: "d", selected: ["d", "e"] })).toEqual([]);
  });

  it("skips moves that leave a task where it already is", () => {
    expect(planSameColumnDrop(ids, { dragged: "c", selected: ["a", "c"], target: "b" })).toEqual([
      { taskId: "c", input: { columnId: "ready", position: 1 } },
    ]);
    expect(dropOrder(ids, { dragged: "c", selected: ["a", "c"], target: "b" })).toEqual(["a", "c", "b", "d", "e"]);
  });

  it("returns no moves for same-column drops under non-position sorts", () => {
    expect(planSameColumnDrop(ids, { dragged: "b", selected: [], target: "d", manualOrder: false })).toEqual([]);
    expect(planSameColumnDrop(ids, { dragged: "b", selected: [], manualOrder: false })).toEqual([]);
    expect(planSameColumnDrop(ids, { dragged: "a", selected: ["a", "b"], target: "d", manualOrder: false })).toEqual([]);
  });
});

type SameColumnDrop = {
  dragged: string;
  manualOrder?: boolean;
  selected: string[];
  target?: string;
};

function planSameColumnDrop(ids: string[], drop: SameColumnDrop) {
  return planTaskDrop({
    draggedTaskId: drop.dragged,
    manualOrder: drop.manualOrder ?? true,
    selectedTaskIds: drop.selected,
    targetColumnId: "ready",
    targetTaskId: drop.target,
    visibleTasks: ids.map((id) => makeTask(id, { columnId: "ready" })),
  });
}

// Applies planned moves one at a time the way the server does: take the task
// out of the column, then splice it back in at the clamped position.
function dropOrder(ids: string[], drop: SameColumnDrop) {
  return planSameColumnDrop(ids, drop).reduce((order, move) => {
    const rest = order.filter((id) => id !== move.taskId);
    const position = move.input.position ?? rest.length;
    rest.splice(Math.max(0, Math.min(position, rest.length)), 0, move.taskId);
    return rest;
  }, ids);
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
