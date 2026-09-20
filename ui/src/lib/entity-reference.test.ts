import { describe, expect, it } from "vitest";
import { buildNamedReferenceText } from "./entity-reference";

describe("buildNamedReferenceText", () => {
  it("formats a name and ID for copying", () => {
    expect(buildNamedReferenceText("agent-taskboards", "project_1")).toBe(
      '"agent-taskboards" ( id=project_1 )',
    );
  });

  it("trims surrounding whitespace in the name", () => {
    expect(buildNamedReferenceText("  ui  ", "board_1")).toBe(
      '"ui" ( id=board_1 )',
    );
  });
});
