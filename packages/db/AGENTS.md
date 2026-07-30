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
  reimplementation would prove nothing. `@repo/calendar` has zero dependencies, so
  the runtime posture is unchanged.
- `calendar_event_masters` is the read surface for **list, count and detail** reads.
  The window/range query is the documented exception: it reads `calendar_events`
  directly and must spell out `rrule IS NULL AND deleted_at IS NULL`, or Postgres
  cannot prove `calendar_events_concrete_idx` applicable (measured: `Seq Scan`
  through the view). Never write through the view — Postgres makes it auto-updatable.
- Never write `start_at`/`end_at`/`*_offset_minutes` by hand — they come from
  `deriveEventInstants` in `@repo/calendar`, and the database rejects anything else.
