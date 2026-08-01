CREATE TABLE "calendar_event_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"role" text DEFAULT 'required' NOT NULL,
	"status" text DEFAULT 'needs-action' NOT NULL,
	"comment" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_attendees_event_id_email_key" UNIQUE("event_id","email"),
	CONSTRAINT "calendar_event_attendees_email_lower" CHECK ("calendar_event_attendees"."email" = lower("calendar_event_attendees"."email")),
	CONSTRAINT "calendar_event_attendees_responded_pair" CHECK (("calendar_event_attendees"."responded_at" IS NULL) = ("calendar_event_attendees"."status" = 'needs-action'))
);
--> statement-breakpoint
ALTER TABLE "calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_event_attendees_user_id_idx" ON "calendar_event_attendees" USING btree ("user_id") WHERE "calendar_event_attendees"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "calendar_event_attendees_email_idx" ON "calendar_event_attendees" USING btree ("email");