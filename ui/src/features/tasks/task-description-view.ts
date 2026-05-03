export type TaskDescriptionView = "edit" | "preview";

const viewStorageKey = "taskboards.task.descriptionView";
const heightStorageKey = "taskboards.task.descriptionHeight";

export const descriptionHeightMin = 112;
export const descriptionHeightMax = 640;

export function storedDescriptionView(): TaskDescriptionView {
  if (typeof window === "undefined") {
    return "edit";
  }

  try {
    const stored = window.localStorage.getItem(viewStorageKey);
    return stored === "preview" || stored === "edit" ? stored : "edit";
  } catch {
    return "edit";
  }
}

export function persistDescriptionView(mode: TaskDescriptionView) {
  try {
    window.localStorage.setItem(viewStorageKey, mode);
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

export function descriptionDefaultHeight(description: string) {
  const tier = descriptionSizeTier(description);
  if (tier === "large") {
    return 400;
  }
  if (tier === "mid") {
    return 240;
  }
  return descriptionHeightMin;
}

export function clampDescriptionHeight(value: number) {
  if (!Number.isFinite(value)) {
    return descriptionHeightMin;
  }

  return Math.min(descriptionHeightMax, Math.max(descriptionHeightMin, Math.round(value)));
}

export function storedDescriptionHeight() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = Number(window.localStorage.getItem(heightStorageKey));
    return Number.isFinite(stored) && stored > 0 ? clampDescriptionHeight(stored) : null;
  } catch {
    return null;
  }
}

export function persistDescriptionHeight(height: number) {
  try {
    window.localStorage.setItem(heightStorageKey, String(clampDescriptionHeight(height)));
  } catch {
    // Preference persistence should never block the task UI.
  }
}
