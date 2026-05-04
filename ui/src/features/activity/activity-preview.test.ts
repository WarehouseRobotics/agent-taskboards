import { describe, expect, it } from "vitest";
import { activityCommentPreviewText } from "./activity-preview";

describe("activity comment preview", () => {
  it("renders markdown links as plain text", () => {
    expect(
      activityCommentPreviewText("Read [the docs](https://example.com) before continuing."),
    ).toBe("Read the docs before continuing.");
  });

  it("strips code fences and table structure from previews", () => {
    expect(
      activityCommentPreviewText([
        "```ts",
        "const answer = 42;",
        "```",
        "| Status | Owner |",
        "| --- | --- |",
        "| Ready | Codex |",
      ].join("\n")),
    ).toBe("const answer = 42; Status Owner Ready Codex");
  });

  it("truncates after plain-text conversion", () => {
    const preview = activityCommentPreviewText(`[${"x".repeat(700)}](https://example.com)`);

    expect(preview).toHaveLength(600);
    expect(preview.endsWith("...")).toBe(true);
    expect(preview).not.toContain("https://example.com");
  });
});
