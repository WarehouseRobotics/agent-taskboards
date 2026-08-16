import { describe, expect, it, vi } from "vitest";
import { archiveTaskBatch } from "./archive-tasks";

describe("archiveTaskBatch", () => {
  it("archives every task once in the supplied order and refreshes once", async () => {
    const archiveTask = vi.fn(async () => undefined);
    const onSettled = vi.fn(async () => undefined);

    const result = await archiveTaskBatch({
      archiveTask,
      onSettled,
      taskIds: ["task-b", "task-a", "task-c"],
    });

    expect(archiveTask.mock.calls).toEqual([
      ["task-b"],
      ["task-a"],
      ["task-c"],
    ]);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith(["task-b", "task-a", "task-c"]);
    expect(result).toEqual({
      archivedTaskIds: ["task-b", "task-a", "task-c"],
      error: null,
    });
  });

  it("stops at the first failure and refreshes with the successfully archived tasks", async () => {
    const error = new Error("Archive failed");
    const archiveTask = vi.fn(async (taskId: string) => {
      if (taskId === "task-b") {
        throw error;
      }
    });
    const onSettled = vi.fn(async () => undefined);

    const result = await archiveTaskBatch({
      archiveTask,
      onSettled,
      taskIds: ["task-a", "task-b", "task-c"],
    });

    expect(archiveTask.mock.calls).toEqual([["task-a"], ["task-b"]]);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith(["task-a"]);
    expect(result).toEqual({ archivedTaskIds: ["task-a"], error });
  });
});
