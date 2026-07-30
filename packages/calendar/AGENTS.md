# packages/calendar — leaf rules

One imperative per line; mechanics + rationale live in
[docs/context/calendar/model.md](../../docs/context/calendar/model.md).

- **No I/O** — no DB, no `fetch`, no `node:fs`, no React, no Next. Pure functions only.
- A wall-clock time is a `CivilDateTime`/`LocalDateTime`; an instant is epoch **ms**.
  Never mix them, never accept a `Date` at a boundary.
- Never call `new Date()`, `Date.now()`, or `Date.parse` — callers pass the clock in.
- `Intl.DateTimeFormat` is for **computation only**, always pinned to
  `en-US-u-ca-iso8601`. Display formatting belongs to next-intl in `apps/web`.
- Offsets are **minutes**, never hours — `Pacific/Chatham` is +13:45 and
  `Australia/Lord_Howe` shifts by 30.
- Validate a TZID with `canonicalizeTimeZone`, never
  `Intl.supportedValuesOf("timeZone").includes(...)` — that rejects the legacy
  aliases real ICS files use.
- Expansion is **always window-bounded** — an unbounded series must never allocate
  past `to`.
- A new module joins the coverage run automatically (`all: true`); the gate is
  **100/100/100/100**.
- **The recurrence engine is only swappable until the first `recurrence_id` row
  exists.** `recurrence_id` is produced by this engine, so after Phase 2 ships data
  a different engine orphans override rows. The package boundary is a *code* seam,
  not a *data* seam — swapping later costs a data migration.
