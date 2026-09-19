import { describe, expect, it } from "vitest";
import { isOutsideTaskDetailSurfaces } from "./task-detail-surfaces";

function node() {
  return { nodeType: 1 };
}

function panel(...contained: unknown[]) {
  return {
    contains: (target: unknown) => contained.includes(target),
  };
}

describe("isOutsideTaskDetailSurfaces", () => {
  it("is outside when no panel contains the target", () => {
    expect(isOutsideTaskDetailSurfaces([panel()], node())).toBe(true);
  });

  it("is inside when any panel contains the target", () => {
    const insidePicker = node();
    const detail = panel();
    const picker = panel(insidePicker);

    expect(isOutsideTaskDetailSurfaces([detail, picker], insidePicker)).toBe(false);
  });

  it("ignores missing panels but requires at least one present", () => {
    expect(isOutsideTaskDetailSurfaces([panel(), null], node())).toBe(true);
    expect(isOutsideTaskDetailSurfaces([null, null], node())).toBe(false);
  });

  it("treats non-node targets as inside", () => {
    expect(isOutsideTaskDetailSurfaces([panel()], null)).toBe(false);
    expect(isOutsideTaskDetailSurfaces([panel()], "text")).toBe(false);
  });
});
