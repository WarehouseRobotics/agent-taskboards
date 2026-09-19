import type { Prompt, PromptCategory } from "../../domain/types";

export interface PromptGroup {
  category: PromptCategory | null;
  prompts: Prompt[];
}

// Groups prompts by category in category order; prompts with no category
// come last as the root-level group (category: null). A prompt linked to
// several categories appears in each of them.
export function groupPromptsByCategory(
  prompts: Prompt[],
  categories: PromptCategory[],
): PromptGroup[] {
  const groups: PromptGroup[] = categories.map((category) => ({
    category,
    prompts: prompts.filter((prompt) => prompt.categoryIds.includes(category.id)),
  }));

  const rootLevel = prompts.filter((prompt) => prompt.categoryIds.length === 0);
  if (rootLevel.length > 0) {
    groups.push({ category: null, prompts: rootLevel });
  }

  return groups.filter((group) => group.category !== null || group.prompts.length > 0);
}

export function recentPrompts(prompts: Prompt[], limit: number): Prompt[] {
  return prompts
    .filter((prompt) => prompt.lastUsedAt !== null)
    .sort((a, b) => new Date(b.lastUsedAt!).getTime() - new Date(a.lastUsedAt!).getTime())
    .slice(0, Math.max(0, limit));
}

export function filterPrompts(prompts: Prompt[], query: string): Prompt[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return prompts;
  }

  return prompts.filter(
    (prompt) =>
      prompt.name.toLowerCase().includes(needle) ||
      prompt.body.toLowerCase().includes(needle),
  );
}

export function promptCountByCategory(prompts: Prompt[]): Map<string | null, number> {
  const counts = new Map<string | null, number>();
  for (const prompt of prompts) {
    if (prompt.categoryIds.length === 0) {
      counts.set(null, (counts.get(null) ?? 0) + 1);
      continue;
    }
    for (const categoryId of prompt.categoryIds) {
      counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
    }
  }
  return counts;
}
