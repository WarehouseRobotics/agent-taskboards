// Task `metadata` is open-ended and agent-authored (see
// `docs/tasks-and-boards.md`), so the Properties section has to render whatever
// shape an agent wrote without a schema to lean on. This module turns one
// metadata object into flat rows the detail panel can lay out, and decides
// which string values are worth resolving as task links.

// Ids come in two shapes: the humanized `slug-xxxxxx` form produced by
// `api/services/task-id.ts`, and the 21-character nanoid used before it. The
// test is deliberately stricter than the one in `features/prompts/parent-task.ts`:
// that heuristic reads a single explicitly named parent key, while this one is
// applied to every string in the object, so a loose shape would turn values
// such as `AYTM-12978` or `120-150k` into doomed task lookups.
const humanizedTaskIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-z]{6}$/;
const legacyTaskIdPattern = /^[A-Za-z0-9_-]{21}$/;

// A task with a very long id array would otherwise issue one request per entry.
// The largest real arrays are well under this, so the cap only bounds the
// pathological case; ids past it still render, just as plain text.
export const metadataTaskLinkLimit = 32;

export type MetadataAtomKind = "text" | "taskId";

export interface MetadataAtom {
  kind: MetadataAtomKind;
  text: string;
}

export type MetadataRowKind = "atoms" | "json";

export interface MetadataRow {
  key: string;
  kind: MetadataRowKind;
  atoms: MetadataAtom[];
  json: string | null;
  empty: boolean;
}

export function looksLikeTaskId(value: string) {
  return humanizedTaskIdPattern.test(value) || legacyTaskIdPattern.test(value);
}

function atomFromScalar(value: string | number | boolean): MetadataAtom {
  if (typeof value === "string") {
    const text = value.trim();
    return { kind: looksLikeTaskId(text) ? "taskId" : "text", text };
  }

  return { kind: "text", text: String(value) };
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value))
    || typeof value === "boolean";
}

function atomsFromValue(value: unknown): MetadataAtom[] {
  if (isScalar(value)) {
    const atom = atomFromScalar(value);
    return atom.text ? [atom] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => (
      isScalar(item)
        ? atomsFromValue(item)
        // A structured array item has no useful row of its own, so it keeps its
        // place in the list as compact JSON rather than disappearing.
        : [{ kind: "text" as const, text: safeJson(item, false) }]
    ));
  }

  return [];
}

function safeJson(value: unknown, pretty: boolean) {
  try {
    const text = JSON.stringify(value, null, pretty ? 2 : 0);
    return typeof text === "string" ? text : String(value);
  } catch {
    // Cyclic or otherwise unserializable values must not take the panel down.
    return String(value);
  }
}

// Rows follow the key order the agent wrote, which usually carries intent
// (`sequence` before `dependsOn`), and no key is hidden or renamed: the key is
// what a reader would PATCH by.
export function buildMetadataRows(
  metadata: Record<string, unknown> | null | undefined,
): MetadataRow[] {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  return Object.entries(metadata).map(([key, value]) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return { key, kind: "json" as const, atoms: [], json: safeJson(value, true), empty: false };
    }

    const atoms = atomsFromValue(value);
    return { key, kind: "atoms" as const, atoms, json: null, empty: atoms.length === 0 };
  });
}

export function collectTaskIdCandidates(rows: MetadataRow[]) {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (const atom of row.atoms) {
      if (atom.kind !== "taskId" || seen.has(atom.text)) {
        continue;
      }
      seen.add(atom.text);
      ids.push(atom.text);
      if (ids.length >= metadataTaskLinkLimit) {
        return ids;
      }
    }
  }

  return ids;
}
