CREATE UNIQUE INDEX `projects_name_unique` ON `projects` (`name`);
CREATE UNIQUE INDEX `boards_project_name_unique` ON `boards` (`project_id`, `name`);

CREATE TRIGGER `projects_name_url_safe_insert`
BEFORE INSERT ON `projects`
FOR EACH ROW
WHEN NEW.name = '' OR NEW.name GLOB '*[^abcdefghijklmnopqrstuvwxyz0123456789_-]*'
BEGIN
  SELECT RAISE(ABORT, 'Project name must be URL-safe');
END;

CREATE TRIGGER `projects_name_url_safe_update`
BEFORE UPDATE OF `name` ON `projects`
FOR EACH ROW
WHEN NEW.name = '' OR NEW.name GLOB '*[^abcdefghijklmnopqrstuvwxyz0123456789_-]*'
BEGIN
  SELECT RAISE(ABORT, 'Project name must be URL-safe');
END;

CREATE TRIGGER `boards_name_url_safe_insert`
BEFORE INSERT ON `boards`
FOR EACH ROW
WHEN NEW.name = '' OR NEW.name GLOB '*[^abcdefghijklmnopqrstuvwxyz0123456789_-]*'
BEGIN
  SELECT RAISE(ABORT, 'Board name must be URL-safe');
END;

CREATE TRIGGER `boards_name_url_safe_update`
BEFORE UPDATE OF `name` ON `boards`
FOR EACH ROW
WHEN NEW.name = '' OR NEW.name GLOB '*[^abcdefghijklmnopqrstuvwxyz0123456789_-]*'
BEGIN
  SELECT RAISE(ABORT, 'Board name must be URL-safe');
END;
