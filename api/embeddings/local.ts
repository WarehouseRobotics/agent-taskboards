import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  getLlama,
  LlamaEmbeddingContext,
  LlamaLogLevel,
  LlamaModel,
} from "node-llama-cpp";

export const DEFAULT_EMBEDDING_MODEL_FILENAME = "bge-small-en-v1.5-f32.gguf";

export type LocalEmbeddingModelOptions = {
  modelPath?: string;
  contextSize?: number;
  threads?: number;
};

export type EmbeddingResult = {
  modelPath: string;
  dimensions: number;
  vector: readonly number[];
};

export function getDefaultEmbeddingModelPath(): string {
  return resolve(
    process.env.TASKBOARDS_EMBEDDING_MODEL_PATH ??
      join("models-gguf", DEFAULT_EMBEDDING_MODEL_FILENAME),
  );
}

export function hasLocalEmbeddingModel(
  modelPath = getDefaultEmbeddingModelPath(),
): boolean {
  return existsSync(modelPath);
}

export class LocalEmbeddingModel {
  readonly modelPath: string;
  readonly contextSize: number;
  readonly threads: number;

  #model: LlamaModel | undefined;
  #context: LlamaEmbeddingContext | undefined;

  constructor(options: LocalEmbeddingModelOptions = {}) {
    this.modelPath = resolve(options.modelPath ?? getDefaultEmbeddingModelPath());
    this.contextSize = options.contextSize ?? 512;
    this.threads = options.threads ?? 2;
  }

  get dimensions(): number | undefined {
    return this.#model?.embeddingVectorSize;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const context = await this.#getContext();
    const embedding = await context.getEmbeddingFor(text);

    return {
      modelPath: this.modelPath,
      dimensions: embedding.vector.length,
      vector: embedding.vector,
    };
  }

  async similarity(left: string, right: string): Promise<number> {
    const context = await this.#getContext();
    const leftEmbedding = await context.getEmbeddingFor(left);
    const rightEmbedding = await context.getEmbeddingFor(right);

    return leftEmbedding.calculateCosineSimilarity(rightEmbedding);
  }

  async dispose(): Promise<void> {
    await this.#context?.dispose();
    await this.#model?.dispose();
    this.#context = undefined;
    this.#model = undefined;
  }

  async #getContext(): Promise<LlamaEmbeddingContext> {
    if (this.#context) {
      return this.#context;
    }

    if (!hasLocalEmbeddingModel(this.modelPath)) {
      throw new Error(`Embedding model file was not found at ${this.modelPath}`);
    }

    const llama = await getLlama({
      build: "never",
      gpu: false,
      logLevel: LlamaLogLevel.error,
      skipDownload: true,
    });

    const model = await llama.loadModel({
      gpuLayers: 0,
      modelPath: this.modelPath,
    });

    try {
      const context = await model.createEmbeddingContext({
        contextSize: this.contextSize,
        threads: this.threads,
      });

      this.#model = model;
      this.#context = context;
      return context;
    } catch (error) {
      await model.dispose();
      throw error;
    }
  }
}
