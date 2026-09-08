# Plan: B3 predicate-sensor long tail (remaining 12 items)

**Status: DRAFT — awaiting sign-off. Not yet built.**

Source: `docs/BACKLOG.md` → B3 "Predicate-sensor long tail" row, seeded by
`archive/PROJECT_AUDIT_2026-08-06.md` F2. The 2026-08-08 sweep's headline item
(per-user reminder scoping) shipped 2026-09-05; this plan covers the twelve
remaining named sites (`skipOccurrence` and the keyset tiebreak count as one
line each but cover multiple call sites).

The class gap (per F2 and `docs/context/TESTING.md` → "Predicate sensors"): unit
suites mock `.where()` away so a dropped/weakened conjunct is invisible to them;
`packages/db`'s integration suite can't import `apps/web` so it restates SQL by
hand; e2e only notices if a flow actually reads the decided column. tRPC routers
in particular carry **zero unit sensors as a class**. Two established closing
patterns (both already used for the F4/F6/reminder-scoping sensors):

- **Pattern A — spelling pin + planted-defect integration test.** A
  `packages/db` integration test seeds a fixture that only a correct predicate
  filters correctly, runs the *real* SQL, and asserts on the result set. A
  companion "spelling pin" in the `apps/web` unit suite binds the production
  code to the exact conjunct shape (so a refactor that silently drops it fails
  fast, without needing a live DB).
- **Pattern B — deciding-column e2e.** For router procedures or Server
  Components with no unit-testable module boundary, drive the real flow in the
  browser with a planted fixture and assert the deciding column's effect is
  visible (or absent) in the rendered page — the `getAttendeeUserId` /
  `apps/web/e2e/support/db.ts` template.

Every item below is closed with Pattern A unless noted otherwise. None are
user-visible regressions on a standard deploy today — this is coverage, not a
bugfix; nothing behavioral should change in production code except where a test
reveals an actual defect (not expected, but if one surfaces, stop and treat it
as its own fix + CHANGELOG entry, not silently folded into a coverage commit).

## Sites and sensor design

1. **calendar-rsvp deleted-event UPDATE guard** —
   `apps/web/src/server/actions/calendar-rsvp.ts:109-116`, the `EXISTS` half of
   `respondByToken`'s UPDATE `.where()`. Plant a soft-deleted event with a live
   attendee row in a `packages/db` integration test; assert the real UPDATE
   returns 0 rows / doesn't flip `status`+`responded_at`.

2. **primary-calendar demote `ne()` self-exclusion** —
   `apps/web/src/server/actions/calendar.ts:876`. Plant the promote-target
   calendar as the *already-incumbent* primary; assert the demote step doesn't
   clobber the row the same transaction is about to re-primary. Spelling pin on
   the compiled `where` asserting the `<>` token.

3. **splitSeries/truncateSeries `gte` cut edges** —
   `calendar.ts:1459-1473` (splitSeries) and `:1862-1875` (truncateSeries).
   Seed three occurrence rows straddling the cut (`< cut`, `== cut`, `> cut`);
   assert exactly the `>= cut` set is moved/deleted. Spelling pin on `>=`.

4. **skipOccurrence pair** — `calendar.ts:1801-1808`, the
   `(recurrenceParentId, recurrenceId)` pair scoping the override delete. Plant
   a same-`recurrenceId`-different-parent sibling and a
   same-parent-different-`recurrenceId` sibling; assert only the exact-pair row
   is deleted.

5. **removeAttendees event scope** — `calendar.ts:716-724`. Seed the same email
   as an attendee on two different events; remove it from event A; assert event
   B's attendee row survives.

6. **override-under-deleted-master / occurrence-detail / calendar-list-scope
   reads** — `apps/web/src/server/trpc/routers/calendar.ts:242-249` (list),
   `:558-561` + `:612-621` (byId). No importable module boundary (tRPC router,
   zero existing unit sensors) → **Pattern B**. Three assertions in one e2e
   spec: (a) list scoping — two calendars for one user, one org-scoped one
   personal, assert no cross-contamination; (b) occurrence-detail — two
   overrides sharing a `recurrenceId` under different masters, assert `byId`
   returns only the matching one; (c) deleted-master exclusion — soft-delete a
   master with a live override row still present, assert `byId(masterId)`
   returns nothing.

7. **markAllRead owner arm + unreadCount cross-user arm** —
   `apps/web/src/server/actions/notification.ts:76` and
   `apps/web/src/server/trpc/routers/notification.ts:104`. Seed unread
   notifications for two users; `markAllRead` as user A must leave user B's rows
   `read: false`; `unreadCount` as user A must reflect only A's rows.
   `unreadCount` has no test today (router, Pattern A via a `packages/db`
   integration test since the query shape is a plain `db.query` call, not
   dependent on request context beyond the userId argument).

8. **data-export audit `or()` completeness** —
   `apps/web/src/server/actions/data-export.ts:73-75`. Seed one audit row where
   the user is only `actorId` and one where only `targetId`; assert the export
   includes both — narrowing `or()` to one arm would silently drop half a
   user's GDPR export.

9. **expired-session listing + OAuth-only password card** —
   `apps/web/src/app/[locale]/(dashboard)/account/page.tsx:59` and `:82`. No
   module boundary (Server Component page) → **Pattern B**, two e2e
   assertions: (a) plant an expired session row alongside a live one, assert
   only the live one renders; (b) sign up via an OAuth-only fixture (no
   `credential` account row), assert the password card shows the social-only
   copy and no password form.

10. **keyset same-timestamp tiebreak (5 sites)** — `admin.ts:52-55`,
    `post.ts:77-80` (`list`), `post.ts:129-132` (`listMine`),
    `admin/page.tsx:82-85`, `admin/audit/page.tsx:98-102`. All share the same
    `or(lt(createdAt), and(eq(createdAt), lt(id)))` shape. One reusable
    `packages/db` integration-test helper that seeds ≥2 rows with an identical
    `createdAt`, paginates across the boundary, and asserts no row is
    duplicated or skipped — parameterized across the 5 sites' underlying
    tables (`user`, `post`, `auditLog`) rather than 5 hand-written copies.

11. **duplicate-title org arm** — `apps/web/src/server/actions/post.ts:99-106`.
    Seed the same title/author in two workspaces (personal + org, or org A +
    org B); assert `createPost` succeeds in the second despite the "duplicate"
    existing in the first.

12. **org role lookup** — `apps/web/src/lib/organization.ts:47-53`. Seed one
    user as a `member` of two different orgs with two different roles; assert
    `getOrgRole(orgA, user)` returns orgA's role, not orgB's — a
    privilege-escalation-shaped gap (org A's admin role leaking into org B's
    permission checks) if the `organizationId` conjunct were ever dropped.

## Build sequencing

Grouped by area so each commit is independently reviewable and gate-able, in
this order (roughly cheapest/most-isolated first):

1. **Calendar batch** (items 1–5) — all in `packages/db`'s existing
   `__tests__/integration/calendar-*.test.ts` suites + spelling pins in
   `apps/web/src/server/actions/calendar*.test.ts`.
2. **Notifications + data-export batch** (items 7–8) — new
   `packages/db/__tests__/integration/notification.test.ts` (or extend an
   existing one) + `data-export.test.ts` fixture addition.
3. **Org/post batch** (items 11–12) — extend
   `packages/db/__tests__/integration/` org/post coverage + unit call-arg
   assertions in `organization.test.ts`/`post.test.ts`.
4. **Keyset tiebreak batch** (item 10) — one shared integration-test helper,
   applied across the 5 sites.
5. **e2e batch** (items 6, 9) — two new/extended Playwright specs (Pattern B).
   Expect the standing [[e2e-local-flake]] signUp-dependent local-run issue;
   verify via CI per the usual workaround.

Each batch: full gate (lint/type-check/build) + `pnpm test`
(`packages/db` integration suite needs `test:integration`, DB-backed) before
moving to the next. Final step: one CHANGELOG **Added** entry covering the
whole row, `docs/BACKLOG.md` strikethrough, `docs/PROJECT_STATUS.md` history
line — same commit as the last batch, or one doc commit at the end covering
all batches (owner's call at sign-off).

## Explicitly out of scope

- Any behavioral change to the predicates themselves — this is coverage only.
  If a planted-defect test surprises us by finding the *real* code already
  wrong, stop and scope that as a separate fix.
- `contrarian` review: not template surface, not schema/auth/RBAC by itself
  (org role lookup touches RBAC-adjacent code but is read-only test coverage,
  not a schema/behavior change) — skip per CLAUDE.md's Skip list, unless the
  build surfaces a real defect that turns into a behavior change, at which
  point re-evaluate.

## Open question for sign-off

This is a 12-item, multi-area batch (Effort M per BACKLOG). Options:
(a) build all 12 in one plan-approved pass across the 5 batches above, one
PR/commit sequence; (b) approve the plan but ship batch-by-batch with a
mid-stream check-in; (c) scope down to a subset now and re-file the rest.
Recommend (a) — the batches are independent enough that a mid-course correction
costs nothing, and the whole row closes in one pass.
