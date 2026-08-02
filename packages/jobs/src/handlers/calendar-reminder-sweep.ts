import type { PgBoss } from "pg-boss";
import { calendarReminderSweepPayload } from "../queues";
import { runSweep } from "../reminders/run";

/**
 * Process one `calendar-reminder-sweep` tick (Phase 5).
 *
 * **A shell on purpose, and the thinness is load-bearing.** `src/handlers/**` is covered at
 * 90/90/80/90 by the unit config, while the DB-backed integration config reports no coverage
 * at all — so a fat handler here would be measured by a gate its real tests cannot feed.
 * Every branch lives in `reminders/sweep.ts` (pure, unit-tested) or `reminders/run.ts`
 * (I/O, integration-tested), and this file has none.
 *
 * It takes `boss` — the only handler in this package that does — because the sweeper enqueues
 * the deliveries it claims. See `runSweep` for why `enqueue()` is the wrong tool for that.
 */
export async function handleCalendarReminderSweep(boss: PgBoss, data: unknown): Promise<void> {
  calendarReminderSweepPayload.parse(data);
  const claimed = await runSweep(boss);
  if (claimed > 0) console.info(`[jobs] calendar-reminder-sweep claimed ${claimed} delivery(s)`);
}
