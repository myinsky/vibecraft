ALTER TABLE `custom_pages` ADD `archived_status` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_pages` ADD `archive_memo` varchar(500);--> statement-breakpoint
ALTER TABLE `page_upgrade_history` ADD `memo` varchar(500);--> statement-breakpoint
ALTER TABLE `posts` ADD `enableToc` boolean DEFAULT false NOT NULL;