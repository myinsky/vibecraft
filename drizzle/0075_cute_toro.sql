CREATE INDEX `idx_posts_cat_pub_del_pin_created` ON `posts` (`category`,`published`,`deletedAt`,`isPinned`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_posts_pub_del_created` ON `posts` (`published`,`deletedAt`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_posts_views` ON `posts` (`views`);--> statement-breakpoint
CREATE INDEX `idx_posts_slug` ON `posts` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_posts_custom_slug` ON `posts` (`customSlug`);