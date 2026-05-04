import { describe, expect, it } from "vitest";
import { parseRoute, routePath } from "./router";

describe("router", () => {
  it("parses and serializes activity routes with repeated project filters", () => {
    expect(
      parseRoute("/activity", "?projectId=project-a&projectId=project-b&sort=asc"),
    ).toEqual({
      view: "activity",
      projectIds: ["project-a", "project-b"],
      sort: "asc",
    });

    expect(
      routePath({
        view: "activity",
        projectIds: ["project-a", "project-b"],
        sort: "asc",
      }),
    ).toBe("/activity?projectId=project-a&projectId=project-b&sort=asc");
  });

  it("defaults activity routes to all projects and newest first", () => {
    expect(parseRoute("/activity", "")).toEqual({
      view: "activity",
      projectIds: [],
      sort: "desc",
    });

    expect(routePath({ view: "activity", projectIds: [], sort: "desc" })).toBe(
      "/activity",
    );
  });
});
