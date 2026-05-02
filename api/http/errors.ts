import type { ErrorRequestHandler } from "express";
import type { JsonObject } from "../db/schema.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: JsonObject = {},
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  void next;

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Internal server error",
      details: {},
    },
  });
};
