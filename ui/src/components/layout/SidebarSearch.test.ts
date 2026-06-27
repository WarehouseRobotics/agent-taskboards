import { describe, expect, it } from "vitest";
import type { Task } from "../../domain/types";
import {
  findCurrentBoardTaskIdMatch,
  shouldRunSidebarSearchApi,
  taskToSearchResult,
} from "./SidebarSearch";

describe("SidebarSearch task ID helpers", () => {
  it("finds exact current-board task ID matches case-insensitively only for long queries", () => {
    const tasks = [
      task({ id: "implement-deterministic-task-id-pp3d7t" }),
      task({ id: "short" }),
    ];

    expect(
      findCurrentBoardTaskIdMatch(
        "IMPLEMENT-DETERMINISTIC-TASK-ID-PP3D7T",
        tasks,
      )?.id,
    ).toBe("implement-deterministic-task-id-pp3d7t");
    expect(findCurrentBoardTaskIdMatch("short", tasks)).toBeNull();
    expect(
      findCurrentBoardTaskIdMatch("deterministic-task-id-pp3d7t", tasks),
    ).toBeNull();
  });

  it("skips the search API when an exact current-board task ID can be opened directly", () => {
    const tasks = [task({ id: "current-board-task-abc123" })];

    expect(
      shouldRunSidebarSearchApi({
        currentBoardTasks: tasks,
        open: true,
        query: "current-board-task-abc123",
      }),
    ).toBe(false);
    expect(
      shouldRunSidebarSearchApi({
        currentBoardTasks: tasks,
        open: true,
        query: "board-task-abc123",
      }),
    ).toBe(true);
    expect(
      shouldRunSidebarSearchApi({
        currentBoardTasks: tasks,
        open: false,
        query: "current-board-task-abc123",
      }),
    ).toBe(false);
  });

  it("builds a task-shaped search result for direct opens", () => {
    const directResult = taskToSearchResult(
      task({ id: "current-board-task-abc123" }),
      "exact",
    );

    expect(directResult).toMatchObject({
      searchDocumentId: "task-id:current-board-task-abc123",
      sourceType: "task",
      sourceId: "current-board-task-abc123",
      taskId: "current-board-task-abc123",
      snippet: "Task ID: current-board-task-abc123",
      distance: 0,
      metadata: { sourceTextField: "taskId", matchType: "exact" },
    });
  });
});

function task(overrides: Partial<Task>): Task {
  return {
    id: "task-abc123",
    projectId: "project-1",
    boardId: "board-1",
    columnId: "column-1",
    title: "Task title",
    description: null,
    position: 0,
    priority: "normal",
    labels: [],
    externalReferences: [],
    metadata: {},
    completedAt: null,
    archivedAt: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}
