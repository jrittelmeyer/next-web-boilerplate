# packages/db — leaf rules

One imperative per line; mechanics + rationale live in
[docs/context/DATABASE.md](../../docs/context/DATABASE.md).

- **Never edit an applied migration** — forward-only; undo with a compensating
  migration (§ Migration workflow).
- Workflow: edit schema → generate → **review the SQL** → migrate; `db:push` is
  dev-only.
- Better Auth tables are **hand-maintained** (singular, camelCase — a deliberate
  exception; don't copy the style, never run `@better-auth/cli`).
- DESC index columns need `.nullsFirst()` or the planner skips the index.
- Postgres does **not** auto-index FK columns — index every FK you add.
- Never add the `pgboss` schema to Drizzle — pg-boss owns it (§ Background jobs).
- `src/` imports no other `@repo/*` package. **Tests may**: the integration suite
  devDepends on `@repo/calendar` so it can prove the real `deriveEventInstants`
  output satisfies `calendar_events_start_at_derived`. Asserting that against a
  reimplementation would prove nothing. `@repo/calendar` has zero **runtime**
  dependencies, so the runtime posture is unchanged.
- A composite FK can be emitted **before** the unique constraint it references —
  `0021` was generated that way and would have failed to apply. Reorder by hand;
  this is what "review the SQL" is for (§ Migration workflow).
- `calendar_event_masters` is the read surface for **list, count and detail** reads.
  The window/range query is the documented exception: it reads `calendar_events`
  directly and must spell out `rrule IS NULL AND deleted_at IS NULL`, or Postgres
  cannot prove `calendar_events_concrete_idx` applicable (measured: `Seq Scan`
  through the view). Never write through the view — Postgres makes it auto-updatable.
- Never write `start_at`/`end_at`/`*_offset_minutes` by hand — they come from
  `deriveEventInstants` in `@repo/calendar`, and the database rejects anything else.
- An override's FK is composite (`recurrence_parent_id`, `calendar_id`), so any write
  that sets a parent must set the master's `calendar_id` too. Its `ON UPDATE CASCADE`
  moves overrides when a master changes calendar — **bypassing `$onUpdate`, so those
  rows keep a stale `updated_at`**. Never derive change detection from it alone.
- Soft-deleting a series master does **not** soft-delete its overrides — they stay in
  the range query's concrete branch. The writer must do both in one transaction.
- Read `calendar_recurrence_dates` by partitioning on `kind`; an unrecognised value is
  a logged error, never a `WHERE kind = …` that drops it silently.
- Attendees hang off the **series master**: resolve `recurrence_parent_id ?? id` before
  any attendee read or write. Only `splitSeries` copies them
  ([attendees.md](../../docs/context/calendar/attendees.md)).
- Compare `calendar_event_attendees.email` to `user.email` as
  `attendees.email = lower($param)` — `user.email` has no lowercase CHECK, and
  `lower()` on the column side loses the index.
