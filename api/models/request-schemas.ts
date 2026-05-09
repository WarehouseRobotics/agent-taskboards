import { z } from "zod";
import { actorTypes, taskPriorities } from "../db/schema.js";

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
    columnId: requiredString.optional(),
    columnKey: requiredString.optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((value) => value.columnId || value.columnKey, {
    path: ["columnId"],
    message: "Provide columnId or columnKey",
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

const indexedSearchSourceTypes = ["board", "task", "comment"] as const;

export const searchSchema = z.object({
  query: requiredString.max(1000),
  projectId: requiredString.optional(),
  boardId: requiredString.optional(),
  taskId: requiredString.optional(),
  sourceTypes: z.array(z.enum(indexedSearchSourceTypes)).min(1).optional(),
  includeArchived: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(50).optional().default(10),
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
