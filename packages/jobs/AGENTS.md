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
- This package reaches **`@repo/db` + `@repo/email` only** — it cannot mint anything
  needing `apps/web`'s env (a worker without the signing secret signs *wrongly*, it does
  not fail to boot).
- `DEAD_LETTER_QUEUE` is deliberately NOT in `ALL_QUEUES`; `createQueue` is
  create-if-absent, so `updateQueue` stamps `deadLetter` onto existing queues.
- `enqueue()` stays a graceful no-op when unconfigured (with its server-only
  guard).
- The worker needs a **direct/session-mode DB connection** — transaction poolers
  break LISTEN/NOTIFY + advisory locks
  ([DATABASE.md](../../docs/context/DATABASE.md)).
- New handlers join the coverage include (`handlers/**` + `queues.ts`).
