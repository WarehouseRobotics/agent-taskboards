import type { RequestHandler } from "express";
import multer from "multer";
import { ApiError } from "../http/errors.js";
import { maxAttachmentBytes } from "../services/attachment-service.js";

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxAttachmentBytes },
});

export const uploadAttachmentFile: RequestHandler = (req, res, next) => {
  attachmentUpload.single("file")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      next(
        new ApiError(400, "invalid_request", "Attachment upload is invalid", {
          field: error.field,
          reason: error.code,
        }),
      );
      return;
    }

    next(error);
  });
};
