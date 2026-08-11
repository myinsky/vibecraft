ALTER TABLE `sidebar_items` MODIFY COLUMN `itemType` enum('ad','link','slot','html-ad') NOT NULL DEFAULT 'ad';--> statement-breakpoint
ALTER TABLE `sidebar_items` ADD `htmlCode` text;