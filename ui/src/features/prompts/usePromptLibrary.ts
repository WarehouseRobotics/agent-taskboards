import { useCallback, useEffect, useState } from "react";
import type { Prompt, PromptCategory } from "../../domain/types";
import { api } from "../../lib/api";
import { apiMessage } from "../../lib/errors";

export interface PromptLibrary {
  categories: PromptCategory[];
  prompts: Prompt[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createCategory: (input: { name: string; description?: string | null }) => Promise<PromptCategory>;
  updateCategory: (
    categoryId: string,
    input: { name?: string; description?: string | null },
  ) => Promise<PromptCategory>;
  deleteCategory: (categoryId: string) => Promise<void>;
  createPrompt: (input: { name: string; body: string; categoryIds?: string[] }) => Promise<Prompt>;
  updatePrompt: (
    promptId: string,
    input: { name?: string; body?: string; categoryIds?: string[] },
  ) => Promise<Prompt>;
  deletePrompt: (promptId: string) => Promise<void>;
  recordPromptUse: (promptId: string) => Promise<void>;
  restoreDefaults: () => Promise<string[]>;
}

export function usePromptLibrary(): PromptLibrary {
  const [categories, setCategories] = useState<PromptCategory[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [nextCategories, nextPrompts] = await Promise.all([
        api.listPromptCategories(),
        api.listPrompts(),
      ]);
      setCategories(nextCategories);
      setPrompts(nextPrompts);
    } catch (cause) {
      setError(apiMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createCategory = useCallback(
    async (input: { name: string; description?: string | null }) => {
      const category = await api.createPromptCategory(input);
      await reload();
      return category;
    },
    [reload],
  );

  const updateCategory = useCallback(
    async (
      categoryId: string,
      input: { name?: string; description?: string | null },
    ) => {
      const category = await api.updatePromptCategory(categoryId, input);
      await reload();
      return category;
    },
    [reload],
  );

  const deleteCategory = useCallback(
    async (categoryId: string) => {
      await api.deletePromptCategory(categoryId);
      await reload();
    },
    [reload],
  );

  const createPrompt = useCallback(
    async (input: { name: string; body: string; categoryIds?: string[] }) => {
      const prompt = await api.createPrompt(input);
      await reload();
      return prompt;
    },
    [reload],
  );

  const updatePrompt = useCallback(
    async (
      promptId: string,
      input: { name?: string; body?: string; categoryIds?: string[] },
    ) => {
      const prompt = await api.updatePrompt(promptId, input);
      await reload();
      return prompt;
    },
    [reload],
  );

  const deletePrompt = useCallback(
    async (promptId: string) => {
      await api.deletePrompt(promptId);
      await reload();
    },
    [reload],
  );

  const recordPromptUse = useCallback(async (promptId: string) => {
    const prompt = await api.recordPromptUse(promptId);
    setPrompts((current) =>
      current.map((item) => (item.id === prompt.id ? prompt : item)),
    );
  }, []);

  const restoreDefaults = useCallback(async () => {
    const result = await api.restorePromptDefaults();
    setCategories(result.categories);
    setPrompts(result.prompts);
    return result.restored;
  }, []);

  return {
    categories,
    prompts,
    loading,
    error,
    reload,
    createCategory,
    updateCategory,
    deleteCategory,
    createPrompt,
    updatePrompt,
    deletePrompt,
    recordPromptUse,
    restoreDefaults,
  };
}
