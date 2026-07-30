CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"uid" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"url" text,
	"color" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"visibility" text DEFAULT 'default' NOT NULL,
	"transparency" text DEFAULT 'opaque' NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"start_wall" timestamp(0) NOT NULL,
	"start_tzid" text NOT NULL,
	"end_wall" timestamp(0) NOT NULL,
	"end_tzid" text NOT NULL,
	"start_offset_minutes" smallint NOT NULL,
	"end_offset_minutes" smallint NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"recurrence_parent_id" uuid,
	"recurrence_id" timestamp(0),
	"rrule" text,
	"series_end_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_calendar_id_uid_recurrence_id_key" UNIQUE NULLS NOT DISTINCT("calendar_id","uid","recurrence_id"),
	CONSTRAINT "calendar_events_start_at_derived" CHECK ("calendar_events"."start_at" = ("calendar_events"."start_wall" - make_interval(mins => "calendar_events"."start_offset_minutes")) AT TIME ZONE 'UTC'),
	CONSTRAINT "calendar_events_end_at_derived" CHECK ("calendar_events"."end_at" = ("calendar_events"."end_wall" - make_interval(mins => "calendar_events"."end_offset_minutes")) AT TIME ZONE 'UTC'),
	CONSTRAINT "calendar_events_end_not_before_start" CHECK ("calendar_events"."end_at" >= "calendar_events"."start_at"),
	CONSTRAINT "calendar_events_span_bounded" CHECK ("calendar_events"."end_at" - "calendar_events"."start_at" <= interval '366 days'),
	CONSTRAINT "calendar_events_recurrence_pair" CHECK (num_nonnulls("calendar_events"."recurrence_parent_id", "calendar_events"."recurrence_id") <> 1),
	CONSTRAINT "calendar_events_override_not_recurring" CHECK ("calendar_events"."recurrence_parent_id" IS NULL OR "calendar_events"."rrule" IS NULL),
	CONSTRAINT "calendar_events_all_day_midnight" CHECK ("calendar_events"."all_day" IS FALSE OR ("calendar_events"."start_wall" = date_trunc('day', "calendar_events"."start_wall") AND "calendar_events"."end_wall" = date_trunc('day', "calendar_events"."end_wall")))
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"description" text,
	"color" text NOT NULL,
	"time_zone" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_recurrence_parent_id_calendar_events_id_fk" FOREIGN KEY ("recurrence_parent_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_concrete_idx" ON "calendar_events" USING btree ("calendar_id","start_at","end_at") WHERE "calendar_events"."rrule" IS NULL AND "calendar_events"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "calendar_events_recurring_idx" ON "calendar_events" USING btree ("calendar_id","series_end_at") WHERE "calendar_events"."rrule" IS NOT NULL AND "calendar_events"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "calendar_events_calendar_id_idx" ON "calendar_events" USING btree ("calendar_id");--> statement-breakpoint
CREATE INDEX "calendar_events_recurrence_parent_id_idx" ON "calendar_events" USING btree ("recurrence_parent_id");--> statement-breakpoint
CREATE INDEX "calendars_user_id_org_id_idx" ON "calendars" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_one_primary_idx" ON "calendars" USING btree ("user_id",coalesce("organization_id", '')) WHERE "calendars"."is_primary";--> statement-breakpoint
CREATE VIEW "public"."calendar_event_masters" AS (select "id", "calendar_id", "uid", "sequence", "title", "description", "location", "url", "color", "status", "visibility", "transparency", "all_day", "start_wall", "start_tzid", "end_wall", "end_tzid", "start_offset_minutes", "end_offset_minutes", "start_at", "end_at", "recurrence_parent_id", "recurrence_id", "rrule", "series_end_at", "deleted_at", "created_at", "updated_at" from "calendar_events" where ("calendar_events"."recurrence_parent_id" is null and "calendar_events"."deleted_at" is null));