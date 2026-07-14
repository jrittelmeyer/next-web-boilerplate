DROP INDEX "posts_created_at_id_idx";--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_org_id_created_at_id_idx" ON "posts" USING btree ("organization_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);