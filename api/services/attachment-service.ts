import { asc, and, eq } from "drizzle-orm";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { nanoid } from "nanoid";
import type { DatabaseClient } from "../db/client.js";
import { taskActivity, taskAttachments } from "../db/schema.js";
import { ApiError } from "../http/errors.js";
import type { TaskService } from "./task-service.js";

export const DEFAULT_UPLOADS_PATH = "/uploads";
export const maxAttachmentBytes = 25 * 1024 * 1024;

export type AttachmentUpload = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
  size: number;
};

export class AttachmentService {
  private readonly db: DatabaseClient["db"];
  readonly uploadsPath: string;

  constructor(
    databaseClient: DatabaseClient,
    private readonly taskService: TaskService,
    uploadsPath = getUploadsPath(),
  ) {
    this.db = databaseClient.db;
    this.uploadsPath = uploadsPath;
  }

  listTaskAttachments(taskId: string, includeArchived = true) {
    this.taskService.getTask(taskId, includeArchived);
    return this.db
      .select()
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId))
      .orderBy(asc(taskAttachments.createdAt))
      .all();
  }

  async createTaskAttachment(taskId: string, file: AttachmentUpload) {
    const task = this.taskService.getTask(taskId, false);
    const attachmentId = nanoid();
    const originalName = safeOriginalName(file.originalname);
    const relativePath = `tasks/${task.id}/${attachmentId}-${sanitizeFileName(originalName)}`;
    const absolutePath = this.absolutePath(relativePath);

    await mkdir(resolve(this.uploadsPath, "tasks", task.id), { recursive: true });
    await writeFile(absolutePath, file.buffer);

    try {
      return this.db.transaction((tx) => {
        const attachment = tx
          .insert(taskAttachments)
          .values({
            id: attachmentId,
            projectId: task.projectId,
            boardId: task.boardId,
            taskId: task.id,
            relativePath,
            originalName,
            contentType: file.mimetype || "application/octet-stream",
            sizeBytes: file.size,
          })
          .returning()
          .get();

        const activity = tx
          .insert(taskActivity)
          .values({
            projectId: task.projectId,
            boardId: task.boardId,
            taskId: task.id,
            eventType: "attachment.created",
            summary: `Attachment ${attachment.originalName} was uploaded`,
            data: {
              attachmentId: attachment.id,
              relativePath: attachment.relativePath,
              originalName: attachment.originalName,
              contentType: attachment.contentType,
              sizeBytes: attachment.sizeBytes,
            },
          })
          .returning()
          .get();

        return { attachment, activity };
      });
    } catch (error) {
      await removeFileBestEffort(absolutePath);
      throw error;
    }
  }

  async deleteTaskAttachment(taskId: string, attachmentId: string) {
    const task = this.taskService.getTask(taskId, false);
    const attachment = this.db
      .select()
      .from(taskAttachments)
      .where(
        and(
          eq(taskAttachments.id, attachmentId),
          eq(taskAttachments.taskId, task.id),
        ),
      )
      .get();

    if (!attachment) {
      throw new ApiError(404, "not_found", "Attachment not found");
    }

    const deleted = this.db.transaction((tx) => {
      tx.delete(taskAttachments)
        .where(eq(taskAttachments.id, attachment.id))
        .run();

      const activity = tx
        .insert(taskActivity)
        .values({
          projectId: task.projectId,
          boardId: task.boardId,
          taskId: task.id,
          eventType: "attachment.deleted",
          summary: `Attachment ${attachment.originalName} was deleted`,
          data: {
            attachmentId: attachment.id,
            relativePath: attachment.relativePath,
            originalName: attachment.originalName,
          },
        })
        .returning()
        .get();

      return { attachment, activity };
    });

    await removeFileBestEffort(this.absolutePath(attachment.relativePath));
    return deleted;
  }

  async removeAttachmentFilesBestEffort(relativePaths: readonly string[]) {
    await Promise.all(
      relativePaths.map(async (relativePath) => {
        try {
          await removeFileBestEffort(this.absolutePath(relativePath));
        } catch (error) {
          console.warn(`Unable to remove attachment file ${relativePath}`, error);
        }
      }),
    );
  }

  absolutePath(relativePath: string) {
    const root = resolve(this.uploadsPath);
    const absolutePath = resolve(root, relativePath);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
      throw new ApiError(400, "invalid_request", "Attachment path is invalid");
    }

    return absolutePath;
  }
}

export function getUploadsPath() {
  return process.env.TASKBOARDS_UPLOADS_PATH ?? DEFAULT_UPLOADS_PATH;
}

function safeOriginalName(value: string | undefined) {
  const name = basename(value?.trim() || "attachment");
  return name || "attachment";
}

function sanitizeFileName(value: string) {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return sanitized || "attachment";
}

async function removeFileBestEffort(path: string) {
  try {
    await unlink(path);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      console.warn(`Unable to remove attachment file ${path}`, error);
    }
  }
}
