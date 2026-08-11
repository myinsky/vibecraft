ALTER TABLE `users` ADD `agreedToTerms` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `agreedAt` timestamp;