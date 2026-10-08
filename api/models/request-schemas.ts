import { z } from "zod";
import { actorTypes, taskPriorities } from "../db/schema.js";
import {
  PROMPT_LIBRARY_EXPORT_FORMAT,
  PROMPT_LIBRARY_EXPORT_VERSION,
} from "../services/prompt-library-import.js";

const jsonObjectSchema = z.record(z.unknown());
const jsonArraySchema = z.array(z.unknown());
const requiredString = z.string().trim().min(1);
const nullableString = z.string().trim().min(1).nullable();
const urlSafeNameMessage =
  "Names may contain only lowercase letters, numbers, underscores, and hyphens";
export const urlSafeNameSchema = requiredString.regex(/^[a-z0-9_-]+$/, {
  message: urlSafeNameMessage,
});

export const includeArchivedQuerySchema = z.object({
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

const repeatedStringQuery = z
  .union([requiredString, z.array(requiredString)])
  .optional()
  .transform((value) => {
    if (!value) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  });

const queryInteger = (defaultValue: number, max: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? defaultValue : Number(value)))
    .pipe(z.number().int().min(0).max(max));

export const activityQuerySchema = z.object({
  projectId: repeatedStringQuery,
  limit: queryInteger(50, 100).refine((value) => value > 0, {
    message: "Limit must be greater than 0",
  }),
  offset: queryInteger(0, 10_000),
  sort: z.enum(["asc", "desc"]).optional().default("desc"),
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const commentListQuerySchema = z.object({
  sort: z.enum(["asc", "desc"]).optional().default("asc"),
});

export const projectCreateSchema = z.object({
  name: urlSafeNameSchema,
  description: nullableString.optional(),
  repositoryPath: nullableString.optional(),
  defaultBranch: nullableString.optional(),
  metadata: jsonObjectSchema.optional(),
});

export const projectUpdateSchema = projectCreateSchema.partial();

const boardColumnInputSchema = z.object({
  key: requiredString.regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: requiredString,
  isDone: z.boolean().optional(),
});

export const boardCreateSchema = z
  .object({
    name: urlSafeNameSchema,
    description: nullableString.optional(),
    metadata: jsonObjectSchema.optional(),
    columns: z.array(boardColumnInputSchema).min(1).optional(),
  })
  .superRefine((value, context) => {
    if (!value.columns) {
      return;
    }

    const keys = new Set<string>();
    for (const [index, column] of value.columns.entries()) {
      if (keys.has(column.key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["columns", index, "key"],
          message: "Column keys must be unique within a board",
        });
      }

      keys.add(column.key);
    }
  });

export const boardUpdateSchema = z.object({
  name: urlSafeNameSchema.optional(),
  description: nullableString.optional(),
  metadata: jsonObjectSchema.optional(),
});

export const checkpointCreateSchema = z.object({
  name: requiredString.optional(),
  description: nullableString.optional(),
  creatorType: z.enum(actorTypes).optional().default("human"),
  creatorName: nullableString.optional(),
  creatorRef: nullableString.optional(),
  metadata: jsonObjectSchema.optional(),
});

export const taskCreateSchema = z
  .object({
    title: requiredString,
    description: nullableString.optional(),
    columnId: requiredString.optional(),
    columnKey: requiredString.optional(),
    priority: z.enum(taskPriorities).optional(),
    labels: z.array(z.string().trim().min(1)).optional(),
    externalReferences: jsonArraySchema.optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .refine((value) => !(value.columnId && value.columnKey), {
    path: ["columnKey"],
    message: "Provide either columnId or columnKey, not both",
  });

export const taskUpdateSchema = z.object({
  title: requiredString.optional(),
  description: nullableString.optional(),
  priority: z.enum(taskPriorities).optional(),
  labels: z.array(z.string().trim().min(1)).optional(),
  externalReferences: jsonArraySchema.optional(),
  metadata: jsonObjectSchema.optional(),
});

export const taskMoveSchema = z
  .object({
    boardId: requiredString.optional(),
    columnId: requiredString.optional(),
    columnKey: requiredString.optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((value) => value.boardId || value.columnId || value.columnKey, {
    path: ["columnId"],
    message: "Provide boardId, columnId, or columnKey",
  })
  .refine((value) => !(value.columnId && value.columnKey), {
    path: ["columnKey"],
    message: "Provide either columnId or columnKey, not both",
  });

export const commentCreateSchema = z.object({
  authorType: z.enum(actorTypes),
  authorName: nullableString.optional(),
  authorRef: nullableString.optional(),
  body: requiredString,
  metadata: jsonObjectSchema.optional(),
});

// Prompt bodies keep meaningful leading/trailing whitespace, so validate
// without transforming the value.
const promptBodySchema = z
  .string()
  .refine((value) => value.trim().length > 0, {
    message: "Body cannot be empty",
  });

// Library names are trimmed and checked for the reserved "Default" name by the
// service, which owns the rules for both create and rename.
export const promptLibraryCreateSchema = z.object({
  name: requiredString,
});

export const promptLibraryUpdateSchema = promptLibraryCreateSchema;

// Prompts and categories belong to exactly one library, chosen at creation.
// Rows never move between libraries, so an update that names a library is
// refused instead of being stripped like other unknown keys.
const immutableLibraryIdSchema = {
  libraryId: z.undefined({
    invalid_type_error:
      "libraryId cannot be changed; prompts and categories stay in the library they were created in",
  }),
};

export const promptCategoryCreateSchema = z.object({
  libraryId: requiredString,
  name: requiredString,
  description: nullableString.optional(),
  metadata: jsonObjectSchema.optional(),
});

export const promptCategoryUpdateSchema = promptCategoryCreateSchema
  .omit({ libraryId: true })
  .partial()
  .extend(immutableLibraryIdSchema);

export const promptCategoryListQuerySchema = z.object({
  libraryId: requiredString.optional(),
});

export const promptCreateSchema = z.object({
  libraryId: requiredString,
  name: requiredString,
  body: promptBodySchema,
  note: nullableString.optional(),
  categoryIds: z.array(requiredString).optional(),
  metadata: jsonObjectSchema.optional(),
});

export const promptUpdateSchema = promptCreateSchema
  .omit({ libraryId: true })
  .partial()
  .extend(immutableLibraryIdSchema);

export const promptListQuerySchema = z.object({
  libraryId: requiredString.optional(),
  categoryId: requiredString.optional(),
  q: requiredString.optional(),
});

// Shared by prompt and prompt-category reordering. `position` counts the list
// with the moved row taken out, so it is never larger than the sibling count.
export const promptReorderSchema = z.object({
  position: z.number().int().min(0),
});

// Import documents are the export format plus an optional `onConflict`.
// Names are trimmed like everywhere else; a blank `description` or `note`
// reads as "none" so a hand-edited file does not fail on an empty string.
const optionalText = z
  .string()
  .nullable()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });
const optionalMetadata = jsonObjectSchema
  .optional()
  .transform((value) => value ?? {});

const promptLibraryExportCategorySchema = z.object({
  name: requiredString,
  description: optionalText,
  metadata: optionalMetadata,
});

const promptLibraryExportPromptSchema = z.object({
  name: requiredString,
  body: promptBodySchema,
  note: optionalText,
  metadata: optionalMetadata,
  categories: z
    .array(requiredString)
    .optional()
    .transform((value) => value ?? []),
});

export const promptLibraryImportConflictModes = [
  "append",
  "replace",
  "copy",
] as const;

export const promptLibraryImportSchema = z
  .object({
    format: z.literal(PROMPT_LIBRARY_EXPORT_FORMAT),
    version: z.literal(PROMPT_LIBRARY_EXPORT_VERSION),
    exportedAt: z.string().optional(),
    library: z.object({
      name: requiredString,
      metadata: optionalMetadata,
    }),
    categories: z.array(promptLibraryExportCategorySchema),
    prompts: z.array(promptLibraryExportPromptSchema),
    onConflict: z.enum(promptLibraryImportConflictModes).optional(),
  })
  .superRefine((value, context) => {
    const categoryNames = new Set<string>();
    for (const [index, category] of value.categories.entries()) {
      if (categoryNames.has(category.name)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["categories", index, "name"],
          message: "Category names must be unique within the file",
        });
      }
      categoryNames.add(category.name);
    }

    for (const [promptIndex, prompt] of value.prompts.entries()) {
      const seen = new Set<string>();
      for (const [index, name] of prompt.categories.entries()) {
        const path = ["prompts", promptIndex, "categories", index];
        if (!categoryNames.has(name)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: `Prompt category "${name}" is not listed in categories`,
          });
        } else if (seen.has(name)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: "A prompt cannot list the same category twice",
          });
        }
        seen.add(name);
      }
    }
  });

const indexedSearchSourceTypes = ["board", "task", "comment"] as const;

export const searchLabelMatchModes = ["all", "any"] as const;

export const searchSchema = z
  .object({
    query: z.string().trim().max(1000).optional().default(""),
    projectId: requiredString.optional(),
    boardId: requiredString.optional(),
    preferredBoardId: requiredString.optional(),
    taskId: requiredString.optional(),
    sourceTypes: z.array(z.enum(indexedSearchSourceTypes)).min(1).optional(),
    labels: z.array(requiredString.max(200)).max(20).optional(),
    labelMatch: z.enum(searchLabelMatchModes).optional(),
    includeArchived: z.boolean().optional().default(false),
    limit: z.number().int().min(1).max(50).optional().default(10),
  })
  .refine((input) => input.query.length > 0 || (input.labels?.length ?? 0) > 0, {
    message: "query is required unless labels are provided",
    path: ["query"],
  });

export const labelListQuerySchema = includeArchivedQuerySchema.extend({
  projectId: requiredString.optional(),
  boardId: requiredString.optional(),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type BoardCreateInput = z.infer<typeof boardCreateSchema>;
export type BoardUpdateInput = z.infer<typeof boardUpdateSchema>;
export type CheckpointCreateInput = z.infer<typeof checkpointCreateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type TaskMoveInput = z.infer<typeof taskMoveSchema>;
export type CommentCreateInput = z.infer<typeof commentCreateSchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export type SearchLabelMatch = (typeof searchLabelMatchModes)[number];
export type LabelListQuery = z.infer<typeof labelListQuerySchema>;
export type PromptLibraryCreateInput = z.infer<typeof promptLibraryCreateSchema>;
export type PromptLibraryUpdateInput = z.infer<typeof promptLibraryUpdateSchema>;
export type PromptCategoryCreateInput = z.infer<typeof promptCategoryCreateSchema>;
export type PromptCategoryUpdateInput = z.infer<typeof promptCategoryUpdateSchema>;
export type PromptCategoryListQuery = z.infer<typeof promptCategoryListQuerySchema>;
export type PromptCreateInput = z.infer<typeof promptCreateSchema>;
export type PromptUpdateInput = z.infer<typeof promptUpdateSchema>;
export type PromptListQuery = z.infer<typeof promptListQuerySchema>;
export type PromptReorderInput = z.infer<typeof promptReorderSchema>;
export type PromptLibraryImportInput = z.infer<typeof promptLibraryImportSchema>;
