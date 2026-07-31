import type { LocalDateTime } from "@repo/calendar";
import type { RecurrenceDateKind } from "@repo/validators/calendar";

/**
 * Partitions `calendar_recurrence_dates` rows by `kind` — **exhaustively**, never by
 * filtering.
 *
 * `kind` carries no CHECK (neither do `status`, `visibility` or `transparency`, and
 * inventing one for this column alone would be an inconsistency rather than a
 * safeguard), so a value that is neither member is possible: a future migration, a bad
 * import, a hand-edit. `WHERE kind = 'exdate'` would drop it silently, and the user's
 * "skip this occurrence" would then quietly do nothing, forever, while the unique
 * constraint happily accepted the row.
 *
 * That is exactly the shape `notification-bus.ts` has today — `safeParse`, fail closed,
 * no log — and the lesson from `NOTIFICATION_TYPES` is about the **reader**, not about
 * the parity test. So unrecognised rows come back in `unknown` and every caller logs
 * them. The partition stays pure; the logging belongs to whoever has a logger.
 */

/**
 * Annotated rather than inferred, so renaming a member of `RECURRENCE_DATE_KINDS`
 * breaks this file at the gate instead of quietly routing every row to `unknown`.
 */
const EXDATE: RecurrenceDateKind = "exdate";
const RDATE: RecurrenceDateKind = "rdate";

/** The minimum a row must expose. `kind` is `string`, not the union — that is the point. */
export interface RecurrenceDateRow {
  readonly kind: string;
  readonly dateWall: LocalDateTime;
}

export interface PartitionedRecurrenceDates {
  /** Occurrences the user skipped, by their original civil start. */
  readonly exdates: readonly LocalDateTime[];
  /** Extra occurrences. They take the master's nominal span. */
  readonly rdates: readonly LocalDateTime[];
  /** Rows whose `kind` is neither member. Loud, never dropped. */
  readonly unknown: readonly RecurrenceDateRow[];
}

export function partitionRecurrenceDates(
  rows: readonly RecurrenceDateRow[],
): PartitionedRecurrenceDates {
  const exdates: LocalDateTime[] = [];
  const rdates: LocalDateTime[] = [];
  const unknown: RecurrenceDateRow[] = [];

  for (const row of rows) {
    switch (row.kind) {
      case EXDATE:
        exdates.push(row.dateWall);
        break;
      case RDATE:
        rdates.push(row.dateWall);
        break;
      default:
        unknown.push(row);
    }
  }

  return { exdates, rdates, unknown };
}
