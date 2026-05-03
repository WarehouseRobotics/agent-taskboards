import { describe, expect, it } from "vitest";
import type { TaskAttachment } from "../../domain/types";
import { appendImageAttachmentMarkdown, filesFromClipboardData } from "./TaskDetail";

describe("task attachment helpers", () => {
  it("appends image markdown links without saving the task description", () => {
    expect(appendImageAttachmentMarkdown("Existing notes", attachment())).toBe(
      "Existing notes\n\n![screenshot.png](/uploads/tasks/task_1/att-screenshot.png)",
    );
  });

  it("sanitizes markdown alt text delimiters", () => {
    expect(
      appendImageAttachmentMarkdown("", attachment({ originalName: "[bad]\nname.png" })),
    ).toBe("![bad  name.png](/uploads/tasks/task_1/att-screenshot.png)");
  });

  it("extracts pasted files from clipboard items", () => {
    const pasted = new File(["pixels"], "pasted.png", { type: "image/png" });
    const textItem = {
      kind: "string",
      getAsFile: () => null,
    };
    const fileItem = {
      kind: "file",
      getAsFile: () => pasted,
    };

    expect(
      filesFromClipboardData({
        files: [] as unknown as FileList,
        items: [textItem, fileItem] as unknown as DataTransferItemList,
      }),
    ).toEqual([pasted]);
  });

  it("deduplicates files exposed through both clipboard files and items", () => {
    const pasted = new File(["pixels"], "pasted.png", { type: "image/png" });
    const fileItem = {
      kind: "file",
      getAsFile: () => pasted,
    };

    expect(
      filesFromClipboardData({
        files: [pasted] as unknown as FileList,
        items: [fileItem] as unknown as DataTransferItemList,
      }),
    ).toEqual([pasted]);
  });
});

function attachment(overrides: Partial<TaskAttachment> = {}): TaskAttachment {
  return {
    id: "att",
    projectId: "project",
    boardId: "board",
    taskId: "task_1",
    relativePath: "tasks/task_1/att-screenshot.png",
    url: "/uploads/tasks/task_1/att-screenshot.png",
    originalName: "screenshot.png",
    contentType: "image/png",
    sizeBytes: 100,
    createdAt: "2026-05-03T00:00:00.000Z",
    ...overrides,
  };
}
