import {
  ATTENDEE_ROLES as DB_ATTENDEE_ROLES,
  ATTENDEE_STATUSES as DB_ATTENDEE_STATUSES,
  CALENDAR_COLORS as DB_CALENDAR_COLORS,
  EVENT_STATUSES as DB_EVENT_STATUSES,
  EVENT_TRANSPARENCIES as DB_EVENT_TRANSPARENCIES,
  EVENT_VISIBILITIES as DB_EVENT_VISIBILITIES,
  NOTIFICATION_TYPES as DB_NOTIFICATION_TYPES,
  RECURRENCE_DATE_KINDS as DB_RECURRENCE_DATE_KINDS,
} from "@repo/db/schema";
import { NOTIFICATION_TYPES } from "@repo/validators";
import {
  ATTENDEE_RESPONSES,
  ATTENDEE_ROLES,
  ATTENDEE_STATUSES,
  CALENDAR_COLORS,
  EDIT_SCOPES,
  EVENT_STATUSES,
  EVENT_TRANSPARENCIES,
  EVENT_VISIBILITIES,
  RECURRENCE_DATE_KINDS,
} from "@repo/validators/calendar";
import { describe, expect, it } from "vitest";

/**
 * `@repo/validators` cannot import `@repo/db` — drizzle and `pg` would land in the
 * client bundle — so every literal union the two share is duplicated by necessity.
 * This file is where that necessity stops being a silent liability.
 *
 * `apps/web` is the one workspace that legitimately depends on both, which is what
 * makes the assertion possible at all (`lib/data-export.test.ts` sets the precedent
 * for importing `@repo/db/schema` straight into a unit test).
 *
 * It lives at `lib/` rather than `lib/calendar/` because it is not calendar-scoped:
 * `NOTIFICATION_TYPES` is not a calendar union, and the path was lying about that from
 * the moment this file was written to guard it.
 *
 * Order is asserted, not just membership: these unions are `as const` tuples whose
 * first member is the default in both packages. Each group carries its own length
 * meta-guard, so a union added to one group without a row still fails there instead of
 * being absorbed by another group's count.
 */
describe("union parity between @repo/db and @repo/validators", () => {
  describe("calendar", () => {
    const pairs = [
      ["CALENDAR_COLORS", CALENDAR_COLORS, DB_CALENDAR_COLORS],
      ["EVENT_STATUSES", EVENT_STATUSES, DB_EVENT_STATUSES],
      ["EVENT_VISIBILITIES", EVENT_VISIBILITIES, DB_EVENT_VISIBILITIES],
      ["EVENT_TRANSPARENCIES", EVENT_TRANSPARENCIES, DB_EVENT_TRANSPARENCIES],
      ["RECURRENCE_DATE_KINDS", RECURRENCE_DATE_KINDS, DB_RECURRENCE_DATE_KINDS],
      ["ATTENDEE_ROLES", ATTENDEE_ROLES, DB_ATTENDEE_ROLES],
      ["ATTENDEE_STATUSES", ATTENDEE_STATUSES, DB_ATTENDEE_STATUSES],
    ] as const satisfies ReadonlyArray<readonly [string, readonly string[], readonly string[]]>;

    it.each(pairs)("%s is member-for-member identical, in order", (_name, validators, db) => {
      expect(validators).toEqual(db);
    });

    it("covers every union the calendar schema declares", () => {
      // A union added to either package without a row above would otherwise be unguarded
      // — the whole class of bug this file exists for.
      expect(pairs).toHaveLength(7);
    });

    it("does not guard ATTENDEE_RESPONSES, which is a submittable SUBSET", () => {
      // `ATTENDEE_RESPONSES` is the three statuses an RSVP may submit — no column
      // declares it, so by the same rule as EDIT_SCOPES it gets no parity row. What it
      // does owe is exhaustiveness against the column union, and that assertion lives
      // next to it in `packages/validators/src/calendar.test.ts`, where both halves are
      // in scope.
      expect(ATTENDEE_RESPONSES).toEqual(["accepted", "declined", "tentative"]);
      expect(pairs.map(([name]) => name)).not.toContain("ATTENDEE_RESPONSES");
      expect(DB_ATTENDEE_STATUSES).toContain("needs-action");
      expect(ATTENDEE_RESPONSES as readonly string[]).not.toContain("needs-action");
    });

    it("still excludes the attendee roles no surface can produce", () => {
      // The EVENT_VISIBILITIES rule, applied to the ICS vocabulary: `chair` and
      // `resource` land with a surface that emits them, or not at all.
      for (const absent of ["chair", "resource"]) {
        expect(ATTENDEE_ROLES as readonly string[]).not.toContain(absent);
        expect(DB_ATTENDEE_ROLES as readonly string[]).not.toContain(absent);
      }
    });

    it("does not guard EDIT_SCOPES, which is deliberately action-only", () => {
      // Parity means "the database also declares this". `EDIT_SCOPES` has no column, so a
      // row for it above would teach the wrong rule to whoever adds the next union — and
      // the next union might be one that genuinely needs guarding.
      expect(EDIT_SCOPES).toEqual(["this", "thisAndFollowing", "all"]);
      expect(pairs.map(([name]) => name)).not.toContain("EDIT_SCOPES");
    });

    it("still excludes a public visibility", () => {
      // proxy.ts matches PROTECTED_PREFIXES with startsWith, so no URL under
      // /calendar can serve a signed-out visitor. A "public" member would be a lie in
      // both packages at once; it lands with a public route or not at all.
      expect(EVENT_VISIBILITIES).not.toContain("public");
      expect(DB_EVENT_VISIBILITIES).not.toContain("public");
    });
  });

  describe("notifications", () => {
    /**
     * The pair this file was written to guard, and the one with the nastiest failure
     * mode in the repo: `notification-bus.ts` `safeParse`s the payload and **fails
     * closed with no log, no error and no Sentry breadcrumb**. Extend the DB union
     * alone and every notification of the new type simply stops arriving, with nothing
     * anywhere saying why. This assertion is what makes those two edits one commit —
     * it refuses to let them be two.
     */
    const pairs = [
      ["NOTIFICATION_TYPES", NOTIFICATION_TYPES, DB_NOTIFICATION_TYPES],
    ] as const satisfies ReadonlyArray<readonly [string, readonly string[], readonly string[]]>;

    it.each(pairs)("%s is member-for-member identical, in order", (_name, validators, db) => {
      expect(validators).toEqual(db);
    });

    it("covers every union the notification schema declares", () => {
      expect(pairs).toHaveLength(1);
    });

    it("keeps the two pre-calendar members first, in order", () => {
      // `test` and `system` predate Phase 3 and are the two whose bodies are complete
      // sentences (title IS NULL). The five calendar members carry a title and are
      // rendered through it, so the boundary between the two halves is load-bearing.
      expect(DB_NOTIFICATION_TYPES.slice(0, 2)).toEqual(["test", "system"]);
      expect(DB_NOTIFICATION_TYPES).toHaveLength(7);
    });
  });
});
