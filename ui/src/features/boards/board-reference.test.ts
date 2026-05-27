import { describe, expect, it } from "vitest";
import { buildBoardReferenceText } from "./board-reference";

describe("board reference helpers", () => {
  it("formats the board name and ID for copying", () => {
    expect(buildBoardReferenceText("ui", "board_123")).toBe("ui id=board_123");
  });

  it("trims surrounding board name whitespace", () => {
    expect(buildBoardReferenceText("  ui  ", "board_123")).toBe("ui id=board_123");
  });
});
