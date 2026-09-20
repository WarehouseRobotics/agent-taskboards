CREATE TABLE `prompt_categories` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `position` INTEGER NOT NULL,
  `default_key` TEXT,
  `metadata` TEXT NOT NULL DEFAULT '{}',
  `created_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  `updated_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER))
);

CREATE UNIQUE INDEX `prompt_categories_name_unique` ON `prompt_categories` (`name`);
CREATE UNIQUE INDEX `prompt_categories_default_key_unique` ON `prompt_categories` (`default_key`);
CREATE INDEX `prompt_categories_position_idx` ON `prompt_categories` (`position`);

CREATE TABLE `prompts` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `name` TEXT NOT NULL,
  `body` TEXT NOT NULL,
  `note` TEXT,
  `position` INTEGER NOT NULL,
  `usage_count` INTEGER NOT NULL DEFAULT 0,
  `last_used_at` INTEGER,
  `default_key` TEXT,
  `metadata` TEXT NOT NULL DEFAULT '{}',
  `created_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  `updated_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER))
);

CREATE UNIQUE INDEX `prompts_default_key_unique` ON `prompts` (`default_key`);
CREATE INDEX `prompts_position_idx` ON `prompts` (`position`);
CREATE INDEX `prompts_last_used_idx` ON `prompts` (`last_used_at`);

CREATE TABLE `prompt_category_links` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `prompt_id` TEXT NOT NULL,
  `category_id` TEXT NOT NULL,
  `position` INTEGER NOT NULL,
  `created_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  FOREIGN KEY (`prompt_id`) REFERENCES `prompts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (`category_id`) REFERENCES `prompt_categories` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE UNIQUE INDEX `prompt_category_links_prompt_category_unique` ON `prompt_category_links` (`prompt_id`, `category_id`);
CREATE INDEX `prompt_category_links_category_idx` ON `prompt_category_links` (`category_id`);

-- Seed the default prompt library. The values mirror
-- api/models/default-prompts.ts, which PromptService.restoreDefaults() uses
-- to reconcile system defaults later.
INSERT INTO `prompt_categories`
  (`id`, `name`, `description`, `position`, `default_key`)
VALUES
  ('prompt-category-planning', 'Planning', NULL, 0, 'planning'),
  ('prompt-category-implementing', 'Implementing', NULL, 1, 'implementing'),
  ('prompt-category-misc', 'Misc', NULL, 2, 'misc');

INSERT INTO `prompts`
  (`id`, `name`, `body`, `note`, `position`, `default_key`)
VALUES
  ('prompt-task-implementation', '▶️ Task Implementation', '/tasks-management' || char(32) || char(10) ||
    '' || char(10) ||
    'Let''s handle this task:' || char(10) ||
    '' || char(10) ||
    '{{TASK}}' || char(10) ||
    '' || char(10) ||
    'Plan first and pin key decisions with me, then implement. When creating the plan, include an "Assumptions" section that summarizes any assumptions made (if any) in the plan.' || char(10) ||
    '' || char(10) ||
    'Work on the current branch, commit the changes when done.' || char(9), 'Implement a taskboard task. Add contextual markdown documentation when available.', 0, 'task-implementation'),
  ('prompt-umbrella-implement', '☂️▶️  Umbrella Task Implement', '/tasks-management' || char(10) ||
    '' || char(10) ||
    'We''re working on an umbrella task: {{PARENT_TASK}}' || char(10) ||
    '' || char(10) ||
    'Now, let''s handle this subtask:' || char(10) ||
    '' || char(10) ||
    '{{TASK}}' || char(10) ||
    '' || char(10) ||
    'Plan first and pin key decisions with me, then implement. When creating the plan, include an "Assumptions" section that summarizes any assumptions made (if any) in the plan.' || char(10) ||
    '' || char(10) ||
    'Work on the current branch, commit the changes when done.', 'Implement a task as part of parent umbrella task. Add contextual markdown documentation when available.', 1, 'umbrella-implement'),
  ('prompt-epic-umbrella-implement', '☂️🦸 Epic+Umbrella Task Implement', '/tasks-management' || char(10) ||
    '' || char(10) ||
    'We''re working on an epic task: {{EPIC_TASK}}' || char(10) ||
    'and it''s subtask, which is also an umbrella group of tasks: {{PARENT_TASK}}' || char(10) ||
    '' || char(10) ||
    'Now, let''s handle this subtask:' || char(10) ||
    '' || char(10) ||
    '{{TASK}}' || char(10) ||
    '' || char(10) ||
    'Plan first and pin key decisions with me, then implement. When creating the plan, include an "Assumptions" section that summarizes any assumptions made (if any) in the plan.' || char(10) ||
    '' || char(10) ||
    'Work on the current branch, commit the changes when done.' || char(10) ||
    '', 'Implement a task as part of parent umbrella-epic chain. The epic task you have to paste yourself. Add contextual markdown documentation when available.', 2, 'epic-umbrella-implement'),
  ('prompt-code-review', '👮‍♂️ Code Review', '/tasks-management' || char(10) ||
    '' || char(10) ||
    'We just completed this task:' || char(10) ||
    '' || char(10) ||
    '{{TASK}}' || char(10) ||
    '' || char(10) ||
    'Prepare a code review of the related commit, checking for bugs, security, code quality issues and redundancy. No code changes, no running tests, just a review of the code.' || char(10) ||
    '' || char(10) ||
    'Format the findings as markdown with findings by priority P1, P2, ... etc.', 'Run a code review for a task implementation.', 3, 'code-review'),
  ('prompt-umbrella-code-review', '☂️👮‍♂️ Umbrella Task Code Review', '/tasks-management' || char(10) ||
    '' || char(10) ||
    'We''re working on an umbrella task: {{PARENT_TASK}}' || char(10) ||
    '' || char(10) ||
    'We just made progress on this subtask:' || char(10) ||
    '' || char(10) ||
    '{{TASK}}' || char(10) ||
    '' || char(10) ||
    '<note_from_developer>' || char(10) ||
    '</note_from_developer>' || char(10) ||
    '' || char(10) ||
    'Prepare a code review of the last commit, checking for bugs, security, code quality issues and redundancy. No code changes, no running tests, just a review of the code.' || char(10) ||
    '' || char(10) ||
    'Format the findings as markdown with findings by priority P1, P2, ... etc.', 'Run a code review for a task implementation with umbrella task in the context.', 4, 'umbrella-code-review'),
  ('prompt-epic-umbrella-code-review', '☂️🦸👮‍♂️ Epic+Umbrella Task Code Review', '/tasks-management ' || char(10) ||
    '' || char(10) ||
    'We''re working on an epic task: {{EPIC_TASK}}' || char(10) ||
    'and it''s subtask, which is also an umbrella group of tasks: {{PARENT_TASK}}' || char(10) ||
    '' || char(10) ||
    'We just made progress on this subtask:' || char(10) ||
    '' || char(10) ||
    '{{TASK}}' || char(10) ||
    '' || char(10) ||
    'Prepare a code review of the last commit, checking for bugs, security, code quality issues and redundancy. No code changes, no running tests, just a review of the code.', 'Run a code review for a task implementation with umbrella and epic in the context. The epic info you have to paste yourself.', 5, 'epic-umbrella-code-review'),
  ('prompt-post-review-compaction', '💼 Post-review compaction', '/compact We need to address external code review findings, but we''re running out of context window.', 'Sometimes it makes sense to compact your session before you apply code-review fixes.', 6, 'post-review-compaction'),
  ('prompt-address-review-findings', '🚑 Fix Review Findings', 'We''re working on this task: {{TASK}}' || char(10) ||
    '' || char(10) ||
    'A code review identified potential issues. Review them, reject false positives (or things intentionally deferred to other tasks) and address the ones that you think are worth fixing:' || char(10) ||
    '' || char(10) ||
    '<code_review_findings>' || char(10) ||
    '' || char(10) ||
    '</code_review_findings>' || char(10) ||
    '' || char(10) ||
    'In case of doubt or ambiguity, pin assumptions or decisions with me.', 'Fix code-review findings that you have to manually paste inside of the tag.', 7, 'address-review-findings'),
  ('prompt-task-follow-up', '⏯️ Task Follow-up', '/tasks-management' || char(32) || char(10) ||
    '' || char(10) ||
    'We need to do a follow-up for this task: {{TASK}}' || char(10) ||
    '' || char(10) ||
    '...' || char(10) ||
    '' || char(10) ||
    'Plan first and pin key decisions with me, then implement. When creating the plan, include an "Assumptions" section that summarizes any assumptions made (if any) in the plan.' || char(10) ||
    '' || char(10) ||
    'Work on the current branch, commit the changes when done.', 'Does a follow-up for an existing task (normally without creating a new task card).', 8, 'task-follow-up'),
  ('prompt-expand-task', '↔️ Expand Task', '/tasks-management' || char(32) || char(10) ||
    '' || char(10) ||
    'Please help me work out the details and the implementation plan for this task: {{TASK}}' || char(10) ||
    '' || char(10) ||
    'Plan first and pin key decisions with me, then update the description of the task. When creating the plan, include an "Assumptions" section that summarizes any assumptions made (if any) in the plan.', 'Plans and expands a task sketch into a full task spec. Give it a task with something loosely defined to get a refined version.', 9, 'expand-task'),
  ('prompt-create-scoped-tasks', '📝 Create scoped tasks', 'Now scope the plan into taskboard tasks for implementation by an AI agent. Tasks must be scoped and in reasonable order. Tasks must be scoped in chunks of work that can be done by a coding agent in a roughly 200K token session. Also – reference relevant doc files in the description for better task context.' || char(10) ||
    '' || char(10) ||
    'Create an umbrella task for the whole chain. For each task, populate the metadata.parentTaskId with the id of the umbrella task.' || char(10) ||
    '' || char(10) ||
    'Use board {{BOARD}}.' || char(10) ||
    '' || char(10) ||
    'Pin down key assumptions and decisions with me first.', 'Based on your current session (you would usually already have some planning results in it), generate a chain of tasks (plus umbrella) to implement the plan.', 10, 'create-scoped-tasks'),
  ('prompt-merge-conflicts-resolve', '🔀🛠️ Merge Conflicts Resolve', '/tasks-management' || char(10) ||
    '' || char(10) ||
    'We''re working on a task: {{TASK}}' || char(10) ||
    '' || char(10) ||
    'I''m merging git branches: `SOURCE_BRANCH` into `TARGET_BRANCH`.' || char(10) ||
    '' || char(10) ||
    'The unfinished merge is my current working copy state. I want to have a clean TARGET_BRANCH with all merge conflicts resolved.' || char(10) ||
    '' || char(10) ||
    'Help me resolve the merge conflicts. Fix the code first, then the docs. Pin down key decisions with me first, then implement.' || char(32) || char(10) ||
    '', NULL, 11, 'merge-conflicts-resolve'),
  ('prompt-virtual-rebase-merge-conflicts-assistance', '🔀🛠️ Virtual Rebase Merge Conflicts Assistance', '/tasks-management' || char(10) ||
    '' || char(10) ||
    'We''re working on this task: {{TASK}}' || char(10) ||
    '' || char(10) ||
    'I''m preparing my branch to be merged into branch MERGE_TARGET. To prepare for a clean final merge, I renamed my original branch FEATURE_BRANCH to FEATURE_BRANCH_VERSIONED, then I branched again from MERGE_TARGET and called the new branch FEATURE_BRANCH and then I merged FEATURE_BRANCH_VERSIONED into the new FEATURE_BRANCH. The unfinished merge is my current working copy state. I want to have a clean FEATURE_BRANCH with all merge conflicts resolved.' || char(10) ||
    '' || char(10) ||
    'Help me resolve the merge conflicts. Fix the code first, then the docs. Pin down key decisions with me first, then implement.' || char(32), 'Helps resolve a virtual rebase (when a source branch is merged into a clone of a target branch, e.g. feature-branch -> master-clone).', 12, 'virtual-rebase-merge-conflicts-assistance'),
  ('prompt-taskboard-loop', '♻️ Taskboard Loop Prompt', '/loop' || char(10) ||
    '/tasks-management' || char(10) ||
    '' || char(10) ||
    'On board {{BOARD}}, go through tasks in "Ready" one by one in order, for each do the following:' || char(10) ||
    '' || char(10) ||
    '<step index="1" model="Opus" thinking="high">' || char(10) ||
    'first, spawn an **Opus agent** (High thinking effort) that will take the first task that is not in progress, load its context, find the right spec context in the docs folder for it, will plan the implementation and implement the task on the current branch (leaving a comment in the task and moving it to In Review afterwards).' || char(10) ||
    '' || char(10) ||
    'This agent should then wait for a handoff from the review agent of step 2. Apply the fix suggestions (reject the ones that do not make sense). </step>' || char(10) ||
    '' || char(10) ||
    '<step index="2" model="Opus" thinking="high">' || char(10) ||
    'second, spawn a new **Opus agent** (High thinking effort) to review the pending changes with the following prompt:' || char(10) ||
    '' || char(10) ||
    '```' || char(10) ||
    'We''ve just completed the task <name and ID of the completed task>.' || char(10) ||
    '' || char(10) ||
    'Load relevant context from `docs/` and perform code review for bugs, code quality and redundancy.' || char(10) ||
    '' || char(10) ||
    'Hand off priority fixes to the next agent in step 3.' || char(10) ||
    '``` ' || char(10) ||
    '</step>' || char(10) ||
    '' || char(10) ||
    '<step index="3" model="Opus" thinking="high">' || char(10) ||
    'third, spawn a new **Opus agent** (High thinking effort) to fix the issues identified in the previous code review step, use the following prompt:' || char(10) ||
    '' || char(10) ||
    '```' || char(10) ||
    'We''re working on this task: <name and ID of the completed task>.' || char(10) ||
    '' || char(10) ||
    'A code review identified potential issues. Review them, reject false positives and address the ones that you think are worth fixing:' || char(10) ||
    '' || char(10) ||
    '<list of issues from code review results>' || char(10) ||
    '' || char(10) ||
    '``` </step>' || char(10) ||
    '' || char(10) ||
    '<step index="4" model="Opus" thinking="high">' || char(10) ||
    'fourth, spawn a new **Opus agent** (High thinking effort) to update the documentation and finalize the commit.' || char(10) ||
    '' || char(10) ||
    '```' || char(10) ||
    'We''ve just completed the task <name and ID of the completed task>.' || char(10) ||
    '' || char(10) ||
    'Look at the task comments and pending changes and update the spec documentation in <docs>.' || char(10) ||
    '' || char(10) ||
    'Afterwards do the git commit to whatever the current branch is. Move task to Done, mention commit hash in the comments.' || char(10) ||
    '``` ' || char(10) ||
    '</step>' || char(10) ||
    '' || char(10) ||
    'If you get an "API Error: 529 Overloaded" error when spawning new sub agents, stop the loop and inform the user.', 'Autonomously loops over tasks on a board that you specify using subagents for plan-implement-review-fix-finalize sequence.', 13, 'taskboard-loop');

INSERT INTO `prompt_category_links`
  (`id`, `prompt_id`, `category_id`, `position`)
VALUES
  ('prompt-link-task-implementation-implementing', 'prompt-task-implementation', 'prompt-category-implementing', 0),
  ('prompt-link-umbrella-implement-implementing', 'prompt-umbrella-implement', 'prompt-category-implementing', 0),
  ('prompt-link-epic-umbrella-implement-implementing', 'prompt-epic-umbrella-implement', 'prompt-category-implementing', 0),
  ('prompt-link-code-review-implementing', 'prompt-code-review', 'prompt-category-implementing', 0),
  ('prompt-link-umbrella-code-review-implementing', 'prompt-umbrella-code-review', 'prompt-category-implementing', 0),
  ('prompt-link-epic-umbrella-code-review-implementing', 'prompt-epic-umbrella-code-review', 'prompt-category-implementing', 0),
  ('prompt-link-post-review-compaction-implementing', 'prompt-post-review-compaction', 'prompt-category-implementing', 0),
  ('prompt-link-address-review-findings-implementing', 'prompt-address-review-findings', 'prompt-category-implementing', 0),
  ('prompt-link-task-follow-up-implementing', 'prompt-task-follow-up', 'prompt-category-implementing', 0),
  ('prompt-link-expand-task-planning', 'prompt-expand-task', 'prompt-category-planning', 0),
  ('prompt-link-create-scoped-tasks-planning', 'prompt-create-scoped-tasks', 'prompt-category-planning', 0),
  ('prompt-link-merge-conflicts-resolve-misc', 'prompt-merge-conflicts-resolve', 'prompt-category-misc', 0),
  ('prompt-link-virtual-rebase-merge-conflicts-assistance-misc', 'prompt-virtual-rebase-merge-conflicts-assistance', 'prompt-category-misc', 0),
  ('prompt-link-taskboard-loop-implementing', 'prompt-taskboard-loop', 'prompt-category-implementing', 0);
