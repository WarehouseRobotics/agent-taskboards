export const EMBEDDING_CHUNKING_VERSION = 1;

export const DEFAULT_EMBEDDING_CHUNK_OPTIONS = {
  charsPerToken: 4,
  maxTokens: 390,
  overlapChars: 240,
};

export type EmbeddingChunkOptions = Partial<
  typeof DEFAULT_EMBEDDING_CHUNK_OPTIONS
> & {
  maxChars?: number;
};

export type EmbeddingTextChunk = {
  text: string;
  index: number;
  count: number;
  startOffset: number;
  endOffset: number;
};

type MarkdownBlock = {
  text: string;
  startOffset: number;
  endOffset: number;
};

type ChunkDraft = {
  text: string;
  startOffset: number;
  endOffset: number;
};

export function chunkEmbeddingText(
  text: string,
  options: EmbeddingChunkOptions = {},
): EmbeddingTextChunk[] {
  if (text.length === 0) {
    return [
      {
        text,
        index: 0,
        count: 1,
        startOffset: 0,
        endOffset: 0,
      },
    ];
  }

  const resolved = resolveChunkOptions(options);
  if (text.length <= resolved.maxChars) {
    return finalizeChunks([
      {
        text,
        startOffset: 0,
        endOffset: text.length,
      },
    ]);
  }

  const blocks = splitMarkdownBlocks(text);
  const drafts: ChunkDraft[] = [];
  let current: ChunkDraft | undefined;

  const flush = () => {
    if (!current) {
      return;
    }

    drafts.push(trimChunkDraft(current));
    current = undefined;
  };

  for (const block of blocks) {
    if (block.text.length > resolved.maxChars) {
      flush();
      drafts.push(...splitOversizedBlock(block, resolved.maxChars));
      continue;
    }

    if (!current) {
      current = {
        text: block.text,
        startOffset: block.startOffset,
        endOffset: block.endOffset,
      };
      continue;
    }

    if (current.text.length + block.text.length > resolved.maxChars) {
      const previous = current;
      flush();
      const overlap = makeOverlap(previous, resolved.overlapChars);
      current = overlap
        ? joinDrafts(overlap, block)
        : {
            text: block.text,
            startOffset: block.startOffset,
            endOffset: block.endOffset,
          };

      if (current.text.length > resolved.maxChars) {
        current = {
          text: block.text,
          startOffset: block.startOffset,
          endOffset: block.endOffset,
        };
      }
      continue;
    }

    current = joinDrafts(current, block);
  }

  flush();
  return finalizeChunks(drafts);
}

function resolveChunkOptions(options: EmbeddingChunkOptions) {
  const charsPerToken =
    options.charsPerToken ?? DEFAULT_EMBEDDING_CHUNK_OPTIONS.charsPerToken;
  const maxTokens =
    options.maxTokens ?? DEFAULT_EMBEDDING_CHUNK_OPTIONS.maxTokens;
  return {
    charsPerToken,
    maxTokens,
    maxChars: options.maxChars ?? charsPerToken * maxTokens,
    overlapChars:
      options.overlapChars ?? DEFAULT_EMBEDDING_CHUNK_OPTIONS.overlapChars,
  };
}

function splitMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.match(/[^\n]*(?:\n|$)/g)?.filter(Boolean) ?? [text];
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const startOffset = sumLineLengths(lines, index);

    if (isFenceStart(line)) {
      const fenceMarker = line.trimStart().slice(0, 3);
      let end = index + 1;
      while (end < lines.length) {
        const candidate = lines[end] ?? "";
        if (candidate.trimStart().startsWith(fenceMarker)) {
          end += 1;
          break;
        }
        end += 1;
      }
      blocks.push(makeBlock(lines, index, end, startOffset));
      index = end;
      continue;
    }

    if (isTableLine(line) && isTableSeparator(lines[index + 1] ?? "")) {
      let end = index + 2;
      while (end < lines.length && isTableLine(lines[end] ?? "")) {
        end += 1;
      }
      blocks.push(makeBlock(lines, index, end, startOffset));
      index = end;
      continue;
    }

    if (line.trim() === "") {
      let end = index + 1;
      while (end < lines.length && (lines[end] ?? "").trim() === "") {
        end += 1;
      }
      blocks.push(makeBlock(lines, index, end, startOffset));
      index = end;
      continue;
    }

    let end = index + 1;
    while (
      end < lines.length &&
      (lines[end] ?? "").trim() !== "" &&
      !isFenceStart(lines[end] ?? "") &&
      !(isTableLine(lines[end] ?? "") && isTableSeparator(lines[end + 1] ?? ""))
    ) {
      end += 1;
    }
    blocks.push(makeBlock(lines, index, end, startOffset));
    index = end;
  }

  return blocks;
}

function makeBlock(
  lines: string[],
  startLine: number,
  endLine: number,
  startOffset: number,
): MarkdownBlock {
  const text = lines.slice(startLine, endLine).join("");
  return {
    text,
    startOffset,
    endOffset: startOffset + text.length,
  };
}

function sumLineLengths(lines: string[], endExclusive: number) {
  let length = 0;
  for (let index = 0; index < endExclusive; index += 1) {
    length += lines[index]?.length ?? 0;
  }
  return length;
}

function isFenceStart(line: string) {
  const trimmed = line.trimStart();
  return trimmed.startsWith("```") || trimmed.startsWith("~~~");
}

function isTableLine(line: string) {
  return line.includes("|") && line.trim() !== "";
}

function isTableSeparator(line: string) {
  const trimmed = line.trim();
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed);
}

function splitOversizedBlock(block: MarkdownBlock, maxChars: number) {
  const lines = block.text.match(/[^\n]*(?:\n|$)/g)?.filter(Boolean) ?? [
    block.text,
  ];
  const chunks: ChunkDraft[] = [];
  let current = "";
  let currentStart = block.startOffset;
  let offset = block.startOffset;

  for (const line of lines) {
    if (current && current.length + line.length > maxChars) {
      chunks.push({
        text: current,
        startOffset: currentStart,
        endOffset: offset,
      });
      current = "";
      currentStart = offset;
    }

    if (line.length > maxChars) {
      for (let index = 0; index < line.length; index += maxChars) {
        const part = line.slice(index, index + maxChars);
        chunks.push({
          text: part,
          startOffset: offset + index,
          endOffset: offset + index + part.length,
        });
      }
      offset += line.length;
      currentStart = offset;
      continue;
    }

    current += line;
    offset += line.length;
  }

  if (current) {
    chunks.push({
      text: current,
      startOffset: currentStart,
      endOffset: offset,
    });
  }

  return chunks.map(trimChunkDraft);
}

function joinDrafts(left: ChunkDraft, right: MarkdownBlock): ChunkDraft {
  return {
    text: left.text + right.text,
    startOffset: left.startOffset,
    endOffset: right.endOffset,
  };
}

function makeOverlap(
  draft: ChunkDraft,
  overlapChars: number,
): ChunkDraft | undefined {
  if (overlapChars <= 0 || draft.text.length === 0) {
    return undefined;
  }

  if (draft.text.length <= overlapChars) {
    return draft;
  }

  const overlapStart = findOverlapStart(draft.text, overlapChars);
  return {
    text: draft.text.slice(overlapStart),
    startOffset: draft.startOffset + overlapStart,
    endOffset: draft.endOffset,
  };
}

function findOverlapStart(text: string, overlapChars: number) {
  const minimumStart = Math.max(0, text.length - overlapChars);
  const paragraphStart = text.lastIndexOf("\n\n", minimumStart);
  if (paragraphStart >= 0 && paragraphStart + 2 < text.length) {
    return paragraphStart + 2;
  }

  const lineStart = text.lastIndexOf("\n", minimumStart);
  if (lineStart >= 0 && lineStart + 1 < text.length) {
    return lineStart + 1;
  }

  const spaceStart = text.indexOf(" ", minimumStart);
  if (spaceStart >= 0 && spaceStart + 1 < text.length) {
    return spaceStart + 1;
  }

  return minimumStart;
}

function trimChunkDraft(draft: ChunkDraft): ChunkDraft {
  const leadingWhitespace = draft.text.match(/^\s*/)?.[0].length ?? 0;
  const trailingWhitespace = draft.text.match(/\s*$/)?.[0].length ?? 0;
  return {
    text: draft.text.trim(),
    startOffset: draft.startOffset + leadingWhitespace,
    endOffset: draft.endOffset - trailingWhitespace,
  };
}

function finalizeChunks(drafts: ChunkDraft[]): EmbeddingTextChunk[] {
  const nonEmptyDrafts = drafts.filter((draft) => draft.text.length > 0);
  const count = nonEmptyDrafts.length || 1;
  return (
    nonEmptyDrafts.length
      ? nonEmptyDrafts
      : [{ text: "", startOffset: 0, endOffset: 0 }]
  ).map((draft, index) => ({
    text: draft.text,
    index,
    count,
    startOffset: draft.startOffset,
    endOffset: draft.endOffset,
  }));
}
