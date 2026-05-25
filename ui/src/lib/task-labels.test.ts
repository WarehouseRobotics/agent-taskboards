import { describe, expect, it } from "vitest";
import { formatTaskLabels, parseTaskLabels, taskLabelsEqual } from "./task-labels";

describe("task label helpers", () => {
  it("trims comma-separated labels and drops empty entries", () => {
    expect(parseTaskLabels(" ui,  tasks ,, frontend, ")).toEqual(["ui", "tasks", "frontend"]);
  });

  it("preserves first-seen order while removing exact duplicates", () => {
    expect(parseTaskLabels("tasks, ui, tasks, UI, ui")).toEqual(["tasks", "ui", "UI"]);
  });

  it("formats stored labels for editing with normalized spacing", () => {
    expect(formatTaskLabels([" ui ", "tasks", "ui", ""])).toBe("ui, tasks");
  });

  it("compares label arrays by order and exact value", () => {
    expect(taskLabelsEqual(["ui", "tasks"], ["ui", "tasks"])).toBe(true);
    expect(taskLabelsEqual(["tasks", "ui"], ["ui", "tasks"])).toBe(false);
  });

  it("returns an empty array when labels are cleared", () => {
    expect(parseTaskLabels(" , , ")).toEqual([]);
  });
});
