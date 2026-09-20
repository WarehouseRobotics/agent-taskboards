import { describe, expect, it } from "vitest";
import { promptBodyTokens, renderPromptBody } from "./prompt-tokens";

describe("renderPromptBody", () => {
  it("replaces known tokens with their values", () => {
    expect(
      renderPromptBody("Task: {{TASK}}\nParent: {{PARENT_TASK}}", {
        TASK: '"Fix" ( id=task_1 )',
        PARENT_TASK: '"Epic" ( id=task_0 )',
      }),
    ).toBe('Task: "Fix" ( id=task_1 )\nParent: "Epic" ( id=task_0 )');
  });

  it("replaces every occurrence of a token", () => {
    expect(renderPromptBody("{{TASK}} and {{TASK}}", { TASK: "x" })).toBe(
      "x and x",
    );
  });

  it("strips braces from unresolved tokens so they stay visible", () => {
    expect(renderPromptBody("Parent: {{PARENT_TASK}}", { TASK: "x" })).toBe(
      "Parent: PARENT_TASK",
    );
  });

  it("leaves unknown and differently-cased tokens untouched", () => {
    expect(
      renderPromptBody("{{OTHER}} {{task}} {{ TASK }}", { TASK: "x" }),
    ).toBe("{{OTHER}} {{task}} {{ TASK }}");
    expect(renderPromptBody("{{board}} {{ PROJECT }}", { BOARD: "x" })).toBe(
      "{{board}} {{ PROJECT }}",
    );
  });

  it("replaces the board and project tokens", () => {
    expect(
      renderPromptBody("On {{BOARD}} of {{PROJECT}}", {
        BOARD: '"ui" ( id=board_1 )',
        PROJECT: '"agent-taskboards" ( id=project_1 )',
      }),
    ).toBe('On "ui" ( id=board_1 ) of "agent-taskboards" ( id=project_1 )');
  });

  it("strips braces from unresolved board and project tokens", () => {
    expect(renderPromptBody("{{BOARD}} / {{PROJECT}}", {})).toBe(
      "BOARD / PROJECT",
    );
  });

  it("does not let TASK shadow PARENT_TASK", () => {
    expect(
      renderPromptBody("{{PARENT_TASK}}", { TASK: "child", PARENT_TASK: "parent" }),
    ).toBe("parent");
  });
});

describe("promptBodyTokens", () => {
  it("reports which known tokens a body uses", () => {
    expect(promptBodyTokens("{{PARENT_TASK}} then {{TASK}} and {{TASK}}")).toEqual([
      "TASK",
      "PARENT_TASK",
    ]);
    expect(promptBodyTokens("no tokens {{OTHER}}")).toEqual([]);
  });

  it("reports tokens in registry order, not body order", () => {
    expect(
      promptBodyTokens("{{PROJECT}} {{BOARD}} {{PARENT_TASK}} {{TASK}}"),
    ).toEqual(["TASK", "PARENT_TASK", "BOARD", "PROJECT"]);
  });
});
