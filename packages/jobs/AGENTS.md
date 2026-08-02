# packages/jobs — leaf rules

One imperative per line; mechanics + rationale live in
[docs/context/services/jobs.md](../../docs/context/services/jobs.md).

- Add a job: name + Zod payload in `queues.ts` → handler in `handlers/` →
  register in `worker.ts`.
- Handlers **throw only on real errors** — throw = pg-boss retry (→ DLQ);
  unconfigured/no-op paths return normally.
- Payloads carry **ids where the row survives, denormalised data where the row is the
  thing being destroyed** — `calendarInvitation`'s cancel kind has no row left to read
  ([invitations.md](../../docs/context/calendar/invitations.md)).
- This package reaches **`@repo/db`, `@repo/email`, `@repo/calendar` and
  `@repo/validators`** — never `apps/web`. It still cannot mint anything needing
  `apps/web`'s env (a worker without the signing secret signs *wrongly*, it does not fail
  to boot); the one exception is the reminder email's optional `SITE_URL`, which **degrades
  to no link** rather than emitting `undefined/…`.
- **A scheduled job's removal must call `boss.unschedule(<queue>)`** — `boss.schedule`
  persists in `pgboss.schedule` keyed by queue name, so deleting the code leaves a row
  enqueueing into a queue nobody watches, forever.
- Handlers may **enqueue** only via the `boss` the worker passes in — never `enqueue.ts`,
  which builds a second pg-boss instance and swallows every error by design.
- A claim in `calendar_reminder_deliveries` commits **before** its delivery is enqueued;
  a failed enqueue must **compensate** (delete the claim) and rethrow, or the ledger says
  "delivered" for a reminder nobody got.
- `DEAD_LETTER_QUEUE` is deliberately NOT in `ALL_QUEUES`; `createQueue` is
  create-if-absent, so `updateQueue` stamps `deadLetter` onto existing queues.
- `enqueue()` stays a graceful no-op when unconfigured (with its server-only
  guard).
- The worker needs a **direct/session-mode DB connection** — transaction poolers
  break LISTEN/NOTIFY + advisory locks
  ([DATABASE.md](../../docs/context/DATABASE.md)).
- New handlers join the coverage include (`handlers/**` + `queues.ts` + `reminders/sweep.ts`
— the sweeper is named explicitly, not globbed: its `run.ts`/`site-url.ts` siblings are
I/O bootstrap and stay out).
