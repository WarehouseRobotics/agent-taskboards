import { describe, expect, it } from "vitest";
import {
  buildMetadataRows,
  collectTaskIdCandidates,
  looksLikeTaskId,
  metadataTaskLinkLimit,
} from "./task-metadata";

describe("looksLikeTaskId", () => {
  it("accepts the id shapes the API actually generates", () => {
    // Humanized `slug-xxxxxx` ids and the 21-character nanoids that predate them.
    expect(looksLikeTaskId("zd-0-zendesk-connector-zv98je")).toBe(true);
    expect(looksLikeTaskId("show-metadata-properties-in-1zht2x")).toBe(true);
    expect(looksLikeTaskId("-Es1yDoczgPQvR__i2j_f")).toBe(true);
  });

  it("rejects metadata values that merely look id-ish", () => {
    // Every one of these is a real value from the live database; a looser shape
    // test turns each into a task lookup that can only 404.
    for (const value of [
      "AYTM-12978",
      "SLACK-1-3",
      "120-150k",
      "04a",
      "enterobius-mvp",
      "destroyer_line",
      "~150K",
      "1/7",
      "docs/api-spec.md",
    ]) {
      expect(looksLikeTaskId(value)).toBe(false);
    }
  });
});

describe("buildMetadataRows", () => {
  it("returns no rows for missing or empty metadata", () => {
    expect(buildMetadataRows(null)).toEqual([]);
    expect(buildMetadataRows(undefined)).toEqual([]);
    expect(buildMetadataRows({})).toEqual([]);
  });

  it("preserves the key order the agent wrote", () => {
    const rows = buildMetadataRows({ sequence: 1, plan: "enterobius-mvp", dependsOn: [] });
    expect(rows.map((row) => row.key)).toEqual(["sequence", "plan", "dependsOn"]);
  });

  it("marks task-id strings and leaves other strings as text", () => {
    const [parent, plan] = buildMetadataRows({
      parentTaskId: "mvp1-04-static-app-c7bfv9",
      plan: "enterobius-mvp",
    });
    expect(parent.atoms).toEqual([{ kind: "taskId", text: "mvp1-04-static-app-c7bfv9" }]);
    expect(plan.atoms).toEqual([{ kind: "text", text: "enterobius-mvp" }]);
  });

  it("renders numbers and booleans as text atoms", () => {
    const rows = buildMetadataRows({ sequence: 1, agentExecutable: false });
    expect(rows[0].atoms).toEqual([{ kind: "text", text: "1" }]);
    expect(rows[1].atoms).toEqual([{ kind: "text", text: "false" }]);
  });

  it("gives every array item its own atom", () => {
    const [row] = buildMetadataRows({
      children: ["zd-1-zendesk-sdk-2cjmqw", "docs/api-spec.md"],
    });
    expect(row.kind).toBe("atoms");
    expect(row.atoms).toEqual([
      { kind: "taskId", text: "zd-1-zendesk-sdk-2cjmqw" },
      { kind: "text", text: "docs/api-spec.md" },
    ]);
  });

  it("keeps structured array items in place as compact JSON", () => {
    const [row] = buildMetadataRows({ steps: ["first", { id: 2 }] });
    expect(row.atoms).toEqual([
      { kind: "text", text: "first" },
      { kind: "text", text: '{"id":2}' },
    ]);
  });

  it("marks empty, blank, and null values so the key still shows", () => {
    const rows = buildMetadataRows({ dependsOn: [], note: "   ", branch: null });
    expect(rows.map((row) => row.empty)).toEqual([true, true, true]);
    expect(rows.map((row) => row.key)).toEqual(["dependsOn", "note", "branch"]);
  });

  it("renders a nested object as pretty JSON", () => {
    const [row] = buildMetadataRows({ decisions: { form: "preset library" } });
    expect(row.kind).toBe("json");
    expect(row.atoms).toEqual([]);
    expect(row.json).toBe('{\n  "form": "preset library"\n}');
  });

  it("survives a value that cannot be serialized", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const [row] = buildMetadataRows({ cyclic });
    expect(row.kind).toBe("json");
    expect(typeof row.json).toBe("string");
  });
});

describe("collectTaskIdCandidates", () => {
  it("collects task ids across rows without duplicates", () => {
    const rows = buildMetadataRows({
      umbrella: "zd-0-zendesk-connector-zv98je",
      children: ["zd-1-zendesk-sdk-2cjmqw", "zd-0-zendesk-connector-zv98je"],
      plan: "enterobius-mvp",
    });
    expect(collectTaskIdCandidates(rows)).toEqual([
      "zd-0-zendesk-connector-zv98je",
      "zd-1-zendesk-sdk-2cjmqw",
    ]);
  });

  it("caps how many ids one task may resolve", () => {
    const children = Array.from(
      { length: metadataTaskLinkLimit + 5 },
      (_, index) => `child-task-${String(index).padStart(6, "0")}`,
    );
    expect(collectTaskIdCandidates(buildMetadataRows({ children })))
      .toHaveLength(metadataTaskLinkLimit);
  });
});
