// Drag payload types, mirroring the board's `text/task-id` convention. The
// type alone identifies a valid drop source: `getData` is unreadable during
// `dragover`, so drop targets test `dataTransfer.types` instead.
export const promptDragType = "text/prompt-id";
export const promptCategoryDragType = "text/prompt-category-id";

export interface ReorderPlan {
  id: string;
  position: number;
}

// The API resolves `position` against the list with the moved row already
// taken out, so the target's index in the *full* list is what makes a drop
// take that row's slot: dragging down lands after the target, dragging up
// lands before it.
export function applyReorder(
  ids: string[],
  id: string,
  position: number,
): string[] {
  const rest = ids.filter((item) => item !== id);
  rest.splice(Math.max(0, Math.min(position, rest.length)), 0, id);
  return rest;
}

// Which side of the hovered row the dragged row would land on, so the drop
// indicator sits where the row is actually going: below when dragging down,
// above when dragging up.
export function dropEdge(
  ids: string[],
  draggedId: string | null,
  targetId: string,
): "before" | "after" | null {
  if (!draggedId || draggedId === targetId) {
    return null;
  }
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0) {
    return null;
  }
  return from < to ? "after" : "before";
}

// Local mirror of the server's reorder, applied before the request so a
// dragged row does not visibly snap back while the call is in flight.
export function reorderItems<T extends { id: string }>(
  items: T[],
  id: string,
  position: number,
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return applyReorder([...byId.keys()], id, position).map(
    (itemId) => byId.get(itemId)!,
  );
}

// Drop targets are always resolved against the full ordered list, never the
// filtered one: prompts carry a single global order, and a category view is
// only a projection of it.
export function planReorder({
  ids,
  draggedId,
  targetId,
}: {
  ids: string[];
  draggedId: string;
  targetId: string;
}): ReorderPlan | null {
  if (draggedId === targetId) {
    return null;
  }

  const position = ids.indexOf(targetId);
  if (position < 0 || !ids.includes(draggedId)) {
    return null;
  }

  return planIfChanged(ids, draggedId, position);
}

// The keyboard move steps to the neighbour that is actually on screen, so one
// press moves a prompt one visible row even when the current filter hides
// prompts in between.
export function planAdjacentReorder({
  ids,
  visibleIds,
  id,
  delta,
}: {
  ids: string[];
  visibleIds: string[];
  id: string;
  delta: number;
}): ReorderPlan | null {
  const visibleIndex = visibleIds.indexOf(id);
  if (visibleIndex < 0) {
    return null;
  }

  const neighbourId = visibleIds[visibleIndex + delta];
  if (neighbourId === undefined) {
    return null;
  }

  return planReorder({ ids, draggedId: id, targetId: neighbourId });
}

function planIfChanged(
  ids: string[],
  id: string,
  position: number,
): ReorderPlan | null {
  const next = applyReorder(ids, id, position);
  const unchanged = next.every((item, index) => item === ids[index]);
  return unchanged ? null : { id, position };
}
