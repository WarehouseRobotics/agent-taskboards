export type TaskDescriptionView = "edit" | "preview";

const storageKey = "taskboards.task.descriptionView";

export function storedDescriptionView(): TaskDescriptionView {
  if (typeof window === "undefined") {
    return "edit";
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored === "preview" || stored === "edit" ? stored : "edit";
  } catch {
    return "edit";
  }
}

export function persistDescriptionView(mode: TaskDescriptionView) {
  try {
    window.localStorage.setItem(storageKey, mode);
  } catch {
    // Preference persistence should never block the task UI.
  }
}

export type DescriptionSizeTier = "compact" | "mid" | "large";

const wrapWidth = 64;

export function descriptionSizeTier(description: string): DescriptionSizeTier {
  if (!description) {
    return "compact";
  }

  let lines = 0;
  for (const segment of description.split("\n")) {
    lines += Math.max(1, Math.ceil(segment.length / wrapWidth));
  }

  if (lines <= 6) {
    return "compact";
  }
  if (lines <= 16) {
    return "mid";
  }
  return "large";
}
