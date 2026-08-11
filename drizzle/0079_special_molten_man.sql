ALTER TABLE `vibe_apps` ADD `submissionStatus` enum('pending','approved','rejected','direct') DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE `vibe_apps` ADD `submittedBy` int;--> statement-breakpoint
ALTER TABLE `vibe_apps` ADD `rejectionReason` text;--> statement-breakpoint
ALTER TABLE `vibe_apps` ADD `pcDownloadUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `vibe_apps` ADD `pcOriginalFilename` varchar(500);--> statement-breakpoint
ALTER TABLE `vibe_apps` ADD `mobileDownloadUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `vibe_apps` ADD `mobileOriginalFilename` varchar(500);