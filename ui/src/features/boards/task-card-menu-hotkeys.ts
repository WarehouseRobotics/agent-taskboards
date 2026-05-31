export type TaskCardMenuHotkeyEvent = {
  altKey?: boolean;
  ctrlKey?: boolean;
  key: string;
  metaKey?: boolean;
};

export function isArchiveMenuHotkey(
  event: TaskCardMenuHotkeyEvent,
  archiveDisabled: boolean,
) {
  return (
    !archiveDisabled &&
    event.key.toLowerCase() === "a" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  );
}
