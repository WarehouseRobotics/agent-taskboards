import { describe, expect, it } from "vitest";
import { chunkEmbeddingText } from "./chunking.js";

describe("embedding text chunking", () => {
  it("leaves short text unchanged", () => {
    const text = "Task: Build search\nDescription: Keep this short.";

    expect(chunkEmbeddingText(text)).toEqual([
      {
        text,
        index: 0,
        count: 1,
        startOffset: 0,
        endOffset: text.length,
      },
    ]);
  });

  it("splits long text into overlapping chunks below the size target", () => {
    const paragraphs = Array.from(
      { length: 18 },
      (_, index) =>
        `Paragraph ${index} explains sqlite vector search behavior with enough detail to make the task description long and useful for retrieval.`,
    );

    const chunks = chunkEmbeddingText(paragraphs.join("\n\n"), {
      maxChars: 420,
      overlapChars: 120,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 420)).toBe(true);
    expect(chunks[1]?.startOffset).toBeLessThan(chunks[0]?.endOffset ?? 0);
  });

  it("keeps short fenced diagrams and markdown tables intact", () => {
    const text = [
      "Intro paragraph about the work.",
      "",
      "```mermaid",
      "graph TD",
      "  A[Task] --> B[Search]",
      "```",
      "",
      "| Field | Meaning |",
      "| --- | --- |",
      "| task | Long specification |",
      "| comment | Handoff note |",
      "",
      "Closing paragraph with enough words to require chunk decisions.",
    ].join("\n");

    const chunks = chunkEmbeddingText(text, {
      maxChars: 130,
      overlapChars: 30,
    });
    const diagramChunk = chunks.find((chunk) => chunk.text.includes("mermaid"));
    const tableChunk = chunks.find((chunk) => chunk.text.includes("| Field |"));

    expect(diagramChunk?.text).toContain("```mermaid");
    expect(diagramChunk?.text).toContain("```");
    expect(tableChunk?.text).toContain("| task | Long specification |");
    expect(tableChunk?.text).toContain("| comment | Handoff note |");
  });

  it("splits oversized blocks at line boundaries as a fallback", () => {
    const text = [
      "```mermaid",
      ...Array.from(
        { length: 12 },
        (_, index) => `node${index} --> node${index + 1}`,
      ),
      "```",
    ].join("\n");

    const chunks = chunkEmbeddingText(text, { maxChars: 80, overlapChars: 0 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 80)).toBe(true);
    expect(chunks.some((chunk) => chunk.text.includes("node5 --> node6"))).toBe(
      true,
    );
  });
});
