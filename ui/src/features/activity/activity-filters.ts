import type { ActivitySort } from "../../domain/types";

export function normalizeProjectSelection(projectIds: string[]) {
  return [...new Set(projectIds.filter(Boolean))];
}

export function toggleProjectSelection(selectedProjectIds: string[], projectId: string) {
  const selected = normalizeProjectSelection(selectedProjectIds);
  if (selected.length === 0) {
    return [projectId];
  }

  if (selected.includes(projectId)) {
    return selected.filter((id) => id !== projectId);
  }

  return [...selected, projectId];
}

export function isActivitySort(value: string): value is ActivitySort {
  return value === "asc" || value === "desc";
}
