import { describe, expect, it } from "vitest";
import { formatCheckpointDefaultName } from "./checkpoint-default-name";

describe("checkpoint default name", () => {
  it("formats local dates as YYYYMMDD-HHMMSS", () => {
    const date = new Date(2026, 10, 24, 17, 45, 59);

    expect(formatCheckpointDefaultName(date)).toBe("20261124-174559");
  });

  it("zero-pads single-digit date and time parts", () => {
    const date = new Date(2026, 0, 5, 3, 4, 7);

    expect(formatCheckpointDefaultName(date)).toBe("20260105-030407");
  });
});
