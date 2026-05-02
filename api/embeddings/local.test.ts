import { describe, expect, it } from "vitest";
import {
  getDefaultEmbeddingModelPath,
  hasLocalEmbeddingModel,
  LocalEmbeddingModel,
} from "./local.js";

const modelPath = getDefaultEmbeddingModelPath();

describe.skipIf(!hasLocalEmbeddingModel(modelPath))("local embeddings model", () => {
  it("loads the local GGUF model and produces useful cosine similarity", async () => {
    const embeddings = new LocalEmbeddingModel({ modelPath });

    try {
      const boardEmbedding = await embeddings.embed(
        "Kanban board task with a high priority implementation column",
      );
      const similar = await embeddings.similarity(
        "Kanban board task with a high priority implementation column",
        "Implementation task on a kanban board",
      );
      const unrelated = await embeddings.similarity(
        "Kanban board task with a high priority implementation column",
        "Fresh oranges and sparkling water in a glass",
      );

      expect(boardEmbedding.dimensions).toBe(384);
      expect(boardEmbedding.vector).toHaveLength(384);
      expect(similar).toBeGreaterThan(0.75);
      expect(unrelated).toBeLessThan(similar);
    } finally {
      await embeddings.dispose();
    }
  }, 30_000);
});

describe.skipIf(hasLocalEmbeddingModel(modelPath))("local embeddings model setup", () => {
  it("documents the missing local GGUF path", () => {
    expect(hasLocalEmbeddingModel(modelPath)).toBe(false);
  });
});
