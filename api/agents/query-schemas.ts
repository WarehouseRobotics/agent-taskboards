import { z } from "zod";
import { taskPriorities } from "../db/schema.js";

const agentFormats = ["toon", "yaml", "json", "none"] as const;
const agentViews = ["brief", "normal", "full"] as const;
const agentIncludes = [
  "comments",
  "activity",
  "metadata",
  "description",
  "externalReferences",
] as const;
const taskStatuses = [
  "pending",
  "active",
  "blocked",
  "review",
  "done",
  "archived",
  "all",
] as const;
const searchSourceTypes = ["board", "task", "comment"] as const;

const firstQueryValue = (value: unknown) =>
  Array.isArray(value) ? value[0] : value;

const queryBoolean = (defaultValue: boolean) =>
  z
    .preprocess(firstQueryValue, z.enum(["true", "false"]).optional())
    .transform((value) => (value === undefined ? defaultValue : value === "true"));

const queryInteger = (defaultValue: number, max: number) =>
  z
    .preprocess((value) => {
      const first = firstQueryValue(value);
      return first === undefined ? undefined : Number(first);
    }, z.number().int().min(0).max(max).optional())
    .transform((value) => value ?? defaultValue);

const queryString = z
  .preprocess(firstQueryValue, z.string().trim().min(1).optional())
  .optional();

const queryCsv = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((value) => {
    const first = firstQueryValue(value);
    if (first === undefined || first === "") {
      return [];
    }

    return String(first)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }, z.array(z.enum(values)));

const queryStringCsv = z.preprocess((value) => {
  const first = firstQueryValue(value);
  if (first === undefined || first === "") {
    return [];
  }

  return String(first)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}, z.array(z.string().min(1)));

export const agentReadQuerySchema = z.object({
  format: z
    .preprocess(firstQueryValue, z.enum(agentFormats).optional())
    .transform((value) => value ?? "toon"),
  view: z
    .preprocess(firstQueryValue, z.enum(agentViews).optional())
    .transform((value) => value ?? "normal"),
  include: queryCsv(agentIncludes),
  includeArchived: queryBoolean(false),
  includeTasks: queryBoolean(false),
  limit: queryInteger(25, 100),
  offset: queryInteger(0, 10_000),
  perColumnLimit: queryInteger(20, 100),
  commentLimit: queryInteger(5, 100),
  activityLimit: queryInteger(10, 100),
  q: queryString,
  repositoryPath: queryString,
});

export const agentTaskListQuerySchema = agentReadQuerySchema.extend({
  projectId: queryString,
  boardId: queryString,
  columnKey: queryString,
  status: z
    .preprocess(firstQueryValue, z.enum(taskStatuses).optional())
    .transform((value) => value ?? "pending"),
  priority: z.preprocess(firstQueryValue, z.enum(taskPriorities).optional()),
  labels: queryStringCsv,
  semantic: queryBoolean(false),
});

export const agentSearchQuerySchema = agentReadQuerySchema.extend({
  q: z.preprocess(firstQueryValue, z.string().trim().min(1)),
  projectId: queryString,
  boardId: queryString,
  taskId: queryString,
  sourceTypes: queryCsv(searchSourceTypes).transform((value) =>
    value.length > 0 ? value : undefined,
  ),
  limit: queryInteger(10, 50),
});

export type AgentFormat = z.infer<typeof agentReadQuerySchema>["format"];
export type AgentView = z.infer<typeof agentReadQuerySchema>["view"];
export type AgentReadQuery = z.infer<typeof agentReadQuerySchema>;
export type AgentTaskListQuery = z.infer<typeof agentTaskListQuerySchema>;
export type AgentSearchQuery = z.infer<typeof agentSearchQuerySchema>;
