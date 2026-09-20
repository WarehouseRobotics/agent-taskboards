import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import {
  promptCategories,
  promptCategoryLinks,
  prompts,
} from "../db/schema.js";
import { ApiError } from "../http/errors.js";
import {
  defaultPromptCategories,
  defaultPrompts,
} from "../models/default-prompts.js";
import { PromptService } from "./prompt-service.js";

describe("PromptService", () => {
  let tmpDir: string;
  let client: DatabaseClient;
  let service: PromptService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "taskboards-prompts-"));
    const databasePath = join(tmpDir, "test.sqlite");
    runMigrations({
      databasePath,
      migrationsDir: resolve(process.cwd(), "drizzle"),
    });
    client = createDatabaseClient(databasePath);
    service = new PromptService(client);
  });

  afterEach(() => {
    client.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const promptIds = () => service.listPrompts().map(({ prompt }) => prompt.id);

  const expectContiguousPromptPositions = () => {
    expect(
      service.listPrompts().map(({ prompt }) => prompt.position),
    ).toEqual(service.listPrompts().map((_, index) => index));
  };

  it("seeds defaults from the migration that match default-prompts.ts", () => {
    const categories = service.listCategories();
    expect(categories.map((category) => category.defaultKey)).toEqual(
      defaultPromptCategories.map((seed) => seed.defaultKey),
    );
    for (const seed of defaultPromptCategories) {
      const category = categories.find(
        (item) => item.defaultKey === seed.defaultKey,
      );
      expect(category?.name).toBe(seed.name);
      expect(category?.description).toBe(seed.description);
      expect(category?.position).toBe(seed.position);
    }

    const seeded = service.listPrompts();
    expect(seeded.map(({ prompt }) => prompt.defaultKey)).toEqual(
      defaultPrompts.map((seed) => seed.defaultKey),
    );
    for (const seed of defaultPrompts) {
      const match = seeded.find(
        ({ prompt }) => prompt.defaultKey === seed.defaultKey,
      );
      expect(match?.prompt.name).toBe(seed.name);
      expect(match?.prompt.body).toBe(seed.body);
      expect(match?.prompt.position).toBe(seed.position);
      expect(match?.prompt.usageCount).toBe(0);
      expect(match?.prompt.note).toBe(seed.note);
      const expectedCategoryIds = seed.categoryDefaultKeys.map(
        (key) => categories.find((category) => category.defaultKey === key)!.id,
      );
      expect(match?.categoryIds).toEqual(expectedCategoryIds);
    }
  });

  it("creates, updates, and rejects duplicate categories", () => {
    const category = service.createCategory({ name: "🚀 Release" });
    expect(category.position).toBeGreaterThan(0);

    expect(() => service.createCategory({ name: "🚀 Release" })).toThrowError(
      ApiError,
    );

    const updated = service.updateCategory(category.id, {
      description: "Release prompts",
    });
    expect(updated.description).toBe("Release prompts");
    expect(() =>
      service.updateCategory(category.id, { name: "Planning" }),
    ).toThrowError(ApiError);
  });

  it("creates prompts with and without categories and lists by filters", () => {
    const category = service.createCategory({ name: "Review" });
    const inCategory = service.createPrompt({
      name: "Review checklist",
      body: "Check {{TASK}} carefully.",
      categoryIds: [category.id],
    });
    const rootLevel = service.createPrompt({
      name: "Root prompt",
      body: "No category here.",
    });

    expect(inCategory.categoryIds).toEqual([category.id]);
    expect(rootLevel.categoryIds).toEqual([]);

    const byCategory = service.listPrompts({ categoryId: category.id });
    expect(byCategory.map(({ prompt }) => prompt.id)).toEqual([
      inCategory.prompt.id,
    ]);

    const byQuery = service.listPrompts({ q: "no category" });
    expect(byQuery.map(({ prompt }) => prompt.id)).toEqual([
      rootLevel.prompt.id,
    ]);

    expect(() =>
      service.createPrompt({
        name: "Broken",
        body: "x",
        categoryIds: ["missing-category"],
      }),
    ).toThrowError(ApiError);
  });

  it("stores, updates, and clears an author note", () => {
    const created = service.createPrompt({
      name: "Noted",
      body: "body",
      note: "Use this before opening a PR.",
    });
    expect(created.prompt.note).toBe("Use this before opening a PR.");

    const withoutNote = service.createPrompt({ name: "Plain", body: "body" });
    expect(withoutNote.prompt.note).toBeNull();

    const updated = service.updatePrompt(created.prompt.id, {
      note: "Updated guidance.",
    });
    expect(updated.prompt.note).toBe("Updated guidance.");
    expect(updated.prompt.name).toBe("Noted");

    const cleared = service.updatePrompt(created.prompt.id, { note: null });
    expect(cleared.prompt.note).toBeNull();
  });

  it("replaces the category link set only when categoryIds is supplied", () => {
    const categoryA = service.createCategory({ name: "A" });
    const categoryB = service.createCategory({ name: "B" });
    const created = service.createPrompt({
      name: "Multi",
      body: "body",
      categoryIds: [categoryA.id],
    });

    const renamed = service.updatePrompt(created.prompt.id, {
      name: "Multi renamed",
    });
    expect(renamed.prompt.name).toBe("Multi renamed");
    expect(renamed.categoryIds).toEqual([categoryA.id]);

    const relinked = service.updatePrompt(created.prompt.id, {
      categoryIds: [categoryB.id, categoryA.id],
    });
    expect(relinked.categoryIds).toEqual([categoryB.id, categoryA.id]);

    const cleared = service.updatePrompt(created.prompt.id, {
      categoryIds: [],
    });
    expect(cleared.categoryIds).toEqual([]);
  });

  it("keeps prompts when their category is deleted", () => {
    const category = service.createCategory({ name: "Ephemeral" });
    const created = service.createPrompt({
      name: "Survivor",
      body: "body",
      categoryIds: [category.id],
    });

    service.deleteCategory(category.id);

    const survivor = service.getPrompt(created.prompt.id);
    expect(survivor.categoryIds).toEqual([]);
    expect(
      client.db.select().from(promptCategoryLinks).all().filter(
        (link) => link.categoryId === category.id,
      ),
    ).toEqual([]);
  });

  it("hard-deletes prompts and cascades their links", () => {
    const category = service.createCategory({ name: "Holder" });
    const created = service.createPrompt({
      name: "Doomed",
      body: "body",
      categoryIds: [category.id],
    });

    service.deletePrompt(created.prompt.id);

    expect(() => service.getPrompt(created.prompt.id)).toThrowError(ApiError);
    expect(
      client.db
        .select()
        .from(promptCategoryLinks)
        .all()
        .filter((link) => link.promptId === created.prompt.id),
    ).toEqual([]);
  });

  it("records prompt usage", () => {
    const created = service.createPrompt({ name: "Used", body: "body" });
    expect(created.prompt.usageCount).toBe(0);
    expect(created.prompt.lastUsedAt).toBeNull();

    const once = service.recordPromptUse(created.prompt.id);
    const twice = service.recordPromptUse(created.prompt.id);

    expect(once.prompt.usageCount).toBe(1);
    expect(twice.prompt.usageCount).toBe(2);
    expect(twice.prompt.lastUsedAt).toBeInstanceOf(Date);
  });

  it("reorders a prompt within the single global order", () => {
    const first = service.createPrompt({ name: "First", body: "body" }).prompt;
    const second = service.createPrompt({ name: "Second", body: "body" }).prompt;
    const seeded = promptIds().filter(
      (id) => id !== first.id && id !== second.id,
    );

    service.reorderPrompt(second.id, 0);
    expect(promptIds()).toEqual([second.id, ...seeded, first.id]);
    expectContiguousPromptPositions();

    // Past the end clamps instead of leaving a hole.
    service.reorderPrompt(second.id, 99);
    expect(promptIds()).toEqual([...seeded, first.id, second.id]);
    expectContiguousPromptPositions();
  });

  it("gives the moved prompt the target's slot when dragging downwards", () => {
    const ids = promptIds();
    const [top, , third] = ids;

    // `position` counts the list without the moved row, so dropping the top
    // prompt onto the third one lands on the third slot, not the second.
    service.reorderPrompt(top, ids.indexOf(third));

    expect(promptIds()).toEqual([ids[1], third, top, ...ids.slice(3)]);
  });

  it("renormalizes gapped positions on the first reorder", () => {
    const ids = promptIds();
    for (const [index, id] of ids.entries()) {
      client.db
        .update(prompts)
        .set({ position: index * 3 })
        .where(eq(prompts.id, id))
        .run();
    }

    service.reorderPrompt(ids[2], 0);

    expect(promptIds()).toEqual([ids[2], ids[0], ids[1], ...ids.slice(3)]);
    expectContiguousPromptPositions();
  });

  it("leaves usage counters untouched when reordering", () => {
    const created = service.createPrompt({ name: "Unused", body: "body" }).prompt;
    service.recordPromptUse(created.id);
    const before = service.getPrompt(created.id).prompt;

    const after = service.reorderPrompt(created.id, 0).prompt;

    expect(after.usageCount).toBe(before.usageCount);
    expect(after.lastUsedAt).toEqual(before.lastUsedAt);
  });

  it("reorders categories independently of prompts", () => {
    const category = service.createCategory({ name: "🚀 Release" });
    const seeded = service
      .listCategories()
      .filter((item) => item.id !== category.id)
      .map((item) => item.id);
    const promptOrderBefore = promptIds();

    service.reorderCategory(category.id, 0);

    expect(service.listCategories().map((item) => item.id)).toEqual([
      category.id,
      ...seeded,
    ]);
    expect(
      service.listCategories().map((item) => item.position),
    ).toEqual([0, ...seeded.map((_, index) => index + 1)]);
    expect(promptIds()).toEqual(promptOrderBefore);
  });

  it("rejects reordering an unknown prompt or category", () => {
    expect(() => service.reorderPrompt("missing-prompt", 0)).toThrowError(
      ApiError,
    );
    expect(() => service.reorderCategory("missing-category", 0)).toThrowError(
      ApiError,
    );
  });

  it("restores deleted defaults idempotently", () => {
    const noop = service.restoreDefaults();
    expect(noop.restored).toEqual([]);

    const seeded = service.listPrompts();
    const target = seeded.find(
      ({ prompt }) => prompt.defaultKey === "umbrella-implement",
    )!;
    service.deletePrompt(target.prompt.id);

    const restored = service.restoreDefaults();
    expect(restored.restored).toEqual(["prompt:umbrella-implement"]);

    const after = service
      .listPrompts()
      .find(({ prompt }) => prompt.defaultKey === "umbrella-implement");
    const seedBody = defaultPrompts.find(
      (seed) => seed.defaultKey === "umbrella-implement",
    )!.body;
    expect(after?.prompt.body).toBe(seedBody);
    expect(after?.categoryIds).toHaveLength(1);

    expect(service.restoreDefaults().restored).toEqual([]);
  });

  it("reconciles edited defaults while preserving custom rows", () => {
    const customCategory = service.createCategory({ name: "Custom category" });
    const customPrompt = service.createPrompt({
      name: "Custom prompt",
      body: "Keep me",
      note: "Keep this note",
      categoryIds: [customCategory.id],
    });
    const targetSeed = defaultPrompts.find(
      (seed) => seed.defaultKey === "umbrella-implement",
    )!;
    const target = service
      .listPrompts()
      .find(({ prompt }) => prompt.defaultKey === targetSeed.defaultKey)!;
    const used = service.recordPromptUse(target.prompt.id).prompt;
    service.updatePrompt(target.prompt.id, {
      name: "Edited default",
      body: "Edited body",
      note: "Edited note",
      categoryIds: [customCategory.id],
    });
    service.reorderPrompt(target.prompt.id, defaultPrompts.length - 1);

    const restored = service.restoreDefaults();

    expect(restored.restored).toEqual(
      defaultPrompts.slice(1).map((seed) => `prompt:${seed.defaultKey}`),
    );
    const reconciled = service.getPrompt(target.prompt.id);
    expect(reconciled.prompt.name).toBe(targetSeed.name);
    expect(reconciled.prompt.body).toBe(targetSeed.body);
    expect(reconciled.prompt.note).toBe(targetSeed.note);
    expect(reconciled.prompt.position).toBe(targetSeed.position);
    expect(reconciled.prompt.usageCount).toBe(1);
    expect(reconciled.prompt.lastUsedAt).toEqual(used.lastUsedAt);
    expect(
      reconciled.categoryIds.map(
        (categoryId) => service.getCategory(categoryId).defaultKey,
      ),
    ).toEqual(targetSeed.categoryDefaultKeys);
    expect(service.getPrompt(customPrompt.prompt.id).prompt).toMatchObject({
      name: "Custom prompt",
      body: "Keep me",
      note: "Keep this note",
      position: defaultPrompts.length,
      defaultKey: null,
    });
    expect(service.getPrompt(customPrompt.prompt.id).categoryIds).toEqual([
      customCategory.id,
    ]);
    expect(service.restoreDefaults().restored).toEqual([]);
  });

  it("recreates deleted default categories and exact prompt links", () => {
    const implementing = service
      .listCategories()
      .find((category) => category.defaultKey === "implementing")!;
    service.deleteCategory(implementing.id);

    const restored = service.restoreDefaults();
    expect(restored.restored[0]).toBe("category:implementing");

    const recreated = service
      .listCategories()
      .find((category) => category.defaultKey === "implementing")!;
    expect(recreated.id).not.toBe(implementing.id);
    for (const seed of defaultPrompts) {
      const prompt = service
        .listPrompts()
        .find((item) => item.prompt.defaultKey === seed.defaultKey)!;
      expect(
        prompt.categoryIds.map(
          (categoryId) => service.getCategory(categoryId).defaultKey,
        ),
      ).toEqual(seed.categoryDefaultKeys);
    }

    expect(service.restoreDefaults().restored).toEqual([]);
  });

  it("adopts same-named rows created before their default keys existed", () => {
    const planning = service
      .listCategories()
      .find((category) => category.defaultKey === "planning")!;
    const seed = defaultPrompts.find(
      (candidate) => candidate.defaultKey === "expand-task",
    )!;
    const seededPrompt = service
      .listPrompts()
      .find(({ prompt }) => prompt.defaultKey === seed.defaultKey)!;
    service.deletePrompt(seededPrompt.prompt.id);
    service.deleteCategory(planning.id);
    const category = service.createCategory({ name: "Planning" });
    const prompt = service.createPrompt({
      name: seed.name,
      body: seed.body,
      note: seed.note,
      categoryIds: [category.id],
    });

    const restored = service.restoreDefaults();
    expect(restored.restored).toEqual([
      "category:planning",
      "prompt:expand-task",
      "prompt:create-scoped-tasks",
    ]);
    expect(service.getCategory(category.id).defaultKey).toBe("planning");
    expect(service.getPrompt(prompt.prompt.id).prompt.defaultKey).toBe(
      "expand-task",
    );
    expect(
      service
        .listPrompts()
        .filter(({ prompt: item }) => item.name === seed.name),
    ).toHaveLength(1);
  });

  it("removes obsolete system defaults but preserves custom rows", () => {
    const custom = service.createPrompt({ name: "Mine", body: "body" });
    client.db
      .insert(prompts)
      .values({
        name: "Obsolete default",
        body: "old",
        position: 99,
        defaultKey: "obsolete-default",
      })
      .run();
    client.db
      .insert(promptCategories)
      .values({
        name: "Obsolete category",
        position: 99,
        defaultKey: "obsolete-category",
      })
      .run();

    const restored = service.restoreDefaults();

    expect(restored.restored).toEqual([
      "removed:prompt:obsolete-default",
      "removed:category:obsolete-category",
    ]);
    expect(
      service.listPrompts().some(
        ({ prompt }) => prompt.defaultKey === "obsolete-default",
      ),
    ).toBe(false);
    expect(
      service
        .listCategories()
        .some((category) => category.defaultKey === "obsolete-category"),
    ).toBe(false);
    expect(service.getPrompt(custom.prompt.id).prompt.position).toBe(
      defaultPrompts.length,
    );
  });
});
