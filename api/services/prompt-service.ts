import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { DatabaseClient } from "../db/client.js";
import {
  promptCategories,
  promptCategoryLinks,
  prompts,
  type Prompt,
} from "../db/schema.js";
import { ApiError } from "../http/errors.js";
import {
  defaultPromptCategories,
  defaultPrompts,
} from "../models/default-prompts.js";
import type {
  PromptCategoryCreateInput,
  PromptCategoryUpdateInput,
  PromptCreateInput,
  PromptListQuery,
  PromptUpdateInput,
} from "../models/request-schemas.js";

export interface PromptWithCategories {
  prompt: Prompt;
  categoryIds: string[];
}

export class PromptService {
  private readonly db: DatabaseClient["db"];

  constructor(databaseClient: DatabaseClient) {
    this.db = databaseClient.db;
  }

  listCategories() {
    return this.db
      .select()
      .from(promptCategories)
      .orderBy(asc(promptCategories.position), asc(promptCategories.name))
      .all();
  }

  createCategory(input: PromptCategoryCreateInput) {
    this.ensureCategoryNameAvailable(input.name);
    return this.db
      .insert(promptCategories)
      .values({
        name: input.name,
        description: input.description,
        position: this.nextCategoryPosition(),
        metadata: input.metadata,
      })
      .returning()
      .get();
  }

  getCategory(categoryId: string) {
    const category = this.db
      .select()
      .from(promptCategories)
      .where(eq(promptCategories.id, categoryId))
      .get();

    if (!category) {
      throw new ApiError(404, "not_found", "Prompt category not found");
    }

    return category;
  }

  updateCategory(categoryId: string, input: PromptCategoryUpdateInput) {
    this.getCategory(categoryId);
    if (input.name) {
      this.ensureCategoryNameAvailable(input.name, categoryId);
    }
    return this.db
      .update(promptCategories)
      .set(input)
      .where(eq(promptCategories.id, categoryId))
      .returning()
      .get();
  }

  deleteCategory(categoryId: string) {
    const category = this.getCategory(categoryId);
    this.db
      .delete(promptCategories)
      .where(eq(promptCategories.id, categoryId))
      .run();
    return category;
  }

  reorderCategory(categoryId: string, position: number) {
    this.getCategory(categoryId);

    this.db.transaction((tx) => {
      const rows = tx
        .select({ id: promptCategories.id, position: promptCategories.position })
        .from(promptCategories)
        .orderBy(asc(promptCategories.position), asc(promptCategories.name))
        .all();

      const ordered = orderWithMovedId(
        rows.map((row) => row.id),
        categoryId,
        position,
      );

      for (const [index, id] of ordered.entries()) {
        if (rows.find((row) => row.id === id)?.position === index) {
          continue;
        }
        tx
          .update(promptCategories)
          .set({ position: index })
          .where(eq(promptCategories.id, id))
          .run();
      }
    });

    return this.getCategory(categoryId);
  }

  listPrompts(query: PromptListQuery = {}): PromptWithCategories[] {
    let rows = this.db
      .select()
      .from(prompts)
      .orderBy(asc(prompts.position), asc(prompts.name))
      .all();

    const linksByPromptId = this.linksByPromptId();

    if (query.categoryId) {
      this.getCategory(query.categoryId);
      rows = rows.filter((prompt) =>
        (linksByPromptId.get(prompt.id) ?? []).includes(query.categoryId!),
      );
    }

    if (query.q) {
      const needle = query.q.toLowerCase();
      rows = rows.filter(
        (prompt) =>
          prompt.name.toLowerCase().includes(needle) ||
          prompt.body.toLowerCase().includes(needle),
      );
    }

    return rows.map((prompt) => ({
      prompt,
      categoryIds: linksByPromptId.get(prompt.id) ?? [],
    }));
  }

  getPrompt(promptId: string): PromptWithCategories {
    const prompt = this.db
      .select()
      .from(prompts)
      .where(eq(prompts.id, promptId))
      .get();

    if (!prompt) {
      throw new ApiError(404, "not_found", "Prompt not found");
    }

    return { prompt, categoryIds: this.categoryIdsForPrompt(promptId) };
  }

  createPrompt(input: PromptCreateInput): PromptWithCategories {
    const categoryIds = this.resolveCategoryIds(input.categoryIds);
    const created = this.db.transaction((tx) => {
      const prompt = tx
        .insert(prompts)
        .values({
          name: input.name,
          body: input.body,
          note: input.note,
          position: this.nextPromptPosition(),
          metadata: input.metadata,
        })
        .returning()
        .get();
      this.insertLinks(tx, prompt.id, categoryIds);
      return prompt;
    });

    return { prompt: created, categoryIds };
  }

  updatePrompt(promptId: string, input: PromptUpdateInput): PromptWithCategories {
    this.getPrompt(promptId);
    const { categoryIds, ...fields } = input;
    const resolvedCategoryIds =
      categoryIds === undefined ? undefined : this.resolveCategoryIds(categoryIds);

    const updated = this.db.transaction((tx) => {
      const prompt =
        Object.keys(fields).length > 0
          ? tx
              .update(prompts)
              .set(fields)
              .where(eq(prompts.id, promptId))
              .returning()
              .get()
          : tx.select().from(prompts).where(eq(prompts.id, promptId)).get()!;

      if (resolvedCategoryIds !== undefined) {
        tx
          .delete(promptCategoryLinks)
          .where(eq(promptCategoryLinks.promptId, promptId))
          .run();
        this.insertLinks(tx, promptId, resolvedCategoryIds);
      }

      return prompt;
    });

    return {
      prompt: updated,
      categoryIds: resolvedCategoryIds ?? this.categoryIdsForPrompt(promptId),
    };
  }

  deletePrompt(promptId: string): PromptWithCategories {
    const existing = this.getPrompt(promptId);
    this.db.delete(prompts).where(eq(prompts.id, promptId)).run();
    return existing;
  }

  // Prompts carry one global order. A category view is a projection of it, so
  // reordering from inside a category still rewrites the single list.
  reorderPrompt(promptId: string, position: number): PromptWithCategories {
    this.getPrompt(promptId);

    this.db.transaction((tx) => {
      const rows = tx
        .select({ id: prompts.id, position: prompts.position })
        .from(prompts)
        .orderBy(asc(prompts.position), asc(prompts.name))
        .all();

      const ordered = orderWithMovedId(
        rows.map((row) => row.id),
        promptId,
        position,
      );

      for (const [index, id] of ordered.entries()) {
        if (rows.find((row) => row.id === id)?.position === index) {
          continue;
        }
        tx
          .update(prompts)
          .set({ position: index })
          .where(eq(prompts.id, id))
          .run();
      }
    });

    return this.getPrompt(promptId);
  }

  recordPromptUse(promptId: string): PromptWithCategories {
    this.getPrompt(promptId);
    const prompt = this.db
      .update(prompts)
      .set({
        usageCount: sql`${prompts.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(prompts.id, promptId))
      .returning()
      .get();

    return { prompt, categoryIds: this.categoryIdsForPrompt(promptId) };
  }

  // Reconciles system-owned rows to the shipped defaults while preserving
  // user-created prompts and categories. Same-named user rows are adopted so
  // databases created before a default key was introduced do not get duplicates.
  restoreDefaults() {
    const restored = new Set<string>();

    this.db.transaction((tx) => {
      const categoryKeys = new Set(
        defaultPromptCategories.map((seed) => seed.defaultKey),
      );
      const promptKeys = new Set(defaultPrompts.map((seed) => seed.defaultKey));

      for (const prompt of tx.select().from(prompts).all()) {
        if (prompt.defaultKey && !promptKeys.has(prompt.defaultKey)) {
          tx.delete(prompts).where(eq(prompts.id, prompt.id)).run();
          restored.add(`removed:prompt:${prompt.defaultKey}`);
        }
      }

      for (const category of tx.select().from(promptCategories).all()) {
        if (category.defaultKey && !categoryKeys.has(category.defaultKey)) {
          tx
            .delete(promptCategories)
            .where(eq(promptCategories.id, category.id))
            .run();
          restored.add(`removed:category:${category.defaultKey}`);
        }
      }

      const categoryIdsByDefaultKey = new Map<string, string>();

      for (const seed of defaultPromptCategories) {
        let category = tx
          .select()
          .from(promptCategories)
          .where(eq(promptCategories.defaultKey, seed.defaultKey))
          .get();
        const byName = tx
          .select()
          .from(promptCategories)
          .where(eq(promptCategories.name, seed.name))
          .get();

        if (category && byName && category.id !== byName.id) {
          // Preserve links from custom prompts before replacing an edited
          // system category with the user row that owns the canonical name.
          const oldLinks = tx
            .select()
            .from(promptCategoryLinks)
            .where(eq(promptCategoryLinks.categoryId, category.id))
            .all();
          const replacementLinks = tx
            .select()
            .from(promptCategoryLinks)
            .where(eq(promptCategoryLinks.categoryId, byName.id))
            .all();
          for (const link of oldLinks) {
            if (
              replacementLinks.some(
                (candidate) => candidate.promptId === link.promptId,
              )
            ) {
              continue;
            }
            tx.insert(promptCategoryLinks)
              .values({
                promptId: link.promptId,
                categoryId: byName.id,
                position: link.position,
              })
              .run();
          }
          tx
            .delete(promptCategories)
            .where(eq(promptCategories.id, category.id))
            .run();
          category = byName;
        }

        category ??= byName;
        if (!category) {
          category = tx
            .insert(promptCategories)
            .values({
              name: seed.name,
              description: seed.description,
              position: seed.position,
              defaultKey: seed.defaultKey,
            })
            .returning()
            .get();
          restored.add(`category:${seed.defaultKey}`);
        } else if (
          category.name !== seed.name ||
          category.description !== seed.description ||
          category.position !== seed.position ||
          category.defaultKey !== seed.defaultKey
        ) {
          category = tx
            .update(promptCategories)
            .set({
              name: seed.name,
              description: seed.description,
              position: seed.position,
              defaultKey: seed.defaultKey,
            })
            .where(eq(promptCategories.id, category.id))
            .returning()
            .get();
          restored.add(`category:${seed.defaultKey}`);
        }

        categoryIdsByDefaultKey.set(seed.defaultKey, category.id);
      }

      for (const seed of defaultPrompts) {
        let prompt = tx
          .select()
          .from(prompts)
          .where(eq(prompts.defaultKey, seed.defaultKey))
          .get();
        prompt ??= tx
          .select()
          .from(prompts)
          .where(eq(prompts.name, seed.name))
          .orderBy(asc(prompts.position), asc(prompts.id))
          .get();

        if (!prompt) {
          prompt = tx
            .insert(prompts)
            .values({
              name: seed.name,
              body: seed.body,
              note: seed.note,
              position: seed.position,
              defaultKey: seed.defaultKey,
            })
            .returning()
            .get();
          restored.add(`prompt:${seed.defaultKey}`);
        } else if (
          prompt.name !== seed.name ||
          prompt.body !== seed.body ||
          prompt.note !== seed.note ||
          prompt.position !== seed.position ||
          prompt.defaultKey !== seed.defaultKey
        ) {
          prompt = tx
            .update(prompts)
            .set({
              name: seed.name,
              body: seed.body,
              note: seed.note,
              position: seed.position,
              defaultKey: seed.defaultKey,
            })
            .where(eq(prompts.id, prompt.id))
            .returning()
            .get();
          restored.add(`prompt:${seed.defaultKey}`);
        }

        const categoryIds = seed.categoryDefaultKeys
          .map((key) => categoryIdsByDefaultKey.get(key))
          .filter((value): value is string => Boolean(value));
        const existingCategoryIds = tx
          .select({ categoryId: promptCategoryLinks.categoryId })
          .from(promptCategoryLinks)
          .where(eq(promptCategoryLinks.promptId, prompt.id))
          .orderBy(asc(promptCategoryLinks.position))
          .all()
          .map((link) => link.categoryId);
        if (
          existingCategoryIds.length !== categoryIds.length ||
          existingCategoryIds.some((id, index) => id !== categoryIds[index])
        ) {
          tx
            .delete(promptCategoryLinks)
            .where(eq(promptCategoryLinks.promptId, prompt.id))
            .run();
          this.insertLinks(tx, prompt.id, categoryIds);
          restored.add(`prompt:${seed.defaultKey}`);
        }
      }

      const orderedCategoryRows = tx
        .select()
        .from(promptCategories)
        .orderBy(asc(promptCategories.position), asc(promptCategories.name))
        .all();
      const categoryPositions = new Map(
        orderedCategoryRows.map((category) => [category.id, category.position]),
      );
      const orderedCategoryIds = [
        ...defaultPromptCategories.map(
          (seed) => categoryIdsByDefaultKey.get(seed.defaultKey)!,
        ),
        ...orderedCategoryRows
          .filter((category) => category.defaultKey === null)
          .map((category) => category.id),
      ];
      orderedCategoryIds.forEach((id, position) => {
        if (categoryPositions.get(id) === position) {
          return;
        }
        tx
          .update(promptCategories)
          .set({ position })
          .where(eq(promptCategories.id, id))
          .run();
      });

      const orderedPromptRows = tx
        .select()
        .from(prompts)
        .orderBy(asc(prompts.position), asc(prompts.name))
        .all();
      const promptIdsByDefaultKey = new Map(
        orderedPromptRows
          .filter((prompt) => prompt.defaultKey !== null)
          .map((prompt) => [prompt.defaultKey!, prompt.id]),
      );
      const orderedPromptIds = [
        ...defaultPrompts.map(
          (seed) => promptIdsByDefaultKey.get(seed.defaultKey)!,
        ),
        ...orderedPromptRows
          .filter((prompt) => prompt.defaultKey === null)
          .map((prompt) => prompt.id),
      ];
      orderedPromptIds.forEach((id, position) => {
        if (
          orderedPromptRows.find((prompt) => prompt.id === id)?.position ===
          position
        ) {
          return;
        }
        tx.update(prompts).set({ position }).where(eq(prompts.id, id)).run();
      });
    });

    return {
      restored: [...restored],
      categories: this.listCategories(),
      prompts: this.listPrompts(),
    };
  }

  private linksByPromptId() {
    const links = this.db
      .select()
      .from(promptCategoryLinks)
      .orderBy(asc(promptCategoryLinks.position))
      .all();

    const byPromptId = new Map<string, string[]>();
    for (const link of links) {
      const categoryIds = byPromptId.get(link.promptId) ?? [];
      categoryIds.push(link.categoryId);
      byPromptId.set(link.promptId, categoryIds);
    }
    return byPromptId;
  }

  private categoryIdsForPrompt(promptId: string) {
    return this.db
      .select({ categoryId: promptCategoryLinks.categoryId })
      .from(promptCategoryLinks)
      .where(eq(promptCategoryLinks.promptId, promptId))
      .orderBy(asc(promptCategoryLinks.position))
      .all()
      .map((link) => link.categoryId);
  }

  private resolveCategoryIds(categoryIds: string[] | undefined) {
    const unique = [...new Set(categoryIds ?? [])];
    for (const categoryId of unique) {
      this.getCategory(categoryId);
    }
    return unique;
  }

  private insertLinks(
    tx: Parameters<Parameters<DatabaseClient["db"]["transaction"]>[0]>[0],
    promptId: string,
    categoryIds: string[],
  ) {
    categoryIds.forEach((categoryId, index) => {
      tx
        .insert(promptCategoryLinks)
        .values({ promptId, categoryId, position: index })
        .run();
    });
  }

  private nextPromptPosition(
    tx?: Parameters<Parameters<DatabaseClient["db"]["transaction"]>[0]>[0],
  ) {
    const row = (tx ?? this.db)
      .select({ max: sql<number | null>`MAX(${prompts.position})` })
      .from(prompts)
      .get();
    return (row?.max ?? -1) + 1;
  }

  private nextCategoryPosition() {
    const row = this.db
      .select({ max: sql<number | null>`MAX(${promptCategories.position})` })
      .from(promptCategories)
      .get();
    return (row?.max ?? -1) + 1;
  }

  private ensureCategoryNameAvailable(name: string, exceptCategoryId?: string) {
    const existing = exceptCategoryId
      ? this.db
          .select({ id: promptCategories.id })
          .from(promptCategories)
          .where(
            and(
              eq(promptCategories.name, name),
              ne(promptCategories.id, exceptCategoryId),
            ),
          )
          .get()
      : this.db
          .select({ id: promptCategories.id })
          .from(promptCategories)
          .where(eq(promptCategories.name, name))
          .get();

    if (existing) {
      throw new ApiError(409, "invalid_state", "Prompt category name already exists");
    }
  }
}

// `position` is resolved against the list with the moved row already taken
// out, so dropping onto a row takes that row's slot whether the drag went up
// or down. Writing the whole list back as 0..n-1 also heals the gaps that
// deletes and restore-defaults leave behind.
function orderWithMovedId(ids: string[], movedId: string, position: number) {
  const rest = ids.filter((id) => id !== movedId);
  rest.splice(Math.max(0, Math.min(position, rest.length)), 0, movedId);
  return rest;
}
