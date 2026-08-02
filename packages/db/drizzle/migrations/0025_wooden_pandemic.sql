CREATE TABLE "calendar_event_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"anchor" text DEFAULT 'start' NOT NULL,
	"offset_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_reminders_rule_key" UNIQUE("event_id","user_id","channel","anchor","offset_minutes"),
	CONSTRAINT "calendar_event_reminders_offset_bounded" CHECK ("calendar_event_reminders"."offset_minutes" BETWEEN -527040 AND 527040),
	CONSTRAINT "calendar_event_reminders_anchor_supported" CHECK ("calendar_event_reminders"."anchor" = 'start')
);
--> statement-breakpoint
CREATE TABLE "calendar_reminder_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_id" uuid NOT NULL,
	"occurrence_start_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_reminder_deliveries_reminder_id_occurrence_key" UNIQUE("reminder_id","occurrence_start_at")
);
--> statement-breakpoint
ALTER TABLE "calendar_event_reminders" ADD CONSTRAINT "calendar_event_reminders_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_reminders" ADD CONSTRAINT "calendar_event_reminders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_reminder_deliveries" ADD CONSTRAINT "calendar_reminder_deliveries_reminder_id_calendar_event_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."calendar_event_reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_event_reminders_user_id_idx" ON "calendar_event_reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendar_reminder_deliveries_created_at_idx" ON "calendar_reminder_deliveries" USING btree ("created_at");