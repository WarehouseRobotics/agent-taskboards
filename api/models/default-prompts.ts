export interface DefaultPromptCategory {
  defaultKey: string;
  name: string;
  description: string | null;
  position: number;
}

export interface DefaultPrompt {
  defaultKey: string;
  name: string;
  body: string;
  position: number;
  categoryDefaultKeys: string[];
}

// Seed data shared by the 0006_prompt_library.sql migration and
// PromptService.restoreDefaults(). The migration carries the same values as
// SQL literals; prompt-service.test.ts asserts the two stay in sync.
export const defaultPromptCategories: DefaultPromptCategory[] = [
  {
    defaultKey: "umbrella",
    name: "☂️ Umbrella",
    description: "Prompts for working through umbrella tasks and their subtasks.",
    position: 0,
  },
];

export const defaultPrompts: DefaultPrompt[] = [
  {
    defaultKey: "umbrella-implement",
    name: "☂️ Umbrella Task Implement",
    body: `/tasks-management

We're working on an umbrella task: {{PARENT_TASK}}

Now, let's handle this subtask:

{{TASK}}

Plan first and pin key decisions with me, then implement. When creating the plan, include an "Assumptions" section that summarizes any assumptions made (if any) in the plan.

Work on the current branch, commit the changes when done.`,
    position: 0,
    categoryDefaultKeys: ["umbrella"],
  },
  {
    defaultKey: "umbrella-code-review",
    name: "☂️ Umbrella Task Code Review",
    body: `/tasks-management
We're working on an umbrella task: {{PARENT_TASK}}

We just made progress on this subtask:

{{TASK}}

<note_from_developer>
</note_from_developer>

Prepare a code review of the last commit, checking for bugs, security, code quality issues and redundancy. No code changes, no running tests, just a review of the code.

Format the findings as markdown with findings by priority P1, P2, ... etc.`,
    position: 1,
    categoryDefaultKeys: ["umbrella"],
  },
  {
    defaultKey: "address-review-findings",
    name: "Address Code Review Findings",
    body: `A code review identified potential issues. Review them, reject false positives (or things intentionally deferred to other tasks) and address the ones that you think are worth fixing:

<code_review_findings>

</code_review_findings>

In case of doubt or ambiguity, pin assumptions or decisions with me.`,
    position: 2,
    categoryDefaultKeys: ["umbrella"],
  },
];
