import { describe, expect, it } from "vitest";
import { isArchiveMenuHotkey, type TaskCardMenuHotkeyEvent } from "./task-card-menu-hotkeys";

describe("task card menu hotkeys", () => {
  it("matches lowercase and uppercase archive keys", () => {
    expect(isArchiveMenuHotkey(eventFor("a"), false)).toBe(true);
    expect(isArchiveMenuHotkey(eventFor("A"), false)).toBe(true);
  });

  it("ignores modified archive keys", () => {
    expect(isArchiveMenuHotkey(eventFor("a", { metaKey: true }), false)).toBe(false);
    expect(isArchiveMenuHotkey(eventFor("a", { ctrlKey: true }), false)).toBe(false);
    expect(isArchiveMenuHotkey(eventFor("a", { altKey: true }), false)).toBe(false);
  });

  it("ignores other keys", () => {
    expect(isArchiveMenuHotkey(eventFor("Escape"), false)).toBe(false);
    expect(isArchiveMenuHotkey(eventFor("x"), false)).toBe(false);
  });

  it("does not match when archive is disabled", () => {
    expect(isArchiveMenuHotkey(eventFor("a"), true)).toBe(false);
  });
});

function eventFor(
  key: string,
  overrides: Partial<TaskCardMenuHotkeyEvent> = {},
): TaskCardMenuHotkeyEvent {
  return {
    altKey: false,
    ctrlKey: false,
    key,
    metaKey: false,
    ...overrides,
  };
}
