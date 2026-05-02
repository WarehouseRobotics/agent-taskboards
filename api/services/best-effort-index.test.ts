import { afterEach, describe, expect, it, vi } from "vitest";
import { runBestEffortIndex } from "./best-effort-index.js";

describe("best-effort search indexing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs and swallows rejected indexing work", async () => {
    const error = new Error("index unavailable");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      runBestEffortIndex(
        { sourceType: "task", sourceId: "task-1" },
        async () => {
          throw error;
        },
      ),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "Search indexing failed for task task-1",
      error,
    );
  });
});
