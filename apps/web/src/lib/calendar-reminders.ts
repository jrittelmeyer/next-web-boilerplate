import type { ReminderInput } from "@repo/validators/calendar";

/**
 * The reminder diff, as a pure function, for the same reason `diffAttendees` is one: the
 * rule that matters most has to be testable without a database.
 *
 * **Re-submitting an unchanged reminder must not re-send it.** The composer posts the whole
 * list on every save, so the naive delete-everything-and-re-insert returns a *new* row id —
 * and `calendar_reminder_deliveries` cascades on `reminder_id`, so the ledger recording
 * "this occurrence was already delivered" disappears with it. The next sweep would then
 * cheerfully re-deliver every reminder the user had already received, for every occurrence
 * still inside the grace window. A title edit would spam them.
 *
 * So a reminder present in both sets lands in `unchanged`, which no writer touches.
 *
 * **Identity is the whole tuple** — `(channel, anchor, offsetMinutes)` — because that is
 * exactly what `calendar_event_reminders_rule_key` is unique over. There is no partial
 * update: changing the offset from 15 to 30 minutes IS removing one reminder and adding
 * another, and it should re-arm, because the user asked for a different moment. Contrast
 * `diffAttendees`, where a role change is deliberately `unchanged` — there the row carries
 * someone's answer and must survive; here it carries only a delivery ledger that has become
 * irrelevant.
 *
 * A duplicate inside one submission collapses to a single `added` entry rather than reaching
 * the unique constraint as a 23505.
 */
export interface ReminderDiff {
  /** Insert these. */
  readonly added: readonly ReminderInput[];
  /** Delete these rows by id — their delivery ledger goes with them, which is correct. */
  readonly removed: readonly string[];
  /** Leave these strictly alone; their ledger is what stops a re-send. */
  readonly unchanged: readonly string[];
}

/** The unique key, minus the event and user that scope it. */
export function reminderKey(reminder: {
  readonly channel: string;
  readonly anchor: string;
  readonly offsetMinutes: number;
}): string {
  return `${reminder.channel}|${reminder.anchor}|${reminder.offsetMinutes}`;
}

export function diffReminders(
  existing: readonly {
    readonly id: string;
    readonly channel: string;
    readonly anchor: string;
    readonly offsetMinutes: number;
  }[],
  submitted: readonly ReminderInput[],
): ReminderDiff {
  const byKey = new Map(existing.map((row) => [reminderKey(row), row.id]));
  const added: ReminderInput[] = [];
  const unchanged: string[] = [];
  const keptKeys = new Set<string>();

  for (const reminder of submitted) {
    const key = reminderKey(reminder);
    if (keptKeys.has(key)) continue;
    keptKeys.add(key);

    const existingId = byKey.get(key);
    if (existingId) unchanged.push(existingId);
    else added.push(reminder);
  }

  const removed = existing.filter((row) => !keptKeys.has(reminderKey(row))).map((row) => row.id);

  return { added, removed, unchanged };
}
