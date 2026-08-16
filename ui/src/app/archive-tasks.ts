export interface ArchiveTaskBatchResult {
  archivedTaskIds: string[];
  error: unknown | null;
}

export async function archiveTaskBatch({
  archiveTask,
  onSettled,
  taskIds,
}: {
  archiveTask: (taskId: string) => Promise<void>;
  onSettled: (archivedTaskIds: string[]) => Promise<void>;
  taskIds: string[];
}): Promise<ArchiveTaskBatchResult> {
  const archivedTaskIds: string[] = [];
  let error: unknown | null = null;

  for (const taskId of taskIds) {
    try {
      await archiveTask(taskId);
      archivedTaskIds.push(taskId);
    } catch (archiveError) {
      error = archiveError;
      break;
    }
  }

  await onSettled(archivedTaskIds);
  return { archivedTaskIds, error };
}
