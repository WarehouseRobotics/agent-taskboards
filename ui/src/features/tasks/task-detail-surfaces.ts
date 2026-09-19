// Hit test for the task detail's outside-click close behavior. The detail
// panel can have companion panels (like the prompt picker) that must count as
// "inside" so interacting with them does not close the task. The structural
// types keep the helper testable outside a DOM environment.
export interface TaskDetailSurface {
  contains(target: unknown): boolean;
}

export function isOutsideTaskDetailSurfaces(
  panels: Array<TaskDetailSurface | null>,
  target: unknown,
) {
  if (typeof target !== "object" || target === null || !("nodeType" in target)) {
    return false;
  }

  const presentPanels = panels.filter(
    (panel): panel is TaskDetailSurface => panel !== null,
  );
  if (presentPanels.length === 0) {
    return false;
  }

  return presentPanels.every((panel) => !panel.contains(target));
}
