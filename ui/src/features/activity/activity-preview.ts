const PREVIEW_LIMIT = 600;

export function activityCommentPreviewText(value: string) {
  const text = value
    .replace(/```[\s\S]*?```/g, (match) =>
      match
        .replace(/^```[^\n]*\n?/, "")
        .replace(/\n?```$/, ""),
    )
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, "")
    .replace(/[|`*_~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= PREVIEW_LIMIT) {
    return text;
  }

  return `${text.slice(0, PREVIEW_LIMIT - 3).trimEnd()}...`;
}
