ALTER TABLE "notifications" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_link_same_origin" CHECK ("notifications"."link" IS NULL OR (left("notifications"."link", 1) = '/' AND left("notifications"."link", 2) <> '//' AND left("notifications"."link", 2) <> '/\'));