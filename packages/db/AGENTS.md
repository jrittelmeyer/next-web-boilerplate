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
- `@repo/db` imports no other `@repo/*` package.
