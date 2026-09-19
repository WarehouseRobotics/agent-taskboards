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
-- to re-create any deleted default rows later.
INSERT INTO `prompt_categories` (`id`, `name`, `description`, `position`, `default_key`)
VALUES (
  'prompt-category-umbrella',
  '☂️ Umbrella',
  'Prompts for working through umbrella tasks and their subtasks.',
  0,
  'umbrella'
);

INSERT INTO `prompts` (`id`, `name`, `body`, `position`, `default_key`)
VALUES (
  'prompt-umbrella-implement',
  '☂️ Umbrella Task Implement',
  '/tasks-management

We''re working on an umbrella task: {{PARENT_TASK}}

Now, let''s handle this subtask:

{{TASK}}

Plan first and pin key decisions with me, then implement. When creating the plan, include an "Assumptions" section that summarizes any assumptions made (if any) in the plan.

Work on the current branch, commit the changes when done.',
  0,
  'umbrella-implement'
);

INSERT INTO `prompts` (`id`, `name`, `body`, `position`, `default_key`)
VALUES (
  'prompt-umbrella-code-review',
  '☂️ Umbrella Task Code Review',
  '/tasks-management
We''re working on an umbrella task: {{PARENT_TASK}}

We just made progress on this subtask:

{{TASK}}

<note_from_developer>
</note_from_developer>

Prepare a code review of the last commit, checking for bugs, security, code quality issues and redundancy. No code changes, no running tests, just a review of the code.

Format the findings as markdown with findings by priority P1, P2, ... etc.',
  1,
  'umbrella-code-review'
);

INSERT INTO `prompts` (`id`, `name`, `body`, `position`, `default_key`)
VALUES (
  'prompt-address-review-findings',
  'Address Code Review Findings',
  'A code review identified potential issues. Review them, reject false positives (or things intentionally deferred to other tasks) and address the ones that you think are worth fixing:

<code_review_findings>

</code_review_findings>

In case of doubt or ambiguity, pin assumptions or decisions with me.',
  2,
  'address-review-findings'
);

INSERT INTO `prompt_category_links` (`id`, `prompt_id`, `category_id`, `position`)
VALUES
  ('prompt-link-umbrella-implement', 'prompt-umbrella-implement', 'prompt-category-umbrella', 0),
  ('prompt-link-umbrella-code-review', 'prompt-umbrella-code-review', 'prompt-category-umbrella', 1),
  ('prompt-link-address-review-findings', 'prompt-address-review-findings', 'prompt-category-umbrella', 2);
