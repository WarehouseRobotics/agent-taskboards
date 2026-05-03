import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampDescriptionHeight,
  descriptionDefaultHeight,
  descriptionHeightMax,
  descriptionHeightMin,
  persistDescriptionHeight,
  storedDescriptionHeight,
} from "./task-description-view";

const descriptionHeightStorageKey = "taskboards.task.descriptionHeight";

describe("task description height preferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses content tiers for the default height", () => {
    expect(descriptionDefaultHeight("")).toBe(112);
    expect(descriptionDefaultHeight("Short description")).toBe(112);
    expect(descriptionDefaultHeight(Array.from({ length: 10 }, () => "line").join("\n"))).toBe(240);
    expect(descriptionDefaultHeight(Array.from({ length: 20 }, () => "line").join("\n"))).toBe(400);
  });

  it("clamps resized heights to the allowed range", () => {
    expect(clampDescriptionHeight(48)).toBe(descriptionHeightMin);
    expect(clampDescriptionHeight(320.4)).toBe(320);
    expect(clampDescriptionHeight(900)).toBe(descriptionHeightMax);
    expect(clampDescriptionHeight(Number.NaN)).toBe(descriptionHeightMin);
  });

  it("ignores invalid stored heights", () => {
    stubWindowStorage(makeStorage({ [descriptionHeightStorageKey]: "not a number" }));
    expect(storedDescriptionHeight()).toBeNull();
  });

  it("persists clamped heights in localStorage", () => {
    const storage = makeStorage();
    stubWindowStorage(storage);

    persistDescriptionHeight(700);

    expect(storage.value(descriptionHeightStorageKey)).toBe("640");
    expect(storedDescriptionHeight()).toBe(640);
  });
});

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
