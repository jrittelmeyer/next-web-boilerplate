/**
 * The one place an event's time is rendered for an email.
 *
 * **This package renders EVENT-ZONE time only** — the event's own time, in the event's own
 * zone, with the zone named. That is a narrower rule than "never format a date here", which
 * is what the leaf file said before Phase 5, and the narrowing is deliberate rather than a
 * relaxation:
 *
 * - **Reader-relative rendering still belongs to `apps/web`**, where next-intl and
 *   `user_preferences` live. Nothing here reads a reader's locale or zone, and nothing here
 *   should.
 * - Phase 4 could keep this in `apps/web` because `apps/web` was the producer: it held the
 *   transaction and minted every invitation payload. **Phase 5 inverts the producer.** The
 *   reminder sweeper runs in `@repo/jobs`, which cannot import `apps/web`, so the choice
 *   became "one home both callers share" or "two English formatters that drift into
 *   rendering the same event two different ways in two different emails".
 * - `@repo/email` is where the templates that consume it already live, and both callers
 *   already depend on it. No new dependency edge exists because of this.
 *
 * ⚠️ **Known, accepted, and not a bug to be fixed by accident:** the output is en-GB for
 * every recipient, in the event's zone rather than the reader's. For a Phase-4 invitation
 * that is forced — an external guest has no account, so no stored locale and no stored zone.
 * For a Phase-5 reminder the reader *does* have both (`user_preferences.timeZone`), and this
 * still sends en-GB. Reader-relative email rendering is unimplemented, tracked as a Phase-6
 * item, and recorded in DECISIONS.md. Do not "fix" it here by reaching for a locale this
 * package has no way to know.
 */
export function formatEventWhen(event: {
  startWall: string;
  startTzid: string;
  allDay: boolean;
}): string {
  const [datePart = "", timePart = ""] = event.startWall.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
    // Formatting the civil reading as if it were UTC is what keeps the wall clock intact:
    // the zone is stated separately below, never applied twice.
  }).format(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));

  if (event.allDay) return `${formatted} (all day)`;
  return `${formatted} at ${timePart.slice(0, 5)} (${event.startTzid})`;
}
