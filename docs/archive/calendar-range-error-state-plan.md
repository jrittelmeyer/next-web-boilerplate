# Plan: render `calendar.range`'s error state (B2, Tier 4)

Backlog row: `docs/BACKLOG.md` B2 "Render `calendar.range`'s error state" —
promoted from `MAINTENANCE.md` Watch, whose own text calls the blank grid "the
part worth fixing." Effort S.

## Problem

`CalendarWorkspace` (`apps/web/src/components/calendar/calendar-workspace.tsx`)
runs `rangeQuery` (`trpc.calendar.range`) but never checks `rangeQuery.isError`.
On a 429 (the 20/min per-user bucket shared by all four calendar read
procedures — `apps/web/src/server/trpc/trpc.ts:148`) or any other query
failure, `rangeQuery.data` stays `undefined`, `events` resolves to `[]`, and
`MonthGrid` renders a plain empty month — visually identical to "no events
this month." `InvitesList` (`apps/web/src/components/calendar/invites-list.tsx:50-56`)
already hit and fixed this exact defect for `listInvites`; its docstring even
names `calendar.range`'s grid as the thing that taught the lesson. This row
applies the same fix to the grid itself.

## Non-goal: the 20/min bucket

The backlog text says "reconsider the bucket for paging while at it." Decision:
**leave it as-is.** `docs/context/calendar/api.md:180-182` documents the
per-procedure 20/min bucket as deliberate ("driving `range` hard cannot starve
`list`") and explicitly anticipates 24 month-arrow presses/minute tripping it
as expected, testable behavior — not a bug. Widening it would mean turning
`userRateLimitedProcedure` from a fixed procedure into a parametrized factory,
touching every consumer (`calendar.list`/`byId`/`listInvites`, `post.listMine`)
for a limit that's already been through one deliberate design pass. Out of
scope here; revisit only if real usage shows 20/min is actually too tight.

## Change

### 1. `calendar-workspace.tsx`

Add an `isError` branch, mirroring `InvitesList`'s pattern, in the same
conditional ladder that already picks between the calendars-pending skeleton /
empty state / grid:

```tsx
{calendarsQuery.isPending ? (
  <Skeleton className="h-96 w-full" />
) : calendars.length === 0 ? (
  <p ...>{t("noCalendars")}</p>
) : rangeQuery.isError ? (
  <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
    {t("rangeError")}
  </p>
) : (
  <MonthGrid ... />
)}
```

The `truncated` / `seriesTruncated` banners above the grid read
`rangeQuery.data?.truncated`, which is already `undefined`-safe on error, so
no change needed there — they simply won't render.

### 2. Translations

Add `Calendar.workspace.rangeError` to both `apps/web/messages/en.json` and
`es.json`, next to `truncated`/`noCalendars`:

- en: `"This month's events could not be loaded. Please try again."`
- es: `"No se han podido cargar los eventos de este mes. Inténtalo de nuevo."`

### 3. Docs

- `docs/context/calendar/api.md` — the `calendar.range` section currently has
  no note about the client render; add one sentence next to the existing
  20/min bucket paragraph (§ Reads) pointing at the fix, matching the pattern
  already there for `listInvites`.
- `docs/MAINTENANCE.md` — this row exists there today as the promoted-from-Watch
  citation; `BACKLOG.md`'s row already links back to it. No structural change
  needed, just confirm the cross-reference still reads correctly once the row
  moves to Shipped.
- `docs/BACKLOG.md` — move the row from "Open rows" to the "Shipped
  (strikethrough record)" table.
- `docs/PROJECT_STATUS.md` — add the history line per the standing convention.
- `CHANGELOG.md` — new `Fixed` entry.

### 4. Test

No existing render-level test covers `CalendarWorkspace`, and no e2e spec
drives `calendar.range` past its bucket (confirmed by search — the "24
month-arrow presses" language in `api.md` and the `trpcStatuses` assertions in
`calendar.spec.ts` / `calendar-invites.spec.ts` are about *avoiding* an
incidental 429 during unrelated flows, not about proving this render path).

Add one small, isolated e2e test (own `test()`, own signup, in a new file
`apps/web/e2e/calendar-range-error.spec.ts` so it doesn't compete with the
already-tight signup/read budgets in `calendar.spec.ts`):

1. Sign up one user, seed one calendar (`seedCalendar`) so `visibleCalendars`
   is non-empty and `rangeQuery` actually fires.
2. Drive `calendar.range` over its 20/min bucket directly via
   `page.request.get` (21 calls with the same shape the workspace itself
   sends) rather than 21 real UI month-arrow clicks — deterministic, and
   costs no extra signups.
3. Navigate to `/calendar` and assert the `rangeError` text is visible and
   that no event chip / empty-grid ambiguity exists — i.e. assert the message
   node directly, not an absence.

## Verification

Full gate (`pnpm lint` / `pnpm type-check` / `pnpm build`), scoped e2e run of
the new spec file only (`pnpm test:e2e -- calendar-range-error.spec.ts`), then
live-verify on `:3100` isn't necessary to trigger a real 429 there (rate
limiter is in-memory per-instance and shared budget is easy to trip
locally) — the e2e spec is the proof; a manual pass through the normal
calendar flow on `:3100` confirms no regression to the happy path.

## Contrarian

Not required: UI copy + a client-side render branch + a translation key +
docs, no schema/migration, no auth/RBAC, no template-surface path, no new
dependency.
