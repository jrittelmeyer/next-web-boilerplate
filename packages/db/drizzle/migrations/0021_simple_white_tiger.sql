CREATE TABLE "calendar_recurrence_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"date_wall" timestamp(0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_recurrence_dates_event_id_kind_date_wall_key" UNIQUE("event_id","kind","date_wall")
);
--> statement-breakpoint
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_recurrence_parent_id_calendar_events_id_fk";
--> statement-breakpoint
DROP INDEX "calendar_events_recurrence_parent_id_idx";--> statement-breakpoint
ALTER TABLE "calendar_recurrence_dates" ADD CONSTRAINT "calendar_recurrence_dates_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_id_calendar_id_key" UNIQUE("id","calendar_id");--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_parent_same_calendar" FOREIGN KEY ("recurrence_parent_id","calendar_id") REFERENCES "public"."calendar_events"("id","calendar_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "calendar_events_override_idx" ON "calendar_events" USING btree ("recurrence_parent_id","recurrence_id") WHERE "calendar_events"."recurrence_parent_id" IS NOT NULL;
