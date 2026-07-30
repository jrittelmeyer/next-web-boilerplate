import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Per-user display preferences — the home for settings that must NOT widen the
 * Better Auth `user` table (see DATABASE.md → schema ownership; the same reason
 * `stripeCustomerId` lives on `subscriptions`).
 *
 * Named `user_preferences` rather than something calendar-specific on purpose:
 * time zone, week start and clock format govern every rendered timestamp in the
 * app — `/admin/audit` rows and invitation expiries as much as a calendar grid —
 * and the calendar is only the feature that finally forced the question.
 * `apps/web/src/i18n/request.ts` has carried a `timeZone: "UTC"` default with a
 * comment asking for exactly this override since it was written.
 *
 * Every preference column is NULLABLE and NULL means "inherit the default"
 * (app-wide for the zone, locale-derived for the rest). That distinguishes
 * "never chose" from "deliberately chose UTC", which a NOT NULL DEFAULT could
 * not — and it lets a row exist carrying only the one preference a user set.
 */

/** 0 = Sunday, 1 = Monday, 6 = Saturday — the three real-world week starts. */
export const WEEK_STARTS = [0, 1, 6] as const;
export type WeekStart = (typeof WEEK_STARTS)[number];

export const TIME_FORMATS = ["12h", "24h"] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

export const userPreferences = pgTable("user_preferences", {
  // Natural key, no surrogate uuid: a user has exactly one preferences row (the
  // `subscriptions.id` precedent for a meaningful key). Being the PK, this column
  // is already indexed, which satisfies the "index every FK" rule with no second
  // index — Postgres does not auto-index a *referencing* column, but it does
  // index a primary key.
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),

  /**
   * IANA zone id, validated against the runtime's own database before it is
   * written (`canonicalizeTimeZone` in `@repo/calendar`). Stored as the caller
   * supplied it once accepted — the runtime's "canonical" spelling is not stable
   * across Node versions (this ICU build resolves `Asia/Kolkata` to
   * `Asia/Calcutta`), so normalising on write would make stored values disagree
   * with each other after an upgrade. Aliases behave identically at conversion
   * time, so only text comparison would ever notice, and nothing compares zones
   * as text.
   */
  timeZone: text("time_zone"),
  weekStart: integer("week_start").$type<WeekStart>(),
  timeFormat: text("time_format").$type<TimeFormat>(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
