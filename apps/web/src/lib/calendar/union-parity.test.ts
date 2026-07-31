import {
  CALENDAR_COLORS as DB_CALENDAR_COLORS,
  EVENT_STATUSES as DB_EVENT_STATUSES,
  EVENT_TRANSPARENCIES as DB_EVENT_TRANSPARENCIES,
  EVENT_VISIBILITIES as DB_EVENT_VISIBILITIES,
  RECURRENCE_DATE_KINDS as DB_RECURRENCE_DATE_KINDS,
} from "@repo/db/schema";
import {
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
 * The failure this prevents is already in the repo: `NOTIFICATION_TYPES` is
 * duplicated at `packages/validators/src/index.ts` and the consumer at
 * `apps/web/src/server/realtime/notification-bus.ts` `safeParse`s the payload and
 * **fails closed with no log, no error and no Sentry breadcrumb**. Add a member to
 * the DB side only and notifications of that type simply stop arriving, with
 * nothing anywhere saying why. Phase 3 extends this file to cover that pair as it
 * adds calendar notification types — at which point the two edits become one
 * commit because this test refuses to let them be two.
 *
 * Order is asserted, not just membership: these unions are `as const` tuples whose
 * first member is the default in both packages.
 */
describe("calendar union parity between @repo/db and @repo/validators", () => {
  const pairs = [
    ["CALENDAR_COLORS", CALENDAR_COLORS, DB_CALENDAR_COLORS],
    ["EVENT_STATUSES", EVENT_STATUSES, DB_EVENT_STATUSES],
    ["EVENT_VISIBILITIES", EVENT_VISIBILITIES, DB_EVENT_VISIBILITIES],
    ["EVENT_TRANSPARENCIES", EVENT_TRANSPARENCIES, DB_EVENT_TRANSPARENCIES],
    ["RECURRENCE_DATE_KINDS", RECURRENCE_DATE_KINDS, DB_RECURRENCE_DATE_KINDS],
  ] as const satisfies ReadonlyArray<readonly [string, readonly string[], readonly string[]]>;

  it.each(pairs)("%s is member-for-member identical, in order", (_name, validators, db) => {
    expect(validators).toEqual(db);
  });

  it("covers every union the calendar schema declares", () => {
    // A sixth union added to either package without a row above would otherwise be
    // unguarded — the whole class of bug this file exists for.
    expect(pairs).toHaveLength(5);
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
