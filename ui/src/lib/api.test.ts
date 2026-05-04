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
});
