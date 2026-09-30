# Plan — `updateOccurrence` membership (B2, `audit-2026-09-23` R1+R2)

Status: **drafted, not signed off.**

## Problem

`apps/web/src/server/actions/calendar.ts:1313` (`updateOccurrence`, `scope: "this"`)
reuses `planSeriesCut`'s bounds check (`:424-458`) as a membership check. `planSeriesCut`
was written for `thisAndFollowing` cuts and only asks "is this date within the rule's own
`UNTIL`/`COUNT`, per the rule's own walk" — it does not know about `RDATE`/`EXDATE` rows
at all. Two consequences, both introduced by `425e53e`:

- **R1 (regression):** an `RDATE` past a bounded series' `UNTIL`/`COUNT` is a real,
  grid-emitted chip (`packages/calendar/src/occurrences.ts:228-233`; the composer submits
  it with `scope: "this"`, `event-composer.tsx:187-191`) but `planSeriesCut` refuses it
  (`:434` `cutMs > UNTIL`, `:448` `before >= COUNT`) because an `RDATE` never consumes the
  rule's own bound.
- **R2 (phantom accept):** an in-bounds date the rule's pattern never actually generates
  (e.g. a `BYDAY` mismatch) currently passes the bounds-only check and writes an override
  for an occurrence that doesn't exist.

## Fix — a new membership function, `updateOccurrence`-only

Add `checkOccurrenceMembership(target, rule, recurrenceId)` next to `planSeriesCut`,
**not** a change to `planSeriesCut` itself:

1. `loadRecurrenceDates(target.id)` → `{ exdates, rdates }`.
2. If `recurrenceId` is in `exdates` → refuse (`notInSeries`). Checked first, matching
   `occurrences.ts:236-241`'s precedence (EXDATE deletes after RDATE inserts, so EXDATE
   wins on a contradictory row).
3. Else if `recurrenceId` is in `rdates` → accept. RDATEs are explicit additions not
   subject to the rule at all (`occurrences.ts:225-227`'s own comment) — this is the R1 fix.
4. Else → a single-instant `expandRRule({ rule, dtstart, timeZone: target.startTzid,
   fromMs: cutMs, toMs: cutMs, limit: 1 })` hit. `expandRRule` still enforces the rule's
   own `UNTIL`/`COUNT` internally (`expand.ts:352,359`) regardless of the window, so this
   naturally refuses both a truly out-of-bounds date and an in-bounds date the pattern
   doesn't generate (R2) — accept iff `occurrences.length === 1`.

`updateOccurrence` (`:1313`) switches from `planSeriesCut` to this function; drop the
`fieldErrors`-only-half comment now that the call is membership-shaped, not cut-shaped.

## Decisions

- **EXDATE'd `recurrenceId`: refused.** Today it's silently accepted (bounds-only check
  never consulted `exdates`) — a latent bug the audit didn't separately number. "True
  membership" means the date names a real occurrence; an explicitly-skipped date isn't
  one. No product surface currently offers editing a skipped occurrence (the grid doesn't
  render a chip for it), so this closes a request-tampering gap, not a UI regression.
- **`splitSeries` (`:1401`) and `truncateSeries` (`:1863`) keep `planSeriesCut` as-is —
  RDATE stance unchanged.** Both are genuine `thisAndFollowing` cuts: the "kept" half's
  `COUNT`/`UNTIL` is inherently rule-relative (`before` = occurrences the rule's own walk
  produces strictly before the cut), and an RDATE doesn't consume the rule's `COUNT` or
  respect its `UNTIL` by definition. Splitting *at* an RDATE chip past a bound stays
  refused — extending membership there would require deciding what "the first half's
  rule" even means when the cut point isn't rule-generated, which is out of scope for a
  regression fix. `deleteEvent`'s `"this"` scope (`skipOccurrence`, `:1814`) never called
  `planSeriesCut` and is unaffected either way.

## Tests (`apps/web/src/server/actions/calendar.test.ts`, `updateEvent, scope: this`)

Pattern: `dbSelect.mockReturnValue(selectReturning([...]))` for `loadRecurrenceDates`
(precedent: `:1731`).

1. **RDATE past `UNTIL` is accepted** — bounded weekly rule, `dbSelect` returns one
   `{ kind: "rdate", dateWall: <date past UNTIL> }`, assert the write proceeds
   (`dbInsert` called, no `fieldErrors`).
2. **Non-generated in-bounds date is refused** — rule with a `BYDAY` gap, `dbSelect`
   returns `[]`, submit a same-window date the pattern skips, assert `fieldErrors`.
3. **EXDATE'd date is refused** — `dbSelect` returns one `{ kind: "exdate", dateWall:
   <a date the rule does generate> }`, assert `fieldErrors` even though the bare rule
   would accept it.

Existing `"refuses a recurrenceId that is not part of the series"` (`:1575`) stays green
unchanged — it submits a date outside a `COUNT=2` rule with no recurrence-date rows,
which still falls through to the `expandRRule` branch and is refused the same way.

## Docs / close-the-loop (same commit)

- `CHANGELOG.md:175` — the current entry claims `updateOccurrence` "now reuses
  `planSeriesCut`'s bound check"; that's the bug. Reword to describe the new
  `checkOccurrenceMembership` behavior and note the RDATE/EXDATE handling, framed as a
  correction of the `425e53e` entry rather than a new bullet.
- `docs/BACKLOG.md` — strike the B2 row (R1+R2), add strikethrough line to Shipped.
- `docs/PROJECT_STATUS.md` — one ≤250-char row.
- `docs/context/calendar/recurrence.md` — no existing membership statement found there;
  no change needed unless review finds one.

## Verification

- `pnpm --filter web test` (`calendar.test.ts`) at 100%; `pnpm --filter @repo/calendar
  test` untouched at 100/100/100/100.
- Full gate: `pnpm lint` · `pnpm type-check` · `pnpm build`.
- Fresh `:3100` prod build (`pnpm --filter web start --port 3100`), Postgres/Meili up
  (`docker compose -f docker/docker-compose.yml up -d`): bounded weekly series → add an
  RDATE past `UNTIL` → edit-this on that chip succeeds; a hand-built request for a
  non-generated in-bounds date is refused.
- `contrarian`: not required (not template surface, no schema change) unless this plan
  lands with no friction, per the standing rule.

## Effort

S — one new function (~15 lines), one call-site swap, three new tests, CHANGELOG
correction + BACKLOG/STATUS rows. Calendar +1 (per the backlog row).
