import "server-only";
import { canonicalizeTimeZone } from "@repo/calendar";
import { db } from "@repo/db";
import type { TimeFormat, WeekStart } from "@repo/db/schema";
import { userPreferences } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { Locale } from "@/i18n/routing";

/**
 * Resolves a user's display preferences, filling every unset field with a
 * defensible default.
 *
 * Read straight from Postgres rather than off the session, deliberately: Better
 * Auth's session cookie cache is up to five minutes stale, so a user who just
 * changed their time zone would keep seeing the old one until the cache rolled —
 * on the very screen where they changed it. A primary-key lookup on a page that
 * is already dynamic is the cheaper mistake.
 */

/**
 * Matches the `timeZone` in `apps/web/src/i18n/request.ts`. UTC is deterministic
 * and identical on the server and the client, which is what keeps a signed-out
 * or preference-less render free of hydration mismatches.
 */
export const DEFAULT_TIME_ZONE = "UTC";

/**
 * The first day of the week is a locale fact, not a runtime one. Deliberately a
 * hand-maintained map rather than `Intl.Locale#getWeekInfo()`: support for that is
 * uneven, and — fatally — Node and the browser can disagree, which turns a week
 * grid into a hydration mismatch. Extend this alongside `routing.locales`, the
 * same convention as `OG_LOCALES` and `LOCALE_NAMES`.
 */
const LOCALE_WEEK_START: Record<Locale, WeekStart> = { en: 0, es: 1 };

const LOCALE_TIME_FORMAT: Record<Locale, TimeFormat> = { en: "12h", es: "24h" };

export interface ResolvedUserPreferences {
  readonly timeZone: string;
  readonly weekStart: WeekStart;
  readonly timeFormat: TimeFormat;
  /** True when the user has explicitly chosen a zone, rather than inheriting UTC. */
  readonly hasTimeZone: boolean;
}

export async function resolveUserPreferences(
  userId: string,
  locale: Locale,
): Promise<ResolvedUserPreferences> {
  const row = await db.query.userPreferences.findFirst({
    columns: { timeZone: true, weekStart: true, timeFormat: true },
    where: eq(userPreferences.userId, userId),
  });

  // Re-validate on read, not just on write: a zone that was valid when stored can
  // be removed from the IANA database later, and a bad zone reaching
  // `Intl.DateTimeFormat` throws — which would take down every page that renders a
  // timestamp rather than degrading one preference.
  const storedZone = row?.timeZone ?? null;
  const timeZone = storedZone && canonicalizeTimeZone(storedZone) ? storedZone : DEFAULT_TIME_ZONE;

  return {
    timeZone,
    weekStart: row?.weekStart ?? LOCALE_WEEK_START[locale],
    timeFormat: row?.timeFormat ?? LOCALE_TIME_FORMAT[locale],
    hasTimeZone: timeZone !== DEFAULT_TIME_ZONE || storedZone === DEFAULT_TIME_ZONE,
  };
}
