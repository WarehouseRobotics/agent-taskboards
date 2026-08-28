import { describe, expect, it, vi } from "vitest";
import { transferTaskToBoard } from "./move-task-to-board";

describe("cross-board task transfer", () => {
  it("closes and refreshes the source view after a successful move", async () => {
    const moveTask = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    await expect(
      transferTaskToBoard({
        boardId: "board-target",
        moveTask,
        onError,
        onSuccess,
        taskId: "task-123",
      }),
    ).resolves.toBe(true);
    expect(moveTask).toHaveBeenCalledWith("task-123", {
      boardId: "board-target",
    });
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps the task open and reports the error when the move fails", async () => {
    const error = new Error("Destination board is unavailable");
    const moveTask = vi.fn().mockRejectedValue(error);
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    await expect(
      transferTaskToBoard({
        boardId: "board-target",
        moveTask,
        onError,
        onSuccess,
        taskId: "task-123",
      }),
    ).resolves.toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(error);
  });
});
