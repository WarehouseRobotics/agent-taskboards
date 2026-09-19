export function buildTaskReferenceText(visibleTitle: string, fallbackTitle: string, taskId: string) {
  const title = visibleTitle.trim() || fallbackTitle.trim();
  return `"${title}" ( id=${taskId} )`;
}
