import { describe, expect, it } from "vitest";
import { documentTitleForRoute } from "./document-title";
import type { AppRoute } from "./router";

const project = { name: "agent-taskboards" };
const board = { name: "ui" };
const task = { title: "Fix title" };

describe("documentTitleForRoute", () => {
  it("uses project and board names on board routes", () => {
    expect(
      documentTitleForRoute({
        board,
        project,
        route: boardRoute(),
        task: null,
      }),
    ).toBe("agent-taskboards / ui");
  });

  it("uses board and task names on task routes", () => {
    expect(
      documentTitleForRoute({
        board,
        project,
        route: taskRoute(),
        task,
      }),
    ).toBe("ui / Fix title");
  });

  it("falls back to the board title while task data loads", () => {
    expect(
      documentTitleForRoute({
        board,
        project,
        route: taskRoute(),
        task: null,
      }),
    ).toBe("agent-taskboards / ui");
  });

  it("uses the app title for unrelated views", () => {
    expect(
      documentTitleForRoute({
        board,
        project,
        route: { view: "search", query: null },
        task,
      }),
    ).toBe("Agent Taskboards");
  });
});

function boardRoute(): AppRoute {
  return {
    view: "board",
    projectId: "project-1",
    boardId: "board-1",
    taskId: null,
  };
}

function taskRoute(): AppRoute {
  return {
    view: "board",
    projectId: "project-1",
    boardId: "board-1",
    taskId: "task-1",
  };
}
