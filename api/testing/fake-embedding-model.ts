import type { EmbeddingModel } from "../services/search-service.js";

export function createFakeEmbeddingModel(): EmbeddingModel {
  return {
    async embed(text: string) {
      const lower = text.toLowerCase();
      const vector = Array.from({ length: 384 }, () => 0);
      const keywords = [
        "sqlite",
        "migration",
        "vector",
        "search",
        "board",
        "task",
        "comment",
        "blocked",
        "api",
        "starter",
        "navigation",
      ];

      for (const [index, keyword] of keywords.entries()) {
        if (lower.includes(keyword)) {
          vector[index] = 1;
        }
      }

      vector[383] = 0.01;

      return {
        modelPath: "fake-test-embedding-model",
        dimensions: 384,
        vector,
      };
    },
  };
}
