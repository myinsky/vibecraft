ALTER TABLE `sidebar_items` ADD `menuStyle` enum('default','button','pill') DEFAULT 'default';--> statement-breakpoint
ALTER TABLE `sidebar_items` ADD `menuFontWeight` enum('normal','bold','extrabold') DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE `sidebar_items` ADD `menuBgColor` varchar(50);--> statement-breakpoint
ALTER TABLE `sidebar_items` ADD `menuBorderRadius` int DEFAULT 8;--> statement-breakpoint
ALTER TABLE `sidebar_items` ADD `menuFontSize` int DEFAULT 12;--> statement-breakpoint
ALTER TABLE `sidebar_items` ADD `menuHeaderHidden` boolean DEFAULT false;