CREATE TABLE `board_checkpoints` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `project_id` TEXT NOT NULL,
  `board_id` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `snapshot_version` INTEGER NOT NULL,
  `snapshot` TEXT NOT NULL DEFAULT '{}',
  `summary` TEXT NOT NULL DEFAULT '{}',
  `creator_type` TEXT NOT NULL,
  `creator_name` TEXT,
  `creator_ref` TEXT,
  `metadata` TEXT NOT NULL DEFAULT '{}',
  `created_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX `board_checkpoints_project_idx` ON `board_checkpoints` (`project_id`);
CREATE INDEX `board_checkpoints_board_created_idx` ON `board_checkpoints` (`board_id`, `created_at`);
