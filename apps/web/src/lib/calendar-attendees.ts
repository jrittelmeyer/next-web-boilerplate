import type { AttendeeInput } from "@repo/validators/calendar";

/**
 * The guest-list diff, as a pure function so the rule that matters most can be tested
 * without a database.
 *
 * **Re-submitting an unchanged attendee list must not reset anyone's RSVP.** The composer
 * posts the whole list on every save, so the naive implementation — delete everything and
 * re-insert — silently returns every guest to `needs-action` on a title edit. So does an
 * upsert that sets `status` in its conflict branch. The diff is by `email`, and an address
 * present in both sets lands in `unchanged`, which no writer touches: not updated, not
 * re-inserted, not re-notified.
 *
 * A **role** change on an otherwise-unchanged address is deliberately in `unchanged` too.
 * Phase 3 has no surface that edits a role on an existing guest, and treating a role edit
 * as remove-then-add would reset that person's response — the exact bug this function
 * exists to prevent. Phase 6 gets a role editor and can add a third bucket; until then
 * this is the honest answer rather than the tidy-looking one.
 *
 * Emails arrive already normalised (`attendeeInputSchema` lower-cases and trims, and
 * `calendar_event_attendees_email_lower` is the backstop), so comparison is plain string
 * equality. A duplicate address inside one submission collapses to a single `added` entry
 * rather than reaching `unique(event_id, email)` as a 23505.
 */
export interface AttendeeDiff {
  /** Insert these, then notify each one. */
  readonly added: readonly AttendeeInput[];
  /** Delete these addresses, then send each a cancellation. */
  readonly removed: readonly string[];
  /** Leave these strictly alone — the RSVP they carry is theirs. */
  readonly unchanged: readonly string[];
}

export function diffAttendees(
  existing: readonly { readonly email: string }[],
  submitted: readonly AttendeeInput[],
): AttendeeDiff {
  const before = new Set(existing.map((row) => row.email));
  const added: AttendeeInput[] = [];
  const unchanged: string[] = [];
  const seen = new Set<string>();

  for (const attendee of submitted) {
    if (seen.has(attendee.email)) continue;
    seen.add(attendee.email);
    if (before.has(attendee.email)) unchanged.push(attendee.email);
    else added.push(attendee);
  }

  return {
    added,
    removed: [...before].filter((email) => !seen.has(email)),
    unchanged,
  };
}
