import type { Response } from "express";
import type { JsonArray, JsonObject } from "../db/schema.js";
import type { ApiError } from "../http/errors.js";
import type { AgentFormat } from "./query-schemas.js";

type MarkdownSection = {
  title: string;
  lines: string[];
};

export type AgentMarkdownDocument = {
  outcome: string;
  sections?: MarkdownSection[];
  data?: JsonObject | JsonArray;
  nextCalls?: string[];
};

export function sendAgentMarkdown(
  res: Response,
  document: AgentMarkdownDocument,
  options: { status?: number; format: AgentFormat },
) {
  res
    .status(options.status ?? 200)
    .type("text/markdown")
    .send(renderAgentMarkdown(document, options.format));
}

export function renderAgentMarkdown(
  document: AgentMarkdownDocument,
  format: AgentFormat,
) {
  const parts = [document.outcome.trim()];

  for (const section of document.sections ?? []) {
    const lines = section.lines.filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      continue;
    }

    parts.push(`## ${section.title}\n\n${lines.join("\n")}`);
  }

  if (document.data !== undefined && format !== "none") {
    parts.push(renderStructuredBlock(document.data, format));
  }

  if (document.nextCalls && document.nextCalls.length > 0) {
    parts.push(
      `## Next calls\n\n${document.nextCalls.map((call) => `- \`${call}\``).join("\n")}`,
    );
  }

  return `${parts.join("\n\n")}\n`;
}

export function renderAgentError(error: ApiError, format: AgentFormat) {
  return renderAgentMarkdown(
    {
      outcome: errorOutcome(error),
      sections: [
        {
          title: "Error",
          lines: [`\`${error.code}\`: ${error.message}.`],
        },
      ],
      data: {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        next: ["GET /api/agents/help"],
      },
      nextCalls: ["GET /api/agents/help"],
    },
    format,
  );
}

function renderStructuredBlock(data: JsonObject | JsonArray, format: AgentFormat) {
  if (format === "json") {
    return `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  }

  if (format === "yaml") {
    return `\`\`\`yaml\n${toYaml(data)}\n\`\`\``;
  }

  return `\`\`\`toon\n${toToon(data)}\n\`\`\``;
}

function toToon(value: unknown, indent = 0): string {
  if (Array.isArray(value)) {
    return value.map((item) => `${spaces(indent)}- ${inlineValue(item)}`).join("\n");
  }

  if (isPlainObject(value)) {
    return Object.entries(value)
      .map(([key, item]) => {
        if (Array.isArray(item)) {
          if (item.length === 0) {
            return `${spaces(indent)}${key}: []`;
          }

          return `${spaces(indent)}${key}[${item.length}]:\n${toToon(item, indent + 2)}`;
        }

        if (isPlainObject(item)) {
          return `${spaces(indent)}${key}:\n${toToon(item, indent + 2)}`;
        }

        return `${spaces(indent)}${key}: ${scalar(item)}`;
      })
      .join("\n");
  }

  return `${spaces(indent)}${scalar(value)}`;
}

function toYaml(value: unknown, indent = 0): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (isPlainObject(item) || Array.isArray(item)) {
          return `${spaces(indent)}-\n${toYaml(item, indent + 2)}`;
        }

        return `${spaces(indent)}- ${scalar(item)}`;
      })
      .join("\n");
  }

  if (isPlainObject(value)) {
    return Object.entries(value)
      .map(([key, item]) => {
        if (isPlainObject(item) || Array.isArray(item)) {
          return `${spaces(indent)}${key}:\n${toYaml(item, indent + 2)}`;
        }

        return `${spaces(indent)}${key}: ${scalar(item)}`;
      })
      .join("\n");
  }

  return `${spaces(indent)}${scalar(value)}`;
}

function inlineValue(value: unknown): string {
  if (isPlainObject(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${scalar(item)}`)
      .join(" | ");
  }

  return scalar(value);
}

function scalar(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return quoteIfNeeded(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function quoteIfNeeded(value: string) {
  if (value.length === 0) {
    return '""';
  }

  return /[:#\n\r]|^\s|\s$/.test(value) ? JSON.stringify(value) : value;
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function spaces(count: number) {
  return " ".repeat(count);
}

function errorOutcome(error: ApiError) {
  if (error.code === "not_found") {
    return "The requested resource could not be found.";
  }

  if (error.code === "invalid_request") {
    return "The request was invalid.";
  }

  if (error.code === "invalid_state") {
    return "The request could not be completed in the current state.";
  }

  return "The request failed.";
}
