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
  return isTaskCardMenuHotkey(event, "a", archiveDisabled);
}

export function isMoveToDoneMenuHotkey(
  event: TaskCardMenuHotkeyEvent,
  moveToDoneDisabled: boolean,
) {
  return isTaskCardMenuHotkey(event, "d", moveToDoneDisabled);
}

function isTaskCardMenuHotkey(
  event: TaskCardMenuHotkeyEvent,
  key: string,
  disabled: boolean,
) {
  return (
    !disabled &&
    event.key.toLowerCase() === key &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  );
}
