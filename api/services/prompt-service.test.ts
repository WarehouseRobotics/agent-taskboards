import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
