import { describe, expect, it } from "vitest";
import type { Board, Project, ProjectTreeItem, Task } from "../domain/types";
import { mergeBoard, mergeProjectTree, mergeTask } from "./sync";

describe("sync merge helpers", () => {
  it("merges project trees from the server while preserving local task counts", () => {
    const project = makeProject("project-a");
    const current: ProjectTreeItem[] = [
      {
        project,
        boards: [makeBoard("board-a", project.id)],
        taskCount: 3,
      },
    ];
    const incoming: ProjectTreeItem[] = [
      {
        project: { ...project, name: "Project A+" },
        boards: [makeBoard("board-a", project.id), makeBoard("board-b", project.id)],
        taskCount: null,
      },
    ];

    expect(mergeProjectTree(current, incoming)).toEqual([
      {
        project: { ...project, name: "Project A+" },
        boards: [makeBoard("board-a", project.id), makeBoard("board-b", project.id)],
        taskCount: 3,
      },
    ]);
  });

  it("uses server task order and removes tasks that no longer exist remotely", () => {
    const board = makeBoard("board-a", "project-a", [
      makeTask("task-a", { position: 0 }),
      makeTask("task-b", { position: 1 }),
    ]);
    const incoming = makeBoard("board-a", "project-a", [
      makeTask("task-b", { position: 0, title: "B moved" }),
      makeTask("task-c", { position: 1 }),
    ]);

    const merged = mergeBoard(board, incoming);

    expect(merged.tasks?.map((task) => task.id)).toEqual(["task-b", "task-c"]);
    expect(merged.tasks?.[0]?.title).toBe("B moved");
  });

  it("keeps a locally dirty task if it disappears from the server response", () => {
    const board = makeBoard("board-a", "project-a", [makeTask("task-a")]);
    const incoming = makeBoard("board-a", "project-a", []);

    expect(mergeBoard(board, incoming, { "task-a": { localModifiedAt: 1 } }).tasks).toEqual([
      makeTask("task-a"),
    ]);
  });

  it("protects dirty task fields from server replacement", () => {
    const current = makeTask("task-a", { title: "Local draft" });
    const server = makeTask("task-a", { description: "Remote update", title: "Remote title" });

    expect(
      mergeTask(current, server, {
        fields: { title: "Local draft" },
        localModifiedAt: Date.now(),
      }),
    ).toEqual({ ...server, title: "Local draft" });
  });
});

function makeProject(id: string): Project {
  return {
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    defaultBranch: null,
    description: null,
    id,
    metadata: {},
    name: id,
    repositoryPath: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeBoard(id: string, projectId: string, tasks?: Task[]): Board {
  return {
    archivedAt: null,
    columns: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    description: null,
    id,
    metadata: {},
    name: id,
    projectId,
    tasks,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    archivedAt: null,
    boardId: "board-a",
    columnId: "column-a",
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
