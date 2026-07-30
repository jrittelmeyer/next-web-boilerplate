import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organization";

/**
 * A calendar — the container events belong to and the unit sharing is granted on
 * (Phase 6). Phase 1 ships owner-only access; `calendar_shares` and the ACL's share
 * and organization branches land later, which is why `lib/calendar-acl.ts` already
 * has their shape.
 *
 * Multi-tenancy follows the `posts` precedent verbatim: `organizationId` is NULLABLE
 * (`NULL` = the personal workspace, so a zero-org clone needs no backfill) and
 * `onDelete: "set null"` — deleting an organization orphans its calendars back to
 * the owner's personal workspace rather than destroying a year of someone's
 * schedule.
 *
 * Deliberately NOT covered by a platform-admin override anywhere in this subsystem:
 * an admin who can read every user's meeting titles is a privacy incident waiting to
 * happen. Admins get `/admin/audit` and the org-deletion cascade instead — see
 * docs/context/calendar/acl.md.
 */

/**
 * Chart tokens rather than raw hex: they are already defined for both themes in
 * `globals.css`, so a calendar colour cannot land unreadable in dark mode. Chips
 * tint these with `color-mix` and add a solid accent bar — never text on a
 * saturated fill, which fails `color-contrast` at chip type sizes.
 */
export const CALENDAR_COLORS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;
export type CalendarColor = (typeof CALENDAR_COLORS)[number];

export const calendars = pgTable(
  "calendars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // NULL = personal workspace. SET NULL on org delete orphans (never nukes).
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").$type<CalendarColor>().notNull(),
    /**
     * The zone new events in this calendar default to. Stored verbatim as the user
     * supplied it once `canonicalizeTimeZone` has accepted it — the runtime's
     * "canonical" spelling is not stable across Node versions (this ICU build
     * resolves `Asia/Kolkata` to `Asia/Calcutta`), so normalising on write would
     * make stored values disagree with each other after an upgrade.
     */
    timeZone: text("time_zone").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Postgres does not auto-index FK referencing columns. One composite serves the
    // owner scope (`user_id = $1 AND organization_id = $2 / IS NULL` — both valid
    // leading btree predicates) and the org-delete SET NULL scan, so no separate
    // organization_id index is needed. The posts_org_id_created_at_id_idx reasoning.
    index("calendars_user_id_org_id_idx").on(t.userId, t.organizationId),
    // At most one primary calendar per workspace. `coalesce` is IMMUTABLE and so is
    // index-legal; it is load-bearing rather than tidy, because NULL organization_id
    // values compare as distinct — without it every personal calendar would count as
    // a different workspace and all of them could be primary at once.
    uniqueIndex("calendars_one_primary_idx")
      .on(t.userId, sql`coalesce(${t.organizationId}, '')`)
      .where(sql`${t.isPrimary}`),
  ],
);

export type Calendar = typeof calendars.$inferSelect;
export type NewCalendar = typeof calendars.$inferInsert;
