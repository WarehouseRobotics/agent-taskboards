export async function transferTaskToBoard({
  boardId,
  moveTask,
  onError,
  onSuccess,
  taskId,
}: {
  boardId: string;
  moveTask: (taskId: string, input: { boardId: string }) => Promise<unknown>;
  onError: (error: unknown) => void;
  onSuccess: () => Promise<void>;
  taskId: string;
}) {
  try {
    await moveTask(taskId, { boardId });
    await onSuccess();
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}
