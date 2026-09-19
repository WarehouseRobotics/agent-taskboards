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

  it("matches umbrella case-insensitively", () => {
    expect(
      resolveParentTaskId(
        task({ description: "UMBRELLA: ( id=epic-task-n1 )" }),
      ),
    ).toEqual({ taskId: "epic-task-n1", source: "umbrella-line" });
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
