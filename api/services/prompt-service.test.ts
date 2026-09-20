import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { promptCategoryLinks, prompts } from "../db/schema.js";
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
      service.updateCategory(category.id, { name: "☂️ Umbrella" }),
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
    for (const [index, gapped] of [0, 2, 7].entries()) {
      client.db
        .update(prompts)
        .set({ position: gapped })
        .where(eq(prompts.id, ids[index]))
        .run();
    }

    service.reorderPrompt(ids[2], 0);

    expect(promptIds()).toEqual([ids[2], ids[0], ids[1]]);
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

  it("relinks surviving default prompts when restoring a deleted default category", () => {
    const umbrella = service
      .listCategories()
      .find((category) => category.defaultKey === "umbrella")!;
    service.deleteCategory(umbrella.id);
    for (const { categoryIds } of service.listPrompts()) {
      expect(categoryIds).toEqual([]);
    }

    const restored = service.restoreDefaults();
    expect(restored.restored).toEqual([
      "category:umbrella",
      ...defaultPrompts.map((seed) => `link:${seed.defaultKey}:umbrella`),
    ]);

    const recreated = service
      .listCategories()
      .find((category) => category.defaultKey === "umbrella")!;
    expect(recreated.id).not.toBe(umbrella.id);
    for (const { prompt, categoryIds } of service.listPrompts()) {
      expect(prompt.defaultKey).not.toBeNull();
      expect(categoryIds).toEqual([recreated.id]);
    }

    expect(service.restoreDefaults().restored).toEqual([]);
  });

  it("does not relink defaults to a category the user still has", () => {
    const seeded = service.listPrompts();
    const target = seeded.find(
      ({ prompt }) => prompt.defaultKey === "umbrella-implement",
    )!;
    // Unlinking a default prompt from a surviving category is user intent
    // that a restore must not undo.
    service.updatePrompt(target.prompt.id, { categoryIds: [] });

    const restored = service.restoreDefaults();
    expect(restored.restored).toEqual([]);
    expect(service.getPrompt(target.prompt.id).categoryIds).toEqual([]);
  });

  it("adopts a same-named user category when restoring defaults", () => {
    const umbrella = service
      .listCategories()
      .find((category) => category.defaultKey === "umbrella")!;
    for (const { prompt } of service.listPrompts()) {
      service.deletePrompt(prompt.id);
    }
    service.deleteCategory(umbrella.id);
    const userOwned = service.createCategory({ name: "☂️ Umbrella" });

    const restored = service.restoreDefaults();
    expect(restored.restored).toEqual(
      defaultPrompts.map((seed) => `prompt:${seed.defaultKey}`),
    );

    for (const { prompt, categoryIds } of service.listPrompts()) {
      expect(prompt.defaultKey).not.toBeNull();
      expect(categoryIds).toEqual([userOwned.id]);
    }
  });

  it("appends restored prompts after existing user prompt positions", () => {
    const userPrompt = service.createPrompt({ name: "Mine", body: "body" });
    const target = service
      .listPrompts()
      .find(({ prompt }) => prompt.defaultKey === "umbrella-code-review")!;
    service.deletePrompt(target.prompt.id);

    service.restoreDefaults();

    const restoredRow = client.db
      .select()
      .from(prompts)
      .all()
      .find((prompt) => prompt.defaultKey === "umbrella-code-review");
    expect(restoredRow!.position).toBeGreaterThan(userPrompt.prompt.position);
  });
});
