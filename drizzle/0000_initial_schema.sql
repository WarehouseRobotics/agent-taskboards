CREATE TABLE `projects` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `repository_path` TEXT,
  `default_branch` TEXT,
  `metadata` TEXT NOT NULL DEFAULT '{}',
  `archived_at` INTEGER,
  `created_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  `updated_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER))
);

CREATE INDEX `projects_active_idx` ON `projects` (`archived_at`);
CREATE INDEX `projects_name_idx` ON `projects` (`name`);

CREATE TABLE `boards` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `project_id` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `metadata` TEXT NOT NULL DEFAULT '{}',
  `archived_at` INTEGER,
  `created_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  `updated_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX `boards_project_idx` ON `boards` (`project_id`);
CREATE INDEX `boards_project_active_idx` ON `boards` (`project_id`, `archived_at`);

CREATE TABLE `board_columns` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `board_id` TEXT NOT NULL,
  `key` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `position` INTEGER NOT NULL,
  `is_done` INTEGER NOT NULL DEFAULT 0,
  `created_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  `updated_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX `board_columns_board_position_idx` ON `board_columns` (`board_id`, `position`);
CREATE UNIQUE INDEX `board_columns_board_key_unique` ON `board_columns` (`board_id`, `key`);

CREATE TABLE `tasks` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `project_id` TEXT NOT NULL,
  `board_id` TEXT NOT NULL,
  `column_id` TEXT NOT NULL,
  `title` TEXT NOT NULL,
  `description` TEXT,
  `position` INTEGER NOT NULL,
  `priority` TEXT NOT NULL DEFAULT 'normal',
  `labels` TEXT NOT NULL DEFAULT '[]',
  `external_references` TEXT NOT NULL DEFAULT '[]',
  `metadata` TEXT NOT NULL DEFAULT '{}',
  `completed_at` INTEGER,
  `archived_at` INTEGER,
  `created_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  `updated_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (`column_id`) REFERENCES `board_columns` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);
CREATE INDEX `tasks_board_idx` ON `tasks` (`board_id`);
CREATE INDEX `tasks_board_column_position_idx` ON `tasks` (`board_id`, `column_id`, `position`);
CREATE INDEX `tasks_board_active_idx` ON `tasks` (`board_id`, `archived_at`);

CREATE TABLE `task_comments` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `project_id` TEXT NOT NULL,
  `board_id` TEXT NOT NULL,
  `task_id` TEXT NOT NULL,
  `author_type` TEXT NOT NULL,
  `author_name` TEXT,
  `author_ref` TEXT,
  `body` TEXT NOT NULL,
  `metadata` TEXT NOT NULL DEFAULT '{}',
  `created_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX `task_comments_task_created_idx` ON `task_comments` (`task_id`, `created_at`);
CREATE INDEX `task_comments_project_created_idx` ON `task_comments` (`project_id`, `created_at`);

CREATE TABLE `task_activity` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `project_id` TEXT NOT NULL,
  `board_id` TEXT NOT NULL,
  `task_id` TEXT NOT NULL,
  `actor_type` TEXT NOT NULL DEFAULT 'system',
  `actor_name` TEXT,
  `actor_ref` TEXT,
  `event_type` TEXT NOT NULL,
  `summary` TEXT NOT NULL,
  `data` TEXT NOT NULL DEFAULT '{}',
  `created_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX `task_activity_task_created_idx` ON `task_activity` (`task_id`, `created_at`);
CREATE INDEX `task_activity_project_created_idx` ON `task_activity` (`project_id`, `created_at`);
CREATE INDEX `task_activity_event_type_idx` ON `task_activity` (`event_type`);

CREATE TABLE `search_documents` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `source_type` TEXT NOT NULL,
  `source_id` TEXT NOT NULL,
  `project_id` TEXT,
  `board_id` TEXT,
  `task_id` TEXT,
  `chunk_key` TEXT NOT NULL,
  `title` TEXT,
  `body` TEXT NOT NULL,
  `body_hash` TEXT NOT NULL,
  `embedding_model` TEXT,
  `embedding_dimensions` INTEGER,
  `embedding_status` TEXT NOT NULL DEFAULT 'pending',
  `embedded_at` INTEGER,
  `embedding_error` TEXT,
  `metadata` TEXT NOT NULL DEFAULT '{}',
  `created_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  `updated_at` INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX `search_documents_source_idx` ON `search_documents` (`source_type`, `source_id`);
CREATE UNIQUE INDEX `search_documents_source_chunk_unique` ON `search_documents` (`source_type`, `source_id`, `chunk_key`);
CREATE INDEX `search_documents_project_idx` ON `search_documents` (`project_id`);
CREATE INDEX `search_documents_board_idx` ON `search_documents` (`board_id`);
CREATE INDEX `search_documents_task_idx` ON `search_documents` (`task_id`);
CREATE INDEX `search_documents_status_idx` ON `search_documents` (`embedding_status`);
