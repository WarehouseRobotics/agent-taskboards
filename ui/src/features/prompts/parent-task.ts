import type { Task } from "../../domain/types";

export type ParentTaskSource =
  | "metadata"
  | "label-line"
  | "umbrella-line"
  | "description-id";

export interface ParentTaskReference {
  taskId: string;
  source: ParentTaskSource;
}

const taskIdPattern = /\bid=([A-Za-z0-9_-]+)/;
const taskIdShape = /^[A-Za-z0-9_-]+$/;

// Metadata keys that have been used for the same "this task's parent" idea.
// `parentTaskId` is the documented key (see skills/tasks-management/SKILL.md);
// the others are accepted so tasks created before it was documented still
// resolve.
const parentMetadataKeys = [
  "parentTaskId",
  "parentTask",
  "umbrellaTaskId",
  "umbrella",
];

// A description line that names the parent by bare id, e.g.
// `Umbrella task: prompt-library-tools-n084qh`. Anchored to the line start so
// prose that happens to say "part of the umbrella: ..." never matches; only
// markdown list, quote, and bold decoration may precede the label. The longer
// labels come first so the alternation prefers them.
const parentLabelPattern =
  /^[\s>*+-]*(?:umbrella task|umbrella|parent task|parent)\s*\**\s*:\s*\**\s*(.+)$/i;

// Ids are short in practice; the cap rejects a single run-on token that is
// clearly not an id, such as a pasted URL or a long hyphenated phrase.
const maxLabelTaskIdLength = 96;

const labelValueLeadingJunk = /^[`"'([]+/;
const labelValueTrailingJunk = /[`"')\].,;:]+$/;
const labelValueWrapped = /^[`"'([]/;

// Generated task ids are slug words joined by `-` plus a six-character
// lowercase suffix (see api/services/task-id.ts). This tighter shape is what
// lets an id be picked out of a label line that continues into prose, where
// the permissive shape would happily match an ordinary word.
const generatedTaskIdShape = /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{6}$/;

function stripLabelValueJunk(value: string) {
  return value
    .replace(labelValueLeadingJunk, "")
    .replace(labelValueTrailingJunk, "");
}

// The value after a `Umbrella task:` style label. An explicit `id=...` on the
// same line wins; otherwise the candidate is the value's first token, because
// a label is regularly followed by the id and then a sentence about it.
//
// How strictly that token is judged depends on what follows it. When it is the
// whole value there is nothing to confuse it with, so the permissive id shape
// applies and hand-written or legacy ids still resolve. When prose follows,
// the permissive shape would match any ordinary word, so the token has to be
// quoted or to look like a generated id before it is believed.
function labelLineTaskId(value: string): string | null {
  const explicit = taskIdPattern.exec(value);
  if (explicit) {
    return explicit[1];
  }

  const trimmed = value.trim();
  const [firstToken = ""] = trimmed.split(/\s+/, 1);
  const candidate = stripLabelValueJunk(firstToken);
  if (!candidate || candidate.length > maxLabelTaskIdLength) {
    return null;
  }

  if (firstToken.length === trimmed.length) {
    return taskIdShape.test(candidate) ? candidate : null;
  }

  const believable = labelValueWrapped.test(firstToken)
    ? taskIdShape.test(candidate)
    : generatedTaskIdShape.test(candidate);
  return believable ? candidate : null;
}

// Heuristic cascade for resolving a task's parent/umbrella task without a
// schema change: explicit metadata wins, then a description line that labels
// the parent (`Umbrella task:`, `Umbrella:`, `Parent task:`, `Parent:`), then
// a line that mentions "umbrella" alongside an id=... reference, then the
// first id=... reference anywhere in the description.
export function resolveParentTaskId(
  task: Pick<Task, "id" | "description" | "metadata">,
): ParentTaskReference | null {
  for (const key of parentMetadataKeys) {
    const value = task.metadata?.[key];
    if (typeof value !== "string") {
      continue;
    }
    // A value that is not shaped like a task id (a title, a flag) would only
    // produce a nonsense reference, so fall through to the description.
    const candidate = value.trim();
    if (candidate && candidate !== task.id && taskIdShape.test(candidate)) {
      return { taskId: candidate, source: "metadata" };
    }
  }

  const description = task.description ?? "";
  const lines = description.split("\n");

  for (const line of lines) {
    const label = parentLabelPattern.exec(line);
    if (!label) {
      continue;
    }
    const candidate = labelLineTaskId(label[1]);
    if (candidate && candidate !== task.id) {
      return { taskId: candidate, source: "label-line" };
    }
  }

  for (const line of lines) {
    if (!/umbrella/i.test(line)) {
      continue;
    }
    const match = taskIdPattern.exec(line);
    if (match && match[1] !== task.id) {
      return { taskId: match[1], source: "umbrella-line" };
    }
  }

  for (const match of description.matchAll(new RegExp(taskIdPattern, "g"))) {
    if (match[1] !== task.id) {
      return { taskId: match[1], source: "description-id" };
    }
  }

  return null;
}
