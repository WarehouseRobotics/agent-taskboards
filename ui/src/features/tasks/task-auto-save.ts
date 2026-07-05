const autoSaveStorageKey = "taskboards.task.autoSaveChanges";

export const taskAutoSaveDelayMs = 15000;

export function storedTaskAutoSaveEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(autoSaveStorageKey) === "true";
  } catch {
    return false;
  }
}

export function persistTaskAutoSaveEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(autoSaveStorageKey, enabled ? "true" : "false");
  } catch {
    // Preference persistence should never block the task UI.
  }
}
