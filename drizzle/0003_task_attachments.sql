CREATE TABLE `task_attachments` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `project_id` TEXT NOT NULL,
  `board_id` TEXT NOT NULL,
  `task_id` TEXT NOT NULL,
  `relative_path` TEXT NOT NULL,
  `original_name` TEXT NOT NULL,
  `content_type` TEXT NOT NULL,
  `size_bytes` INTEGER NOT NULL,
  `created_at` INTEGER NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX `task_attachments_task_created_idx` ON `task_attachments` (`task_id`, `created_at`);
CREATE INDEX `task_attachments_project_created_idx` ON `task_attachments` (`project_id`, `created_at`);
CREATE UNIQUE INDEX `task_attachments_relative_path_unique` ON `task_attachments` (`relative_path`);
