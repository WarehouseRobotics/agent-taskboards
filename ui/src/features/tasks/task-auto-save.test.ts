import { afterEach, describe, expect, it, vi } from "vitest";
import {
  persistTaskAutoSaveEnabled,
  storedTaskAutoSaveEnabled,
  taskAutoSaveDelayMs,
} from "./task-auto-save";

const autoSaveStorageKey = "taskboards.task.autoSaveChanges";

describe("task auto-save preferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a 15 second inactivity delay", () => {
    expect(taskAutoSaveDelayMs).toBe(15000);
  });

  it("defaults to disabled for missing or invalid stored values", () => {
    stubWindowStorage(makeStorage());
    expect(storedTaskAutoSaveEnabled()).toBe(false);

    stubWindowStorage(makeStorage({ [autoSaveStorageKey]: "yes" }));
    expect(storedTaskAutoSaveEnabled()).toBe(false);
  });

  it("persists enabled and disabled values in localStorage", () => {
    const storage = makeStorage();
    stubWindowStorage(storage);

    persistTaskAutoSaveEnabled(true);

    expect(storage.value(autoSaveStorageKey)).toBe("true");
    expect(storedTaskAutoSaveEnabled()).toBe(true);

    persistTaskAutoSaveEnabled(false);

    expect(storage.value(autoSaveStorageKey)).toBe("false");
    expect(storedTaskAutoSaveEnabled()).toBe(false);
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
