import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskActivity, TaskComment } from "../../domain/types";
import {
  mergeTaskTimeline,
  persistTaskTimelineSortOrder,
  storedTaskTimelineSortOrder,
} from "./task-timeline-sort";

const timelineSortOrderStorageKey = "taskboards.task.timelineSortOrder";

describe("task timeline sorting", () => {
  it("sorts comments in ascending and descending order", () => {
    const comments = [
      makeComment("new", "2026-01-03T00:00:00.000Z"),
      makeComment("old", "2026-01-01T00:00:00.000Z"),
    ];

    expect(mergeTaskTimeline(comments, [], "asc").map((item) => item.id)).toEqual(["old", "new"]);
    expect(mergeTaskTimeline(comments, [], "desc").map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("keeps comments and activity in one chronological order", () => {
    const comments = [makeComment("comment", "2026-01-01T00:00:00.000Z")];
    const activity = [makeActivity("activity", "2026-01-02T00:00:00.000Z")];

    expect(mergeTaskTimeline(comments, activity, "asc").map((item) => item.id)).toEqual(["comment", "activity"]);
    expect(mergeTaskTimeline(comments, activity, "desc").map((item) => item.id)).toEqual(["activity", "comment"]);
  });

  it("retains the existing null timestamp fallback", () => {
    const comments = [
      makeComment("dated", "2026-01-01T00:00:00.000Z"),
      makeComment("missing", null),
    ];

    expect(mergeTaskTimeline(comments, [], "asc").map((item) => item.id)).toEqual(["missing", "dated"]);
    expect(mergeTaskTimeline(comments, [], "desc").map((item) => item.id)).toEqual(["dated", "missing"]);
  });
});

describe("task timeline sort preference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to ascending for missing or invalid stored values", () => {
    stubWindowStorage(makeStorage());
    expect(storedTaskTimelineSortOrder()).toBe("asc");

    stubWindowStorage(makeStorage({ [timelineSortOrderStorageKey]: "newest" }));
    expect(storedTaskTimelineSortOrder()).toBe("asc");
  });

  it("persists and restores both valid sort orders", () => {
    const storage = makeStorage();
    stubWindowStorage(storage);

    persistTaskTimelineSortOrder("desc");
    expect(storage.value(timelineSortOrderStorageKey)).toBe("desc");
    expect(storedTaskTimelineSortOrder()).toBe("desc");

    persistTaskTimelineSortOrder("asc");
    expect(storage.value(timelineSortOrderStorageKey)).toBe("asc");
    expect(storedTaskTimelineSortOrder()).toBe("asc");
  });

  it("falls back safely when localStorage is unavailable", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem() {
          throw new Error("unavailable");
        },
        setItem() {
          throw new Error("unavailable");
        },
      },
    });

    expect(storedTaskTimelineSortOrder()).toBe("asc");
    expect(() => persistTaskTimelineSortOrder("desc")).not.toThrow();
  });
});

function makeComment(id: string, createdAt: string | null): TaskComment {
  return {
    authorName: "Person",
    authorRef: null,
    authorType: "human",
    body: id,
    boardId: "board-a",
    createdAt,
    id,
    metadata: {},
    projectId: "project-a",
    taskId: "task-a",
  };
}

function makeActivity(id: string, createdAt: string | null): TaskActivity {
  return {
    actorName: null,
    actorRef: null,
    actorType: "system",
    boardId: "board-a",
    createdAt,
    data: {},
    eventType: "task.updated",
    id,
    projectId: "project-a",
    summary: id,
    taskId: "task-a",
  };
}

function stubWindowStorage(storage: ReturnType<typeof makeStorage>) {
  vi.stubGlobal("window", { localStorage: storage });
}

function makeStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial));

  return {
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
    value(key: string) {
      return entries.get(key);
    },
  };
}
