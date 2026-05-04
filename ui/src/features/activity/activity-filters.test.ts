import { describe, expect, it } from "vitest";
import { normalizeProjectSelection, toggleProjectSelection } from "./activity-filters";

describe("activity filters", () => {
  it("preserves all projects as an empty selection", () => {
    expect(normalizeProjectSelection([])).toEqual([]);
    expect(toggleProjectSelection(["project-a"], "project-a")).toEqual([]);
  });

  it("toggles a project from the all-projects state into a single-project filter", () => {
    expect(toggleProjectSelection([], "project-a")).toEqual(["project-a"]);
  });

  it("deduplicates selected project ids", () => {
    expect(normalizeProjectSelection(["project-a", "project-a", "project-b"])).toEqual([
      "project-a",
      "project-b",
    ]);
  });
});
