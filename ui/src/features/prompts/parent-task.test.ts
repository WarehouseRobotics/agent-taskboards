import { describe, expect, it } from "vitest";
import { resolveParentTaskId } from "./parent-task";

function task(overrides: {
  id?: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return {
    id: overrides.id ?? "task_current",
    description: overrides.description ?? null,
    metadata: overrides.metadata ?? {},
  };
}

describe("resolveParentTaskId", () => {
  it("prefers metadata.parentTaskId", () => {
    expect(
      resolveParentTaskId(
        task({
          metadata: { parentTaskId: "task_parent" },
          description: 'Umbrella: "Epic" ( id=task_other )',
        }),
      ),
    ).toEqual({ taskId: "task_parent", source: "metadata" });
  });

  it("ignores a metadata parent pointing at the task itself", () => {
    expect(
      resolveParentTaskId(task({ metadata: { parentTaskId: "task_current" } })),
    ).toBeNull();
  });

  it("ignores a whitespace-padded metadata self reference", () => {
    expect(
      resolveParentTaskId(task({ metadata: { parentTaskId: " task_current " } })),
    ).toBeNull();
  });

  it("accepts legacy parent metadata keys", () => {
    for (const key of ["parentTask", "umbrellaTaskId", "umbrella"]) {
      expect(
        resolveParentTaskId(task({ metadata: { [key]: "task_parent" } })),
      ).toEqual({ taskId: "task_parent", source: "metadata" });
    }
  });

  it("prefers parentTaskId over a legacy key", () => {
    expect(
      resolveParentTaskId(
        task({
          metadata: { umbrella: "task_legacy", parentTaskId: "task_parent" },
        }),
      ),
    ).toEqual({ taskId: "task_parent", source: "metadata" });
  });

  it("ignores metadata values that are not shaped like a task id", () => {
    expect(
      resolveParentTaskId(
        task({
          metadata: { umbrella: "Zendesk Connector" },
          description: 'Part of umbrella ( id=task_parent )',
        }),
      ),
    ).toEqual({ taskId: "task_parent", source: "umbrella-line" });
  });

  it("finds an umbrella line with an id reference", () => {
    expect(
      resolveParentTaskId(
        task({
          description:
            'Intro line with id=task_noise\nPart of umbrella task "Epic" ( id=task_parent )',
        }),
      ),
    ).toEqual({ taskId: "task_parent", source: "umbrella-line" });
  });

  it("matches a labelled umbrella line case-insensitively", () => {
    expect(
      resolveParentTaskId(
        task({ description: "UMBRELLA: ( id=epic-task-n1 )" }),
      ),
    ).toEqual({ taskId: "epic-task-n1", source: "label-line" });
  });

  it("matches an unlabelled umbrella mention case-insensitively", () => {
    expect(
      resolveParentTaskId(
        task({ description: "Rolls up to the UMBRELLA ( id=epic-task-n1 )" }),
      ),
    ).toEqual({ taskId: "epic-task-n1", source: "umbrella-line" });
  });

  it("reads a bare parent id from each supported label", () => {
    for (const label of [
      "Umbrella task",
      "Umbrella",
      "Parent task",
      "Parent",
    ]) {
      expect(
        resolveParentTaskId(task({ description: `${label}: task_parent` })),
      ).toEqual({ taskId: "task_parent", source: "label-line" });
    }
  });

  it("matches labels case-insensitively", () => {
    for (const label of ["UMBRELLA TASK", "umbrella task", "pArEnT"]) {
      expect(
        resolveParentTaskId(
          task({ description: `${label}: prompt-library-tools-n084qh` }),
        ),
      ).toEqual({ taskId: "prompt-library-tools-n084qh", source: "label-line" });
    }
  });

  it("tolerates markdown decoration around a label", () => {
    for (const line of [
      "- Umbrella task: task_parent",
      "* **Umbrella task:** task_parent",
      "> **Parent**: task_parent",
      "  Parent task:   task_parent",
    ]) {
      expect(resolveParentTaskId(task({ description: line }))).toEqual({
        taskId: "task_parent",
        source: "label-line",
      });
    }
  });

  it("strips wrappers and trailing punctuation from a labelled id", () => {
    for (const line of [
      "Umbrella task: `task_parent`",
      'Parent: "task_parent".',
      "Umbrella: (task_parent)",
      "Parent task: task_parent;",
    ]) {
      expect(resolveParentTaskId(task({ description: line }))).toEqual({
        taskId: "task_parent",
        source: "label-line",
      });
    }
  });

  it("prefers an id= reference on the label line over the bare value", () => {
    expect(
      resolveParentTaskId(
        task({ description: 'Umbrella task: "Epic" ( id=task_parent )' }),
      ),
    ).toEqual({ taskId: "task_parent", source: "label-line" });
  });

  it("prefers a label line over a later id reference", () => {
    expect(
      resolveParentTaskId(
        task({
          description: "Intro with id=task_noise\nParent: task_parent",
        }),
      ),
    ).toEqual({ taskId: "task_parent", source: "label-line" });
  });

  it("prefers metadata over a label line", () => {
    expect(
      resolveParentTaskId(
        task({
          metadata: { parentTaskId: "task_meta" },
          description: "Umbrella task: task_parent",
        }),
      ),
    ).toEqual({ taskId: "task_meta", source: "metadata" });
  });

  it("accepts a labelled id of exactly 96 characters", () => {
    const id = "a".repeat(96);
    expect(
      resolveParentTaskId(task({ description: `Umbrella task: ${id}` })),
    ).toEqual({ taskId: id, source: "label-line" });
  });

  it("rejects a labelled id longer than 96 characters", () => {
    expect(
      resolveParentTaskId(
        task({ description: `Umbrella task: ${"a".repeat(97)}` }),
      ),
    ).toBeNull();
  });

  it("falls through when a labelled value is not a bare id", () => {
    expect(
      resolveParentTaskId(
        task({
          description:
            "Umbrella: The Big Epic\nSee the tracker ( id=task_parent )",
        }),
      ),
    ).toEqual({ taskId: "task_parent", source: "description-id" });
  });

  it("does not treat a mid-sentence label as a parent reference", () => {
    expect(
      resolveParentTaskId(
        task({ description: "This is part of the umbrella: task_parent" }),
      ),
    ).toBeNull();
  });

  it("skips a label line that names the task itself", () => {
    expect(
      resolveParentTaskId(
        task({
          id: "task_self",
          description: "Parent: task_self\nUmbrella task: task_parent",
        }),
      ),
    ).toEqual({ taskId: "task_parent", source: "label-line" });
  });

  it("falls back to the first id reference in the description", () => {
    expect(
      resolveParentTaskId(
        task({
          description: 'See "Other" ( id=task_first ) and ( id=task_second )',
        }),
      ),
    ).toEqual({ taskId: "task_first", source: "description-id" });
  });

  it("skips self references in the description", () => {
    expect(
      resolveParentTaskId(
        task({
          id: "task_self",
          description: "This task is ( id=task_self ) then ( id=task_other )",
        }),
      ),
    ).toEqual({ taskId: "task_other", source: "description-id" });
  });

  it("returns null when nothing matches", () => {
    expect(resolveParentTaskId(task({ description: "plain text" }))).toBeNull();
  });
});
