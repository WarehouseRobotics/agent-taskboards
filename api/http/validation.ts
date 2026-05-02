import type { Request } from "express";
import { z } from "zod";
import type { JsonObject } from "../db/schema.js";
import { ApiError } from "./errors.js";

export function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T) {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new ApiError(400, "invalid_request", "Request body is invalid", {
      issues: result.error.issues,
    });
  }

  return result.data as z.infer<T>;
}

export function parseNonEmptyBody<T extends z.ZodType<JsonObject>>(
  req: Request,
  schema: T,
) {
  const body = parseBody(req, schema);
  if (Object.keys(body).length === 0) {
    throw new ApiError(400, "invalid_request", "Request body cannot be empty");
  }

  return body;
}

export function parseQuery<T extends z.ZodTypeAny>(req: Request, schema: T) {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw new ApiError(400, "invalid_request", "Query parameters are invalid", {
      issues: result.error.issues,
    });
  }

  return result.data as z.infer<T>;
}
