CREATE TABLE `scripts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `source` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_scripts_updated_at` ON `scripts` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `script_plans` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `auto_apply` integer DEFAULT 1 NOT NULL,
  `continue_on_error` integer DEFAULT 1 NOT NULL,
  `priority` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_script_plans_priority` ON `script_plans` (`priority`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `script_plan_targets` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `plan_id` integer NOT NULL,
  `platform` text NOT NULL,
  `mode` text NOT NULL,
  `bundle` text,
  `process_name` text,
  `pid` integer
);
--> statement-breakpoint
CREATE INDEX `idx_script_plan_targets_plan_id` ON `script_plan_targets` (`plan_id`);
--> statement-breakpoint
CREATE INDEX `idx_script_plan_targets_match` ON `script_plan_targets` (`platform`, `mode`, `bundle`, `process_name`, `pid`);
--> statement-breakpoint
CREATE TABLE `script_plan_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `plan_id` integer NOT NULL,
  `script_id` integer NOT NULL,
  `position` integer NOT NULL,
  `inject_when` text NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_script_plan_items_plan_id` ON `script_plan_items` (`plan_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_script_plan_items_position` ON `script_plan_items` (`plan_id`, `position`);
