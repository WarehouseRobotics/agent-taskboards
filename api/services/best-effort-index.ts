export type BestEffortIndexTarget = {
  sourceType: "board" | "task" | "comment";
  sourceId: string;
};

export async function runBestEffortIndex(
  target: BestEffortIndexTarget,
  index: () => Promise<unknown>,
) {
  try {
    await index();
  } catch (error) {
    console.error(
      `Search indexing failed for ${target.sourceType} ${target.sourceId}`,
      error,
    );
  }
}
