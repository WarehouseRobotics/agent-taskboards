import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

describe("api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds repeated project query params for activity", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          hasMore: false,
          limit: 25,
          offset: 50,
          sort: "asc",
        }),
        { status: 200 },
      ),
    );

    await api.listActivity({
      projectIds: ["project-a", "project-b"],
      limit: 25,
      offset: 50,
      sort: "asc",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/activity?projectId=project-a&projectId=project-b&limit=25&offset=50&sort=asc",
    );
  });

  it("deletes comments through the encoded task comment endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          comment: { id: "comment 1" },
          activity: { eventType: "comment.deleted" },
        }),
        { status: 200 },
      ),
    );

    await api.deleteComment("task 1", "comment 1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/tasks/task%201/comments/comment%201",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });
});
