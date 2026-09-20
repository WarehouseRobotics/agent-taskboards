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

  // Re-creates any missing default rows, keyed on defaultKey. Existing rows
  // (including edited defaults) are left untouched, so the call is idempotent.
  restoreDefaults() {
    const restored: string[] = [];

    this.db.transaction((tx) => {
      const categoryIdsByDefaultKey = new Map<string, string>();
      const createdCategoryKeys = new Set<string>();

      for (const seed of defaultPromptCategories) {
        const byDefaultKey = tx
          .select()
          .from(promptCategories)
          .where(eq(promptCategories.defaultKey, seed.defaultKey))
          .get();
        if (byDefaultKey) {
          categoryIdsByDefaultKey.set(seed.defaultKey, byDefaultKey.id);
          continue;
        }

        // A user-created category may already own the default name; adopt it
        // for linking instead of violating the unique name constraint.
        const byName = tx
          .select()
          .from(promptCategories)
          .where(eq(promptCategories.name, seed.name))
          .get();
        if (byName) {
          categoryIdsByDefaultKey.set(seed.defaultKey, byName.id);
          continue;
        }

        const created = tx
          .insert(promptCategories)
          .values({
            name: seed.name,
            description: seed.description,
            position: seed.position,
            defaultKey: seed.defaultKey,
          })
          .returning()
          .get();
        categoryIdsByDefaultKey.set(seed.defaultKey, created.id);
        createdCategoryKeys.add(seed.defaultKey);
        restored.push(`category:${seed.defaultKey}`);
      }

      for (const seed of defaultPrompts) {
        const existing = tx
          .select()
          .from(prompts)
          .where(eq(prompts.defaultKey, seed.defaultKey))
          .get();
        if (existing) {
          // Deleting a default category cascades its links away. When this
          // call recreates that category, relink the surviving default
          // prompts to it; links to pre-existing categories stay untouched
          // so intentional unlinking is preserved.
          const relinkKeys = seed.categoryDefaultKeys.filter((key) =>
            createdCategoryKeys.has(key),
          );
          if (relinkKeys.length > 0) {
            const existingLinks = tx
              .select()
              .from(promptCategoryLinks)
              .where(eq(promptCategoryLinks.promptId, existing.id))
              .all();
            let position =
              existingLinks.reduce((max, link) => Math.max(max, link.position), -1) + 1;
            for (const key of relinkKeys) {
              const categoryId = categoryIdsByDefaultKey.get(key);
              if (
                !categoryId ||
                existingLinks.some((link) => link.categoryId === categoryId)
              ) {
                continue;
              }
              tx
                .insert(promptCategoryLinks)
                .values({ promptId: existing.id, categoryId, position: position++ })
                .run();
              restored.push(`link:${seed.defaultKey}:${key}`);
            }
          }
          continue;
        }

        const created = tx
          .insert(prompts)
          .values({
            name: seed.name,
            body: seed.body,
            position: this.nextPromptPosition(tx),
            defaultKey: seed.defaultKey,
          })
          .returning()
          .get();
        const categoryIds = seed.categoryDefaultKeys
          .map((key) => categoryIdsByDefaultKey.get(key))
          .filter((value): value is string => Boolean(value));
        this.insertLinks(tx, created.id, categoryIds);
        restored.push(`prompt:${seed.defaultKey}`);
      }
    });

    return {
      restored,
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
