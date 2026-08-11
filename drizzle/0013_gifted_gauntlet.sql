ALTER TABLE `nav_items` ADD `sectionStyle` enum('featured','grid','apps') DEFAULT 'grid' NOT NULL;--> statement-breakpoint
ALTER TABLE `nav_items` ADD `description` varchar(200);