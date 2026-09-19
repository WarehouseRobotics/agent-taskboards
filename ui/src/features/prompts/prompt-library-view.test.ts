import { describe, expect, it } from "vitest";
import type { Prompt, PromptCategory } from "../../domain/types";
import {
  filterPrompts,
  groupPromptsByCategory,
  promptCountByCategory,
  recentPrompts,
} from "./prompt-library-view";

function prompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: "prompt_1",
    name: "Prompt",
    body: "Body",
    position: 0,
    usageCount: 0,
    lastUsedAt: null,
    defaultKey: null,
    metadata: {},
    categoryIds: [],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function category(overrides: Partial<PromptCategory> = {}): PromptCategory {
  return {
    id: "cat_1",
    name: "Category",
    description: null,
    position: 0,
    defaultKey: null,
    metadata: {},
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("groupPromptsByCategory", () => {
  it("groups by category order with root-level prompts last", () => {
    const catA = category({ id: "cat_a", name: "A" });
    const catB = category({ id: "cat_b", name: "B" });
    const inA = prompt({ id: "p1", categoryIds: ["cat_a"] });
    const inBoth = prompt({ id: "p2", categoryIds: ["cat_a", "cat_b"] });
    const root = prompt({ id: "p3" });

    const groups = groupPromptsByCategory([inA, inBoth, root], [catA, catB]);
    expect(groups.map((group) => group.category?.id ?? null)).toEqual([
      "cat_a",
      "cat_b",
      null,
    ]);
    expect(groups[0].prompts.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(groups[1].prompts.map((item) => item.id)).toEqual(["p2"]);
    expect(groups[2].prompts.map((item) => item.id)).toEqual(["p3"]);
  });

  it("keeps empty categories visible but omits an empty root group", () => {
    const groups = groupPromptsByCategory(
      [prompt({ id: "p1", categoryIds: ["cat_1"] })],
      [category()],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].category?.id).toBe("cat_1");

    const emptyCategory = groupPromptsByCategory([], [category()]);
    expect(emptyCategory).toHaveLength(1);
    expect(emptyCategory[0].prompts).toEqual([]);
  });
});

describe("recentPrompts", () => {
  it("returns the most recently used prompts first", () => {
    const older = prompt({ id: "p1", lastUsedAt: "2026-09-01T00:00:00.000Z" });
    const newer = prompt({ id: "p2", lastUsedAt: "2026-09-15T00:00:00.000Z" });
    const unused = prompt({ id: "p3" });

    expect(recentPrompts([older, unused, newer], 5).map((item) => item.id)).toEqual([
      "p2",
      "p1",
    ]);
    expect(recentPrompts([older, newer], 1).map((item) => item.id)).toEqual(["p2"]);
  });
});

describe("filterPrompts", () => {
  it("matches name and body case-insensitively", () => {
    const byName = prompt({ id: "p1", name: "☂️ Umbrella Review" });
    const byBody = prompt({ id: "p2", body: "Check the UMBRELLA task" });
    const noMatch = prompt({ id: "p3", name: "Other", body: "Other" });

    expect(filterPrompts([byName, byBody, noMatch], "umbrella").map((item) => item.id)).toEqual([
      "p1",
      "p2",
    ]);
    expect(filterPrompts([byName, byBody, noMatch], "  ")).toHaveLength(3);
  });
});

describe("promptCountByCategory", () => {
  it("counts prompts per category and root level under null", () => {
    const counts = promptCountByCategory([
      prompt({ id: "p1", categoryIds: ["cat_a"] }),
      prompt({ id: "p2", categoryIds: ["cat_a", "cat_b"] }),
      prompt({ id: "p3" }),
    ]);

    expect(counts.get("cat_a")).toBe(2);
    expect(counts.get("cat_b")).toBe(1);
    expect(counts.get(null)).toBe(1);
  });
});
