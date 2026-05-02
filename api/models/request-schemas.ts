import { z } from "zod";
import { actorTypes, taskPriorities } from "../db/schema.js";

const jsonObjectSchema = z.record(z.unknown());
const jsonArraySchema = z.array(z.unknown());
const requiredString = z.string().trim().min(1);
const nullableString = z.string().trim().min(1).nullable();

export const includeArchivedQuerySchema = z.object({
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const projectCreateSchema = z.object({
  name: requiredString,
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
    name: requiredString,
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
  name: requiredString.optional(),
  description: nullableString.optional(),
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
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type TaskMoveInput = z.infer<typeof taskMoveSchema>;
export type CommentCreateInput = z.infer<typeof commentCreateSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
