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

  it("manages board checkpoints through encoded board endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ checkpoints: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ checkpoint: { id: "checkpoint 1" } }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            checkpoint: { id: "checkpoint 1" },
            board: { id: "board 1" },
            warnings: [],
            idMappings: {},
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ checkpoint: { id: "checkpoint 1" } }), {
          status: 200,
        }),
      );

    await api.listBoardCheckpoints("project 1", "board 1");
    await api.createBoardCheckpoint("project 1", "board 1", {
      name: "Before edits",
      description: null,
    });
    await api.restoreBoardCheckpoint("project 1", "board 1", "checkpoint 1");
    await api.deleteBoardCheckpoint("project 1", "board 1", "checkpoint 1");

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/projects/project%201/boards/board%201/checkpoints",
      "/api/projects/project%201/boards/board%201/checkpoints",
      "/api/projects/project%201/boards/board%201/checkpoints/checkpoint%201/restore",
      "/api/projects/project%201/boards/board%201/checkpoints/checkpoint%201",
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined();
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: "DELETE" });
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ name: "Before edits", description: null }),
    );
  });
});
