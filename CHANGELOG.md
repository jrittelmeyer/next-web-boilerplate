# Changelog

Notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); since this is a template
(not a versioned library), `main` is always the supported version and entries mark
milestones rather than package releases. Each milestone is tagged (`v1.0.0`,
`v1.1.0`, …) with a matching
[GitHub Release](https://github.com/jrittelmeyer/next-web-boilerplate/releases).

## [Unreleased]

Shipped on `main` after the `v1.1.0` tag; not yet cut into a tagged milestone.

### Added

- **2026-08-14: `checkpoint-autorun.mjs` — a Stop hook that automates the
  `checkpoint` skill.** When a session goes idle with a dirty/unpushed tree, it
  forces one more turn that commits, pushes, watches CI, prunes the build cache,
  and writes a resume-prompt handoff — no confirmation prompt (standing
  authorization: `docs/context/DECISIONS.md` → checkpoint-autorun). Repo-scoped
  by design (checks the root `package.json` name) so the consent doesn't leak
  into projects scaffolded from this template; skips when the last message reads
  like a pending question or a rebase/merge/cherry-pick is in progress. A
  `contrarian` pass (Always-triggered — template surface) found and closed both
  gaps before this shipped.
- **2026-08-08: revert sensors for the two audit-F2 predicates, plus three read-gate
  sensors beside them** (the B2 assertion-blind-spot sweep; tests and docs only). The
  08-04 F4/F6-respond fixes could both be reverted with every CI lane green: the unit
  suite mocks the query builders, and `@repo/db`'s real-Postgres proofs *restate* the
  predicates across a package boundary they cannot import. Closed from both sides —
  **spelling pins** in `calendar.test.ts` compile the actions' captured `where`
  conditions (`PgDialect.sqlToQuery`) and assert the NULL-safe recipient pair and the
  `email_verified` EXISTS arm, each proven red under its revert, while the planted
  defects in `calendar-attendees.test.ts` keep proving those spellings' semantics —
  and **behavioral e2e sensors** on existing fixtures: deleting the invitations spec's
  event asserts the external guest's `reason:"cancelled"` job and their dead RSVP
  link; an account moved onto a co-invitee's address unverified re-responds and the
  victim row must keep its state and NULL identity; the unverified organizer's
  `/calendar/invites` stays empty (the read twin); and `calendar.range` queried with a
  foreign calendar id answers an empty window — the month grid's ownership conjunct's
  only sensor at any level. The sweep's remaining weak-sensor predicates are filed as
  one B3 backlog row (predicate-sensor long tail) rather than left untracked.
- **Calendar, Phase 3 — attendees, internal RSVP and live invite notifications.**
  Migration `0023` adds `calendar_event_attendees`; `createEvent`/`updateWholeEvent` diff
  a guest list, `respondToEvent` records an answer, `calendar.listInvites` and
  `/calendar/invites` list the invitations you hold, and every one of the five
  `calendar_*` notification types now has a real writer.
  **Six decisions carry the phase.**
  (1) **The identity is the email; `user_id` is a nullable resolution of it.** That is
  what makes Phase 4's external attendee purely additive (they are already a row) and a
  deleted user degrade into one rather than vanish from a guest list. `CHECK (email =
  lower(email))`, because Phase 4's ICS import, a seed helper and a support script all
  write that column without passing through Zod.
  (2) **Overrides inherit attendees; they never copy.** Every attendee read and write
  resolves `recurrence_parent_id ?? id` first. The copy model was specced and reversed:
  the rows would be unreadable in Phase 3, would diverge immediately because RSVP is
  series-level, would raise `23505` on the second edit of an occurrence, and would destroy
  the one thing an attendee row on an override is *for* in Phase 6. `splitSeries` is the
  sole copier, because the master it creates is addressable.
  (3) **A second authority that exposes no role.** `getEventAccess` answers *event*-scoped
  questions on top of `getCalendarRole`. There is no `canWriteEvent` and a test asserts
  the module exports none — *attendance never grants write* has to be structural, not one
  obvious-looking line away from being wrong. It also preserves the masters view's
  filters, because a soft-deleted event granting access would let a `calendar_cancelled`
  notification link straight to one.
  (4) **RSVP is series-level, and that is a security decision.** Per-occurrence RSVP
  would need an attendee — who has no write access to the organizer's calendar — to
  trigger an `INSERT` into `calendar_events` to materialise the override the response
  hangs off. The parent plan called it free; it is a privilege-escalation shape.
  (5) **An invitation is claimed by *verified* email, and the first claim stamps
  `user_id`.** Without the claim path, inviting someone who registers an hour later leaves
  their list empty forever; without the stamp, an invitation they had already **accepted**
  silently vanishes the day they change address. The `emailVerified` conjunct is what
  stops an unverified signup as `victim@example.com` reading that person's invitations.
  ⚠️ Compare as `attendees.email = lower($param)` — `lower()` on the *column* loses
  `calendar_event_attendees_email_idx`.
  (6) ⚠️ **The `user_id` index is partial, and that was measured**: 248 → 216 kB at
  half-external, 120 → 56 kB at 90 % external over 10,000 rows. Same lesson as `0021` — a
  plain btree stores its NULL keys.
  **Stated rather than hidden:** through Phase 3 an invitation is a list at
  `/calendar/invites` and **does not appear on the invitee's month grid**; a "this and
  following" split copies the guest list verbatim, so everyone stays `accepted` for a
  meeting whose time moved (Phase 4 owns re-asking); and `updateOccurrence` and
  `splitSeries` both discard a submitted guest list silently.
- **Typed notification payloads, links and one publish path** (calendar Phase 3, part A —
  no calendar coupling, and it closes a bug that exists in the repo today).
  `NOTIFICATION_TYPES` gains five calendar members, extended in `@repo/db` **and**
  `@repo/validators` in one commit because they are inseparable: the validators side was
  an inline `z.enum([…])`, and `server/realtime/notification-bus.ts` `safeParse`s every
  payload and **fails closed with no log, no error and no Sentry event** — so extending
  one side alone makes every notification of the new type silently stop arriving.
  `src/lib/union-parity.test.ts` (moved out of `lib/calendar/`, where the path was lying
  about a non-calendar union) is what makes those two edits one commit.
  Migration `0022` adds `title` and `link`.
  **Three decisions worth carrying forward.**
  (1) **The `body` contract is two slots, not one.** `title IS NULL` ⇒ `body` is already
  a complete sentence; otherwise `type` selects the sentence and (`body`, `title`) fill
  it. A one-slot design cannot express *"Alice declined Standup"* — two variables and a
  status — which is why the response type splits three ways. Both feed render paths
  switch on `type`: the `<li>` **and** the SSE toast.
  (2) ⚠️ **`link NOT LIKE '/\%'` is the wrong spelling and accepts `/\evil.com`** —
  backslash is `LIKE`'s **default ESCAPE character** in Postgres, so that pattern means
  "a slash followed by a literal `%`". The shipped CHECK uses `left()` comparisons, which
  have no escape layer. Verified on PG 18: `//evil.com`, `/\evil.com`, `http://evil.com`
  and `javascript:…` rejected; `/calendar/event/<id>` and `NULL` accepted. Rendering goes
  through the locale-aware `Link`, never a raw `<a href>`.
  (3) **`.nullable().default(null)`, not a bare `.nullable()`** — a bare `.nullable()`
  requires the key to be *present*, so mid-rolling-deploy an old instance would publish a
  payload without the new fields and every new instance's bus would drop it silently:
  the exact bug class above, reintroduced by its own fix.
  `createNotifications`/`publishNotifications` split persist from publish because
  `notify()` runs `pg_notify` on the **pooled** connection, not the caller's transaction
  connection, so publishing inside a transaction can beat the row's visibility;
  `sendTestNotification` is refactored onto them so there is one path, not two that
  drift. `notification-bus.ts` joins `coverage.include` — it has had a test file since
  A22 and had never been counted.
- **Calendar, Phase 2 — recurrence, per-occurrence overrides and edit scopes.** An
  `RRULE` engine in `@repo/calendar` (`rrule.ts` · `expand.ts` · `occurrences.ts`, at
  100/100/100/100), migration `0021` (`calendar_recurrence_dates`, a composite self-FK,
  and a partial override index), scoped `updateEvent`/`deleteEvent`, `setRecurrenceDate`,
  a three-query `calendar.range` that expands series in-process, and the recurrence
  builder with a locale-safe prose summary.
  **Four decisions carry the phase.**
  (1) **The grammar has one owner**, `packages/calendar/src/rrule.ts`; `@repo/validators`
  constrains only the string's shape. Ours is deliberately stricter than the obvious
  reference implementation — measured, `rrule@2.8.1` accepts a rule with no `FREQ`,
  `COUNT` and `UNTIL` together, `INTERVAL=0`, and `COUNT=-1` (416,011 occurrences).
  (2) **The differential oracle is a checked-in fixture, not a live dependency.**
  `rrule@2.8.1` ran once, into a 528-rule corpus; the permanent test diffs against that
  file, so CI never executes a 2.7-year-stale package and generated projects never inherit
  it. Two anti-tamper gates, because a red differential has one one-line "fix" that turns
  the oracle into a mirror of the engine: the fixture was committed **before** `expand.ts`
  existed, and its SHA-256 is pinned in the test.
  (3) **`0021`'s override index is PARTIAL, and that is the whole point.** Measured on
  PG 18 at 22,400 rows / 2,000 overrides: `(recurrence_parent_id, recurrence_id) WHERE
  recurrence_parent_id IS NOT NULL` is **96 kB against the 176 kB it replaces**, and turns
  1,971 index buffers into 15 — 131×. ⚠️ A plain btree **stores NULL keys**, so "only
  override rows are non-NULL, therefore the index is the same size" is false: the
  non-partial three-column variant is 55% *larger*. Measure index shapes, never infer them.
  (4) **`id` is always the series master's.** The grid renders virtual occurrences and
  materialised overrides as identical chips and both ids are `uuid`, so an override's own
  id never leaves the server, and a write whose target is an override is refused *whether
  or not it carries a scope* — the unscoped half is what stops an override being
  soft-deleted while its master is live.
  Also: a composite self-FK makes "an override lives in its master's calendar" true by
  construction, with `ON UPDATE CASCADE` moving overrides when a master changes calendar
  (⚠️ the cascade bypasses drizzle's `$onUpdate`, so those rows keep a stale
  `updated_at` — Phase 6's feed `ETag` must not rely on it alone); a
  `thisAndFollowing` split **rewrites the `uid` on every re-parented override**, without
  which the split manufactures the exact corruption the schema leaves writer-enforced; and
  the range response distinguishes `truncated` from `seriesTruncated`, over one merged
  time-ordered stream, so truncation is tail-shaped rather than category-shaped.
  Docs: [recurrence](docs/context/calendar/recurrence.md) ·
  [model](docs/context/calendar/model.md) · [api](docs/context/calendar/api.md).
- **Calendar, Phase 1 — calendars, events and a month grid.** `calendars` +
  `calendar_events` (migration `0020`) with the `calendar_event_masters` view,
  `@repo/validators/calendar` (a new exports-map subpath), `lib/calendar-acl.ts`,
  pure month-grid geometry in `lib/calendar/grid.ts`, six Server Actions, three tRPC
  reads, the `/calendar` and `/calendar/event/[id]` routes, eight components and a
  `Calendar` i18n namespace in both locales.
  **The load-bearing decision — and an amendment to the signed-off program plan —** is
  how the derived instants are guarded. The approved design was a `STABLE` trigger with
  a ±3600 s tolerance, justified by "`AT TIME ZONE <non-constant>` is `STABLE`, so it is
  illegal in a CHECK anyway". Probed against PG 18, **both halves were false**: the
  two-argument `timezone(text, timestamp)` is `IMMUTABLE` (only the one-arg session form
  is `STABLE`), and the tolerance **rejected correct data** — Postgres resolves a
  fall-back overlap to the *later* instant where we take the earlier, so they disagree by
  the transition size, which is 7200 s in `Antarctica/Troll`. Shipped instead:
  `start_offset_minutes` / `end_offset_minutes` (`smallint NOT NULL`, **no default**) and
  a tzdata-free arithmetic CHECK. It consults no timezone database, so a tzdata update
  can never make a row un-editable; it is the only variant that rejects a wrong
  overlap-branch row; and `NOT NULL` with no default makes a bypass writer fail loudly.
  ⚠️ A `CHECK` being created is **not** evidence of immutability — Postgres does not
  enforce volatility there at all; generated columns do. The old claim is corrected in
  `packages/calendar/src/timezone.ts` and `docs/context/calendar/model.md`.
  Also: the read surface is deliberately **split** (masters view for list/detail, raw
  table for the window query — measured `Seq Scan` vs `Bitmap Index Scan`, and the view
  hides override rows a range scan must include), pinned by an `EXPLAIN` assertion; the
  integration suite writes its negative cases through **raw SQL that bypasses the
  application writer**, because recomputing with the same function it wrote with would
  assert that a function equals itself. Docs:
  [`docs/context/calendar/`](docs/context/calendar/model.md) —
  [api](docs/context/calendar/api.md) · [acl](docs/context/calendar/acl.md) ·
  [remove-it](docs/context/calendar/remove-it.md).
- **`contrarian` review subagent + a sign-off nudge** — `.claude/agents/contrarian.md`
  is a devil's-advocate agent (no file-editing and no shell — its `tools:` are
  `Read, Glob, Grep, WebSearch, WebFetch`) that steel-mans a plan, audits its unstated
  assumptions by likelihood × impact, runs a pre-mortem, and returns severity-tagged
  findings that each carry a **required** recommendation (objection-without-alternative
  is an explicit anti-pattern in its prompt). `CLAUDE.md` carries the trigger policy —
  standing-authorized, always for schema, auth/RBAC, package boundaries, non-patch
  dependency adds, and any edit to the **template surface**, which is spelled out as a
  path set rather than a prose category so it stays checkable.
  `.claude/hooks/contrarian-nudge.mjs` fires a reminder on `ExitPlanMode`; it points at
  the policy rather than restating it, because a second copy of a trigger list drifts.
  This also makes `.claude/agents/` and top-level `.claude/hooks/*.mjs` a new
  **repo-owned** layer inside a directory that was previously all installer output —
  ownership rules are now in
  [`context/CONVENTIONS.md` → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude),
  and `pnpm docs:sanity` asserts the wiring stays intact.
- **Hosted Storybook component gallery** — `@repo/ui`'s Storybook publishes to
  GitHub Pages on every change touching `packages/ui/**` (new
  `.github/workflows/pages.yml`), linked from the README and
  [`context/DEPLOYMENT.md`](docs/context/DEPLOYMENT.md#storybook-on-github-pages-component-gallery).
- **README screenshot tour** — four keyless, real-build screenshots (landing
  light/dark, signed-in dashboard, `/account`) in a new README `## Screenshots`
  section and a "See it" strip in [`FEATURES.md`](docs/FEATURES.md).
- **`/_next/image` optimization e2e coverage** —
  `apps/web/e2e/image-optimization.spec.ts` + a committed keyless fixture assert
  the optimizer really transforms (PNG→webp, an IHDR-verified resize, and 400
  for a non-allowlisted remote `url=`), so the overridden `sharp` engine (see
  Security below) is exercised on every e2e run instead of merely installed —
  the 2026-07-22 audit's last open row.
- **Daily security-audit watch lane + auto-filed triage issue** — new
  `.github/workflows/security-audit.yml` runs `pnpm audit` daily (moderate+
  threshold) and turns a red result into a rolling `security-triage` issue
  (labeled, assigned, auto-closed by the next green run) via
  `.github/scripts/security-triage-issue.sh`; ci.yml's audit lane syncs the same
  issue on non-PR runs on `main` (push / heartbeat / dispatch). Advisories publish against the world, not the
  tree — a fully green repo can wake up red (the 2026-07-22 Next.js batch), and
  a red scheduled run previously had no consumer. Triage procedure:
  [`docs/MAINTENANCE.md` → Security response runbook](docs/MAINTENANCE.md#security-response-runbook).

### Fixed

- **2026-08-14: `main` un-reds — kit-output Biome formatting.** The 2026-08-12
  un-gated ai-dev-kit 0.8.0 → 0.13.0 reinstall (see Changed) left
  `.claude/settings.json`'s hook `args` arrays multi-line where Biome's formatter
  collapses them to one line, failing `pnpm lint` on every push and the 2026-08-13
  Thursday CI heartbeat. `pnpm exec biome format --write .claude/settings.json` —
  content unchanged, hook wiring untouched, whitespace only. The kit-side half
  (`install.mjs` should emit gate-clean output) stays open as a BACKLOG B1 row.
- **2026-08-08: `subscription.test.ts`'s `FUTURE` fixture was a date time bomb** — it
  pinned `2026-08-08T12:00Z`, and the two wrapper tests (`hasActiveSubscription` /
  `hasOrgSubscription`) compare it against the **real** clock (the wrappers apply the
  default `new Date()`), so both went red at noon UTC that day with no commit: the
  morning's `main` run was green, the evening's PR run failed. Now the max ECMAScript
  date (`new Date(8.64e15)`), the same trick the suite's own "defaults `now`" case
  already used, with a warning comment at the fixture site. Class-swept the repo's
  test fixtures: every other pinned future date is stored-and-read-back data or
  compared to an explicit pinned `now`, never the real clock.

- **2026-08-06: `FREQ=YEARLY;BYMONTHDAY` without `BYMONTH` expands every month** (audit
  F8 — the silent-wrong-render class the package vows to refuse rather than emit).
  `yearlyDays` fell back to DTSTART's month, one occurrence a year, where RFC 5545
  §3.3.10 makes `BYMONTHDAY` an *expansion* at YEARLY frequency — the 13th of **every**
  month (seven a year for `BYMONTHDAY=31`, which short months skip). The emailed `.ics`
  carries the RRULE verbatim, so an external guest's Gmail already rendered the RFC
  expansion while the organizer's grid showed one-per-year. Invisible to the 528-case
  differential because the corpus generator only ever paired YEARLY `BYMONTHDAY` with
  `BYMONTH`, and the one unit test asserted a property both behaviors satisfy; the
  corpus now samples the unpaired family — **+40 cases → 568** (BYSETPOS, UNTIL,
  negative days included), zero oracle errors, a pure-append fixture diff with the
  SHA-256 repinned in the same commit, and the unit tests assert exact lists and
  counts. **Data compatibility, stated precisely** (this matters for projects derived
  from the template; this repo's census found zero affected rows — the builder UI
  always pairs): identity is preserved for `UNTIL`-bounded and unbounded rules, where
  the correction only *adds* occurrences. A **`COUNT`** rule of this family now
  consumes its count ~12× faster, so the corrected series ends much earlier — a stored
  `series_end_at` becomes a permanent, safe over-estimate (the range query only
  excludes on it), and an override past the corrected end keeps painting as a concrete
  row. A **`BYSETPOS`** rule re-selects over twelve candidates instead of one —
  `BYMONTHDAY=13;BYSETPOS=2` now means "February 13th yearly" where the broken engine
  emitted DTSTART's month or nothing. Census before relying on prior expansions:
  `rrule LIKE 'FREQ=YEARLY%' AND rrule LIKE '%BYMONTHDAY=%' AND rrule NOT LIKE '%BYMONTH=%'`.
- **2026-08-06: the `overlaps` seek reaches back a full occurrence span** (audit F7 —
  the residual class of the 08-02 grid fix). That fix made all three selection layers
  overlap-aware (concrete rows, master selection, the accept predicate's exact
  end-instant test) but left *generation* seeking as if selection were still by start:
  `seekPeriodIndex` kept one period of slack, so an occurrence starting two or more
  recurrence periods before the window was never generated and the exact predicate never
  saw it. A daily series with a five-day span lost four of its five straddlers at every
  window edge — the precise symptom the 08-02 fix claimed eliminated, in the span > ~2
  periods class. `expandRRule` gains an opt-in `seekBackDays`; `expandSeries` passes the
  master's whole-day span (the same `dayDelta` the end formula shifts by) plus two civil
  days of zone slack, `overlaps` mode only — per-master, not the 367-day maximum-span
  constant, so a one-hour series pays two extra periods rather than a year's walk. The
  default `starts-within` mode is byte-identical (the reminder sweeper's limit-eviction
  contract depends on that), and `suppressionBounds`' existing 368-day reach already
  covers everything the widened seek can emit (CHECK-bounded 366-day span + ~16 h of
  offsets — verified, no apps/web change). The new tests assert **complete** occurrence
  sets rather than "returned rows satisfy the predicate" — the assertion shape whose
  absence let F4, F7 and F8 all ship behind green suites — and all four fail against the
  pre-fix engine.
- **2026-08-05: external guests now receive cancellation emails** (audit F4, HIGH,
  silent). `softDeleteEvent`'s recipient query excluded the deleting actor with a bare
  `ne(userId, actor.id)` — and `user_id` is NULL for an external attendee, so
  `NULL <> $actor` evaluated NULL and the row was dropped. The guests it dropped are
  exactly the ones with no other channel: an external holds a live `.ics` and no in-app
  feed, so a deleted event simply stayed on their calendar. Fixed with the NULL-safe
  `or(isNull(user_id), ne(user_id, $actor))`. Two test corrections carry the lesson:
  the mocked unit test had asserted the very result the real SQL contradicted (a mock
  cannot see a WHERE), so its fixture now models the fixed query's output and says so —
  and the predicate itself is proven both ways against real Postgres in
  `@repo/db`'s calendar-attendees integration suite, planted-defect style (the bare
  `ne()` spelling is asserted to drop the external).
- **2026-08-05: `deleteEventSchema` refuses the scope/recurrenceId half-pair** (audit
  F5). `updateEventSchema` ran `scopePairIssues` from day one; delete shipped without
  it, so `{scope: "this", recurrenceId: null}` validated and fell through to the
  whole-series branch — deleting every occurrence and fanning out cancellations the
  caller never meant to send. Writer-authorized, so no privilege escalation — a
  fail-destructive footgun at the boundary. The shared rule now runs in both schemas,
  and the new validator tests are the **first** scope-pair coverage anywhere (update's
  half was untested too, which is how delete shipped without it). Both UI callers
  already sent compliant pairs; api.md's both-schemas claim is now true.
- **Claude Code hooks no longer die from a subdirectory** (ai-dev-kit 0.7.2) — all five
  hook commands in `.claude/settings.json` wired their handler on a repo-relative path
  (`node .claude/hooks/…`). Hooks are spawned with the **session cwd, not the project
  root**, so after any `cd` into `apps/web` or `packages/*` the path resolved against that
  subdirectory and the hook died with `MODULE_NOT_FOUND`. Entirely silent: only exit 2
  blocks a hook, these advise, and `docs:sanity`'s existing `existsSync` check passed
  either way — 14 lost runs here and 274 in a consumer repo over a 50-session window, with
  every gate green. Commands are now anchored as
  `node "${CLAUDE_PROJECT_DIR}/.claude/hooks/…"`; **braced and double-quoted are both
  load-bearing** (a bare `$CLAUDE_PROJECT_DIR` is `$null` under the PowerShell hook shell,
  an unquoted path word-splits under bash on a project path containing a space). Exec form
  (`args`) was evaluated and rejected — it moves the path out of `command`, where the
  installer's ownership marker looks, so the next install would append duplicates.
  `pnpm docs:sanity` now **fails** on an un-anchored command, closing the gap that let this
  survive: the wiring was asserted to *exist*, never to *resolve*. Generated projects
  inherit `.claude/` verbatim, so every project made from this template carried the bug.
  Rationale and the residual limit (`CLAUDE_PROJECT_DIR` is the launch cwd, not the git
  root): [CONVENTIONS.md → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude).
- **Renovate schedule widened so scheduled updates can actually land** — the
  config shipped `"schedule": ["before 6am on monday"]` with no `timezone` key:
  a 6-hour UTC window per week that the hosted app's run cadence may never
  intersect (this repo's scheduled lane had produced zero update PRs as a
  result). Now a full-day `["on monday"]` window with an explicit `timezone`
  and explicit PR limits (`prHourlyLimit: 0`, `prConcurrentLimit: 10`). **If
  you copied `.github/renovate.json` before this fix, apply the same change.**
- **2026-07-28: three false statements about the agent tooling, and a check that could
  not fail.** Found by running `contrarian` against its own introducing plan — the
  acceptance test PR #11 deferred.
  - The `contrarian` agent was documented as **read-only** while its `tools:` granted
    `Bash`. Shell access is not read-only, and a non-interactive agent run executes
    commands with no permission prompt (verified with a non-allowlisted `whoami`).
    `Bash` is now removed from its `tools:`, so the description and the grant agree.
  - `pnpm docs:sanity`'s hook-wiring assertion was wrapped in
    `if (existsSync(settings.json))` — deleting that file **skipped the check silently**
    rather than failing it. Now an orphaned repo-owned handler fails regardless, with a
    message naming both valid exits (restore the wiring, *or* delete the handler) — a
    generated project that declines this template's `.claude/` config still passes.
  - "The subagent registry is snapshotted at session start, so it doesn't resolve until
    Claude Code reloads" was **wrong**, and appeared in three places. Registration is
    surface-dependent; a session started days later still could not dispatch the agent,
    and `claude --agent <slug>` works when the registry does not. Corrected with the
    fallback recipe in
    [`context/CONVENTIONS.md` → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude).
  - `docs:sanity` additionally asserts that every agent in `.claude/agents/` is
    referenced by `CLAUDE.md` and vice versa — **existence only**. Whether a well-formed
    agent actually registers is not observable from CI, so a frontmatter-shape validator
    would certify the wrong property; that limitation is documented rather than papered
    over.

### Changed

- **2026-08-22: `next` 16.2.12 → 16.3.1** (+ `@next/eslint-plugin-next` lockstep,
  `tooling/eslint`). Registry-verified at take time (16.3.1 published
  2026-08-13T22:45:02Z, gate cleared 2026-08-20T22:45:02Z); a `16.3.2` had shipped
  by build time (2026-08-21T09:54:02Z, still inside the 7-day gate) but its release
  notes are routine backports (Turbopack tracing/chunk-loading, a catch-all-route
  fix, app-entry export-validation scoping, Turborepo OIDC caching auth) — no
  security fix, so it did not warrant jumping the gate. **Removed the
  `pnpm-workspace.yaml` `sharp: 0.35.3` override** — next 16.3.1's own
  `optionalDependencies` pin moved to `sharp: ^0.35.3` (was `^0.34.5` exact), so
  the override's stated removal condition ("next's own sharp pin reaches
  >=0.35.0") is met and the caret now self-heals; `pnpm why sharp` confirms
  `0.35.3` resolves from next's own pin. ⚠️ **This removal is only safe on
  next >=16.3.1** — a derived project or a future downgrade below 16.3.1 without
  restoring the override re-exposes `GHSA-f88m-g3jw-g9cj` (libvips HIGH, via
  next's pre-16.3.1 exact `^0.34.5` pin). The `postcss` override was
  deliberately **kept** (a contrarian-caught correction to the original plan,
  which would have dropped it too): 16.3.1 pins `postcss` **exactly** at
  `8.5.23` (no caret self-heal), and `8.5.26` already ships a same-family
  sourceMappingURL/symlink hardening fix that makes a GHSA on `<=8.5.23` a
  plausible next step — the override's `<=8.5.22` key is already inert against
  the installed `8.5.23`, so removing it now would only discard the lever
  needed to react fast if that advisory lands. Added a durable e2e guard
  (`apps/web/e2e/image-optimization.spec.ts`) asserting both the
  `/_next/image` optimizer and the `/opengraph-image` `ImageResponse` route
  return non-empty `image/png`/`image/webp` bytes on the prod-build
  `webServer` — a green build alone proves compilation, not that sharp/Satori
  still transform. Gate (`lint`·`type-check`·`build`) clean, `pnpm audit`
  zero/zero-ignored, `pnpm test:coverage` and `pnpm knip` clean, full CI e2e
  lane green before merge.
- **2026-08-14: `better-auth` 1.6.25 → 1.6.26** (+ `@better-auth/passkey` 1.6.25 →
  1.6.26, exact-pinned in lockstep). Routine bug-fix release, no advisory: session
  cleanup on user deletion now also clears secondary-storage sessions, email-OTP
  verification no longer reveals whether an email is registered before the OTP is
  verified, JWT key minting moved inside the DB transaction to prevent deadlocks.
  Registry-verified over `latest` (1.6.28) and 1.6.27, both still inside the 7-day
  age gate at take time and carrying nothing material over 1.6.26 per their release
  notes. **Schema-diffed the installed 1.6.26 artifacts against 1.6.25 across the
  full surface** (per `packages/auth/AGENTS.md`'s standing rule, itself corrected
  this session after a contrarian pass found the old procedure only checked
  `better-auth`'s own plugin schemas and missed `@better-auth/core` — where the
  `user`/`session`/`account`/`verification` core tables actually live — and
  `@better-auth/passkey`'s inline table): all byte-identical, **no migration
  needed**. Live-verified on a fresh prod build (`:3100`): sign-up, sign-in, full
  2FA enrollment + challenge round-trip, an organization invite-and-accept
  round-trip, admin set-role + ban, and — the release's own behavioral change —
  deleting a test account with 4 active sessions confirmed all 4 rows gone from
  `session` in the same request.
- **2026-08-12: ai-dev-kit updated 0.8.0 → 0.13.0** (checkpoint skill 0.2.0 →
  0.3.0), reinstalled un-gated directly to `main`. Shipped without a plan → sign-off
  pass or a CHANGELOG entry at the time — documented here retroactively, four
  commits (and one red `main`) later. The kit's `install.mjs` re-serialized
  `.claude/settings.json`'s hook `args` arrays multi-line, which Biome collapses;
  see the **2026-08-14 Fixed entry** for the un-red.
- **2026-08-08: `/project-adopt` learned the selective-merge bar (ai-dev-kit 0.8.0,
  skill 0.3.0)** — adoption now answers "merge the template's improvements into my
  existing app" as first-class intent. The disposition map runs a **two-tiered
  meaningful-improvement bar**: the product surface (UI, flows, styles, copy,
  business logic) defaults to **keep-theirs** — transplanted intact, bounded by the
  adopting repo's gates *and* stated hard rules; a wash keeps theirs — while the
  foundation (auth, DB, tooling, CI, security, observability) keeps the template
  presumption, since the scaffold already wires it. Contested subsystems record a
  real tech-choice comparison (no wash by ignorance), the incoming project's own
  agentic layer (`.claude/`, instruction files, agent memory) is surveyed and
  dispositioned instead of silently dropped, the parity contract is enumerated into
  a one-to-one **pending-spec map** right behind the walking skeleton (each port row
  flips its specs live; completion = zero pending specs + suites green at the
  enforced thresholds), and the judgment steps run with extended thinking on the
  most capable available model. Kit-side record: the
  [ai-dev-kit CHANGELOG](https://github.com/jrittelmeyer/ai-dev-kit/blob/main/CHANGELOG.md);
  reinstalled here via `install.mjs` (`--check` clean).

- **2026-07-28: removed the dated `minimumReleaseAgeExclude` for `next` + `@next/*`**
  added 2026-07-23 for the advisory batch. 16.2.11 cleared the 7-day gate on schedule, so
  the bypass is gone and the supply-chain gate is unconditional again. Verified
  falsifiably: requesting the still-gated `next@16.2.12` is refused with the exclude
  removed and accepted with it restored. Note this is a **no-op at install** — `apps/web`
  declares `^16.2.11`, which the lockfile already satisfies — so the gate re-arms at the
  next *resolution* (a Renovate bump or `pnpm add`), not at `pnpm install`.

### Security

- **2026-08-14: `nanoid` GHSA-2v37-7h3g-55p8 park exited — 3.3.18 taken** — 3.3.18
  (published 2026-08-07T16:41Z) cleared the 7-day `minimumReleaseAge` gate at
  ~16:41 UTC; registry re-verified at take time (~17:08 UTC). The ranged override
  promoted `"nanoid@<3.3.17": 3.3.17` → `"nanoid@<3.3.18": 3.3.18` and
  `auditConfig.ignoreGhsas` reverted to `[]` in the same change. `pnpm audit` —
  zero vulnerabilities, zero ignored. Exposure analysis unchanged (postcss's
  sole edge calls plain `nanoid(6)`, the vulnerable `customAlphabet`/
  `customRandom` functions never invoked).
- **2026-08-14: `nanoid` GHSA-2v37-7h3g-55p8 re-parked** — the advisory widened
  2026-08-13T15:43Z from `<3.3.17` to `<3.3.18` (first-patched 3.3.18), catching
  the 2026-08-12 exit's `"nanoid@<3.3.17": 3.3.17` override again. 3.3.18
  (published 2026-08-07T16:41Z) hadn't cleared the 7-day `minimumReleaseAge` gate
  at the time this was found (fifteenth `/project-audit` pass, four hours after
  the widen), so route (1) — the repo's documented default — parks it again in
  `auditConfig.ignoreGhsas` rather than promoting the key early; exposure analysis
  unchanged (postcss's sole edge calls plain `nanoid(6)`, the vulnerable
  `customAlphabet`/`customRandom` functions never invoked). Promotes to
  `"nanoid@<3.3.18": 3.3.18` and the park is deleted once 3.3.18 ages in
  (~2026-08-14T16:41Z) — a small separate follow-up, tracked in
  `docs/MAINTENANCE.md` → Dated dependency takes.
- **2026-08-14: bare `brace-expansion: 5.0.9` key converted to its ranged form**
  (audit F5, fifteenth pass) — the same unsatisfiable-removal defect the
  2026-08-12 PR fixed for `fast-uri` and `dompurify`: a bare override key pins
  every future resolution to its own value, so "remove once a routine bump
  carries the lockfile past 5.0.9" could never actually fire. Now
  `"brace-expansion@<5.0.9": 5.0.9` — rewrites only vulnerable copies and goes
  inert once the tree resolves past 5.0.9 naturally. The conversion itself moved
  nothing in the lockfile.
- **2026-08-12: the 2026-08-07 security parks exited — dompurify 3.4.13 + nanoid
  3.3.17, two days late.** The route-(1) parks for GHSA-55q2-fjhq-7xh7 (moderate) and
  GHSA-2v37-7h3g-55p8 (high) were due out 2026-08-10 when their fixes aged in; taken
  2026-08-12 with no exposure in the gap (both edges are audit-only and the daily
  security lane ran green through it). Per the signed spec: registry re-verified at
  take time — 3.4.13 is `latest`, and 3.3.17 was taken over the fresher 3.3.18 (npm's
  `legacy` tag, an unrelated React-Native fix; the aged advisory floor wins) — the
  bare `dompurify:` key became the ranged `"dompurify@<3.4.13": 3.4.13`,
  `"nanoid@<3.3.17": 3.3.17` was added (in-range for postcss's `^3.3.16`, a
  fix-forward), and the signed rider converted `fast-uri: 3.1.5` to its ranged form
  (a bare key pins every future resolution, so its own removal condition could never
  fire; the conversion moved nothing). `auditConfig.ignoreGhsas` is `[]` again —
  `pnpm audit` reports zero vulnerabilities with **zero ignored** — the lockfile
  moved exactly two packages, and Dependabot alerts #25 and #26 auto-close.
- **2026-08-08: the two missing rate limiters wired (B2 completeness).**
  `deleteCalendar` was the one calendar write skipping step 2 of the six-step contract
  — now limited at 10/min per user like its siblings. And the `/rsvp` read is capped at
  **60/min per invitation**, placed on the DB-bearing `loadRsvpView` (a four-table join)
  rather than the `/rsvp/[token]` route handler: a contrarian pass showed the handler
  does **no** database read, while a held or forwarded token can replay the httpOnly
  cookie against the *page* for the cookie's hour-long life. Keyed by attendee id (not
  IP, so guests behind one shared egress don't cross-lock) and returns the same 200 "no
  longer valid" page on denial, so it adds no enumeration oracle. Abuse dampening, not
  the defence — the HMAC is; in-memory per instance without Upstash. Revert sensors on
  both sites.
- **2026-08-07 (same PR, later the same day): `nanoid` GHSA-2v37-7h3g-55p8 parked —
  the second route-(1) park in one PR, and the first HIGH parked since fast-uri.**
  The HIGH (CVSS v4 8.2 — `customAlphabet`/`customRandom` never exit their
  generation loop when size is 0) reached the audit feed hours after the dompurify
  plan below was signed: the advisory published 2026-07-29 against the 5.x line
  (fixed there in 5.1.6 back in 2025) and gained its `<3.3.17` range only after the
  3.x backport landed 2026-08-03 — so no lockfile change surfaced it, the advisory
  data moved. Our sole edge is `postcss>nanoid@3.3.16` — 19 paths, every one build
  tooling — and postcss calls the plain `nanoid(6)` from `nanoid/non-secure` with a
  hardcoded size, so **the vulnerable functions are never invoked in this tree**
  (audit-edge only, the same classification as dompurify, verified in the installed
  artifact). Parked in `auditConfig.ignoreGhsas` until 3.3.17 (published
  2026-08-03T10:39:22Z) ages in **2026-08-10 ~10:39 UTC**; the one 08-10 exit PR
  then promotes both parks — nanoid to the ranged `"nanoid@<3.3.17": 3.3.17`
  (in-range for postcss's `^3.3.16`, a fix-forward). ⚠️ 3.3.18 (published 08-07) is
  an unrelated React-Native fix with no advisory delta — boundary-fresh, so the aged
  advisory floor wins (the postcss 8.5.23 precedent). Route (2) was
  criterion-eligible under the tightening shipped in this same PR (HIGH+) and
  deliberately not used: with the vulnerable functions unreachable and a 3-day
  window there is no urgency, and the exception stays bounded. Parking a HIGH
  follows the fast-uri/batch-#5 precedent — the steady-state deferral, not a gate
  exception.
- **2026-08-07: `dompurify` GHSA-55q2-fjhq-7xh7 parked — route (1), with the exit
  pre-signed.** The moderate advisory (`<=3.4.12` — removing an element from a hook
  during `IN_PLACE` sanitization leaves a detached subtree executable, XSS; published
  15:30 UTC, hours after the daily lane's green) catches the `dompurify: 3.4.12`
  override — the third remediation pin to fall inside a new advisory's range. Its
  only fix, 3.4.13 (published 2026-08-03T14:16:00Z), sits inside the 7-day
  `minimumReleaseAge` gate until **2026-08-10 ~14:16 UTC**, so the GHSA is parked in
  `auditConfig.ignoreGhsas` until then, with a self-contained exit note (a derived
  project generated during the window carries the yaml verbatim, so the note tells
  its reader what to execute if the date has passed). **The contrarian pass corrected
  the exposure model, and the override comment now records it: the lockfile edge is
  audit-ledger only.** posthog-js (the tree's sole importer) bundles no dompurify
  into the `module.js` entry the app imports; the `IN_PLACE` caller is its
  remotely-loaded product-tours chunk, which vendors its own dompurify 3.3.2 — so
  neither parking nor bumping changes an executed byte on any deploy, and the real
  fix channel is a posthog-js release whose chunks vendor >=3.4.13 (new Watch line
  carries the verify recipe). Signed alongside the park: the exit uses a **ranged**
  key (`"dompurify@<3.4.13": 3.4.13` — a bare key pins every future resolution,
  making its own removal condition unsatisfiable), the same exit PR converts
  `fast-uri: 3.1.5` to `"fast-uri@<3.1.5": 3.1.5` (same defect), and the three-route
  rule's route (2) gained a severity/reachability criterion recording why this
  advisory stayed parked while `brace-expansion` (HIGH, with a broken prior fix) did
  not. Issue #49 (the moderate-threshold triage sync) closes on this merge;
  Dependabot #25 tracks the lockfile edge and auto-closes with the 08-10 exit.
- **2026-08-07: `fast-uri` 3.1.5 — batch #5's parked advisory closed on schedule.**
  GHSA-7p8r-x3mc-p8w7 (`<3.1.5`, high — the third host-confusion advisory of the
  family, via a backslash authority introducer) was parked in `auditConfig.ignoreGhsas`
  on 2026-08-04 because its only fix, 3.1.5 (published 2026-07-31T09:16:56Z), sat
  inside the 7-day `minimumReleaseAge` gate. It aged in at 09:16:56 UTC today; the
  take is route (1)'s exit exactly as the batch-#5 plan pre-authorized: the override
  raised 3.1.4 → 3.1.5 and the park deleted, one change. Registry re-verified at take
  time — 3.1.5 still heads the 3.x line (npm `latest` is the 4.x major, outside ajv's
  `^3.0.1`) — and the lockfile moved exactly one package. The allowlist's empty steady
  state is restored: **zero ignored advisories**, every override guarded live again.
  Exposure while parked: ajv via the Sentry/Storybook webpack chains — build tooling
  only, no request-handling path. Dependabot #24 (the park's tracking alert)
  auto-closes with the lockfile move. ⚠️ The take-time audit also caught
  GHSA-55q2-fjhq-7xh7 (moderate, published **the same day at 15:30 UTC** — after the
  06:03 UTC daily lane's green): `dompurify <=3.4.12`, the third remediation pin to go
  vulnerable itself. Out of this change's scope — its fix 3.4.13 ages in 2026-08-10
  ~14:16 UTC; response plan → sign-off (MAINTENANCE → Watch → dated takes).
- **2026-08-06: the `brace-expansion@5.0.9` age-gate exclusion was deleted on schedule.**
  5.0.9 (published 2026-07-30T10:00:32Z) cleared the 7-day `minimumReleaseAge` gate at
  10:00:32 UTC, so the dated, version-scoped `minimumReleaseAgeExclude` added 2026-08-03
  (the gate's first and only bypass — see that entry below) had gone inert. The gate is
  unconditional again with **zero exclusions**; a frozen install against the unchanged
  lockfile passes all supply-chain policies (1,111 entries). Hygiene, not remediation —
  the entry was version-scoped precisely so leaving it could never exempt a future
  release — but deleting it keeps the exclusion list's empty state the observable norm.
- **2026-08-05: the verified-email conjunct now binds at both attendee *writer* seams
  (audit 2026-08-04, F6).** The rule that an invitation is claimed by a **verified**
  address was enforced only on the read/claim path; two writers re-stated identity by
  email without it. (a) `resolveAttendeeUserIds` resolved any account at invite time and
  stamped its id onto the attendee row — and a `user_id` stamp is the durable arm every
  later read answers by, with no verified conjunct to re-check, so signing up as
  `victim@example.com` and never verifying captured that person's future invitations
  permanently. (b) `respondToEvent`'s UPDATE matched every row bearing the caller's
  current address and was **not bounded to one row** (the action reads the first of
  `RETURNING` and never learns a second was written), so an attendee who moved their
  account onto a co-invitee's address overwrote that person's status, comment,
  `responded_at` **and** `user_id` with their own. Both were reachable on
  **email-unconfigured deploys**, where `requireEmailVerification: isEmailConfigured()`
  lets unverified accounts sign in — a supported configuration, so this is a real
  reachable defect there and a defence-in-depth fix everywhere else. Now: an unverified
  account is a **miss** at invite time (the row stays external — a real invitation,
  reached by email, claimable the moment they verify), and the UPDATE's email arm is an
  `EXISTS` over the caller's verified `user` row. The only unverified-to-durable
  promotion left is a verified first response, under proof. Consequences worth knowing:
  in-app invitations are now a verified-accounts feature, so on an email-unconfigured
  deploy guests are reached as external ones via the organizer's per-guest copyable RSVP
  link; and **rows stamped before this fix are not evicted** — a verified claimant who
  later changed address is indistinguishable from a squatter in the wrong direction, the
  same reason the durable arm carries no conjunct — so a deployment that ran
  email-unconfigured with untrusted signups should audit
  `calendar_event_attendees.user_id` against currently-unverified accounts. Proven by
  planted-defect pairs against real Postgres (the vulnerable spelling demonstrably
  captures the co-invitee's row) plus an e2e assertion on the stamp itself, which is the
  only automated check that watches the *shipped* writer — restated integration queries
  prove a spelling, and the unit suite's mocks discard predicates entirely.
- **2026-08-04: advisory batch #5 (closed
  [#41](https://github.com/jrittelmeyer/next-web-boilerplate/issues/41)) — nine advisories
  in one morning, two of them against our own previous fixes.** Nine advisories (4 high,
  5 moderate) across five packages landed 2026-08-03/04, every path build/dev/test tooling
  (vitest→jsdom, react-email's preview server, the Sentry/Storybook webpack chains, the
  next/vite postcss copies — no request-handling code). The notable shape: **both
  `fast-uri: 3.1.4` and postcss `8.5.20` — values recorded here as remediations — fell
  inside the new advisories' ranges.** An override is a standing liability, not a
  fix-and-forget; `pnpm audit` re-judges pinned values live, which is exactly how both
  surfaced. Moves: new ranged overrides **`"undici@<7.29.0": 7.29.0`** (five advisories at
  once — GHSA-4cwx-7wf7-3272, high, cross-user info disclosure via degenerate private
  cache directives, plus four moderates) and **`"socket.io-parser@<4.2.7": 4.2.7`**
  (GHSA-2m8v-j782-fhvr, zero-attachment memory exhaustion); the postcss key retargeted a
  **second** time (`"postcss@<=8.5.22": 8.5.23`, GHSA-fxqj-rqcc-2cmp — an incomplete-fix
  follow-up); and GHSA-7p8r-x3mc-p8w7 (fast-uri `<3.1.5`, high) **parked** in
  `auditConfig.ignoreGhsas` — route (1), the steady-state deferral, not a second gate
  exception — until 3.1.5 ages in **2026-08-07 ~09:17 UTC**, when the override moves to
  3.1.5 and the park is deleted. The new keys are **ranged, deliberately**: a bare key
  pins every future resolution (its own "remove when a bump carries past it" condition
  could never fire), and undici's `latest` is now the 8.x line, so a bare key would force
  a future undici@8 copy silently cross-major *down* — the ranged key self-neutralizes
  once the tree passes it and leaves new copies for `pnpm audit` to judge loudly.
  `brace-expansion` 5.0.9 (the ninth advisory) merged separately as PR #38. Dependabot
  alerted on **only the undici five**; `pnpm audit` caught all nine — the
  authoritative-gate ranking holds.
- **2026-08-03: `brace-expansion` 5.0.8 → 5.0.9 — the previous fix was bypassable, and
  this one skipped the age gate by owner decision.** GHSA-rgw5-rvv9-x895 (high) affects
  `<5.0.9`: nested arrays **bypass the CVE-2026-14257 mitigation** that 5.0.8 was taken
  for a week earlier, so the entry below was closing an advisory that had already been
  reopened in substance. Caught by CI's `pnpm audit` lane (not Dependabot) on a branch
  that changed no dependency — advisories publish against the world, not the tree.
  ⚠️ **5.0.9 (published 2026-07-30) was 4 days old when taken**, inside the 7-day gate,
  so it required a scoped `minimumReleaseAgeExclude` — **the first time this repo has
  bypassed that gate rather than parking the advisory in `auditConfig.ignoreGhsas` and
  waiting**, which is what its own note prescribes. Owner decision, taken because parking
  meant ~3 days carrying a high whose fix already existed; exposure is build tooling only
  (eslint, Sentry/Storybook webpack plugins, react-email), with no request-handling path.
  **The exclusion expires 2026-08-06**, when 5.0.9 clears the gate on its own, and must be
  deleted then — left behind, it silently widens the gate's blind spot to every future
  `brace-expansion` release. `auditConfig.ignoreGhsas` stays empty.
- **2026-07-30: `brace-expansion` 5.0.7 → 5.0.8 — the deferred advisory closed on
  schedule** — GHSA-mh99-v99m-4gvg / CVE-2026-14257 (high; `expand_()` caps the result
  *count* but not each result's *length*, so ~7.5 KB of input reaches an uncatchable
  OOM) affects `<=5.0.7`, so the 5.0.7 override taken on 2026-07-22 was never a fix for
  it. The fix 5.0.8 published 2026-07-23T11:39:25Z, cleared the 7-day age gate on
  2026-07-30, and is in-range for minimatch's own `^5.0.5` — a plain fix-forward.
  **`auditConfig.ignoreGhsas` is empty again**, which is its steady state: the deferral
  existed only because the fix was younger than `minimumReleaseAge`, and it was deleted
  the day the fix aged in rather than bypassed with a `minimumReleaseAgeExclude`.
  `pnpm audit` now guards both brace-expansion advisories live. Note 5.0.9 became
  `latest` on 2026-07-30 (~10 h old at install time) and was **deliberately not taken** —
  inside the gate; the same wait-don't-exclude rule applies to it.
- **2026-07-30: `better-auth` 1.6.23 → 1.6.25 (+ `@better-auth/passkey` in lockstep)** —
  **not advisory-driven**: neither release carries a GHSA, and this is hardening plus bug
  fixes taken while the tree was already being touched. **No schema change** — the
  1.6.23→1.6.25 model definitions were diffed artifact-by-artifact against the installed
  packages and every difference is cosmetic (JSDoc, a widened export list, a build-chunk
  hash), so **no migration accompanies this bump** — in contrast to 1.6.23, which added
  two `two_factor` columns as a *patch*. **Behavioural change worth knowing (1.6.24,
  upstream #10368):** the magic-link and email-OTP *send* endpoints now enforce `Origin`
  on cookieless requests — a request with a **wrong** `Origin` is rejected, while one
  with **no** `Origin` header (server-to-server) still works and same-origin browser
  traffic is unaffected. If you drive those endpoints from a script against a non-default
  origin, send the trusted `Origin` or none at all.
- **2026-07-27: `better-auth` 1.6.20 → 1.6.23 (account takeover)** — GHSA-qq9h-g4jm-xgf3
  (CVSS 8.3, high) let an attacker take over an account that already existed at an email
  address, via the passwordless sign-in path. **This template met every precondition on
  its default configuration**: `better-auth <1.6.22`, the `magicLink` plugin registered,
  email+password with open registration, and no `disableSignUp` — i.e. the moment
  `RESEND_API_KEY` is set. If you generated a project from this template before this
  entry and you configure email, **bump `better-auth` and `@better-auth/passkey` to
  >=1.6.23** (they are pinned in lockstep — 1.6.23 peers `better-auth: ^1.6.23`). The
  fix, shipped in 1.6.22, revokes unproven credentials during magic-link and email-OTP
  sign-in, so an unverified password set before the upgrade stops working after it.
  **Migration 0018 is required with this bump**: 1.6.23 adds 2FA account lockout (on by
  default — 10 consecutive failed verifications lock the factor for 15 minutes) backed by
  two new `two_factor` columns, `failed_verification_count` and `locked_until`. Because
  this repo hand-maintains the Better Auth schema, a missing column makes the Drizzle
  adapter throw on **every failed 2FA verification** — apply the migration when you bump.
- **2026-07-27: transitive advisories — `postcss`, `fast-uri`, `brace-expansion`** —
  `postcss` moves to 8.5.20 for GHSA-r28c-9q8g-f849 (path traversal via the `prev`
  source-map annotation). Note the override **key** moved too (`<8.5.10` → `<8.5.18`):
  the old key only rewrote next's exact pin and never touched the `postcss@8.5.15` the
  tailwind/vite chains resolved, which the new advisory made vulnerable — a retargeted
  value alone would have left the tree exposed. `fast-uri` 3.1.4 graduates from a dated
  `ignoreGhsas` deferral to a real override now that it clears the 7-day age gate.
  `brace-expansion` takes the deferral instead: GHSA-mh99-v99m-4gvg affects `<=5.0.7`
  and the fix (5.0.8) is inside the age gate, on a build-tooling-only path — raise it
  2026-07-30.
- **2026-07-27: neither audit lane can report green on an unaudited tree** — both ran
  `pnpm audit --ignore-registry-errors` with no assertion that an audit actually
  completed, so an advisory-endpoint outage produced a green over an unchecked
  lockfile. It did exactly that on 2026-07-26, papering over the three highs above for
  a day. Both now require the "…vulnerabilities found" trailer a completed report
  always emits — the same guard `.github/scripts/security-triage-issue.sh` already used
  before closing the triage issue: `ci.yml`'s merge gate, and `security-audit.yml`'s
  status propagation, which previously fired only on a non-zero exit so an outage
  skipped it and the daily run concluded *success*. The triage issue was never wrongly
  closed (its own guard held) — the misleading part was the **run conclusion**, which
  is what a human reads. **A genuine npm outage now turns both lanes red** rather than
  green; that is the intended direction to fail.
- **2026-07-23: `next` 16.2.9 → 16.2.11** — remediates the 2026-07-22 Next.js
  advisory batch (9 GHSAs against `>=16.0.0 <16.2.11`: 4 high, including a
  middleware/proxy bypass and Server-Action DoS/SSRF, plus 5 moderate). The
  patched release was two days old, so a dated `minimumReleaseAgeExclude`
  (`next`, `@next/*`) takes it past pnpm's 7-day gate — the policy's documented
  security-fix path; remove 2026-07-28 (tracked in
  [`docs/MAINTENANCE.md` → Watch items](docs/MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done)).
  This was the first advisory wave routed through the security-triage pipeline
  (see Added above).
- **Transitive-advisory remediations via pnpm `overrides`** (no upstream fix
  existed for any at triage time; every override is temporary, with its removal
  condition tracked in
  [`docs/MAINTENANCE.md` → Watch items](docs/MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done)):
  - **2026-07-15:** `effect` → 3.21.4 (HIGH, via uploadthing's exact pin) ·
    `postcss@<8.5.10` → 8.5.15 (via Next's own pin) ·
    `@esbuild-kit/core-utils>esbuild` → 0.25.12 (via drizzle-kit).
  - **2026-07-22:** `brace-expansion` → 5.0.7 (HIGH, build-tooling paths) ·
    `dompurify` → 3.4.12 (via posthog-js, which ships client-side) · **`sharp`
    → 0.35.3 (HIGH — note: this forces sharp past Next 16.2.x's own `^0.34.5`
    optionalDependency pin on a real runtime path, `/_next/image`)**.
    `fast-uri`'s fix (3.1.4) is deliberately deferred behind the 7-day
    release-age gate (~2026-07-26) via two dated `auditConfig.ignoreGhsas`
    entries (build-tool-only exposure).
  - Provenance: only the 2026-07-15 trio and `brace-expansion` were Dependabot
    alerts — `sharp`, `dompurify`, and `fast-uri` were caught by CI's
    `pnpm audit` lane, the authoritative advisory gate here.

## [1.1.0] — 2026-07-20

Everything shipped on `main` since the initial release — all additive, verified
end-to-end, and graded **100.0/100** by the project audit (see
[`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)).

### Added

- **Path-to-100 depth** — typed field errors on writes, hydration-safe Zustand
  `persist`, admin-gated search reindex, a jobs dead-letter queue, keyless uploads
  e2e + a prod-callback tunnel proof, magic-link sign-in, full-surface en/es i18n
  coverage, email bounce/complaint suppression, opt-in OpenTelemetry export,
  `CSP_MODE=nonce` as a first-class build mode, and per-organization billing.
- **ai-dev-kit** — the repo's agentic-dev workflow, extracted to the standalone
  [ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) skill library and
  preinstalled here: two inception doors (`/project-init` from an idea,
  `/project-adopt` from an existing codebase), registry-verifying `dep-check` +
  `live-verify` skills, and advise-never-block hooks.
- **`pnpm init-app --slim`** — offers to strip the template's own history/marketing
  docs from a derived app (see
  [Getting started → Remove what you don't need](docs/GETTING_STARTED.md#remove-what-you-dont-need)).
- **Scheduled CI heartbeat** — `ci.yml` now runs weekly (`schedule`) and on
  `workflow_dispatch`, so the full pipeline keeps exercising world-facing surfaces
  between merges.
- **Staying-current recipe** — [Getting started](docs/GETTING_STARTED.md#staying-current-with-the-template)
  documents pulling later template improvements into a derived (degit) app.

### Changed

- **Docker Postgres moved 16 → 18** (`postgres:18-alpine` in both compose files and
  the CI service containers). **Action needed on existing local volumes:** 18+
  images refuse the old `/var/lib/postgresql/data` mount point
  ([docker-library/postgres#1259](https://github.com/docker-library/postgres/issues/1259)),
  so the compose files now mount the volume at `/var/lib/postgresql` — a volume
  created by an older image won't start under 18. Either `pg_dump` → recreate the
  volume → restore, or (throwaway dev data) delete the volume and re-run
  `pnpm --filter @repo/db db:migrate`.
- CI workflow actions updated a major each: checkout v7, setup-node v6,
  upload-artifact v7, codecov v7, codeql-action v4, pnpm/action-setup v6.

## [1.0.0] — 2026-07-14

Initial public release. The full inventory with rationale is
[`docs/FEATURES.md`](docs/FEATURES.md); everything below was verified end-to-end
against real services before release ([`docs/VERIFICATION.md`](docs/VERIFICATION.md)).

### Included

- **Platform** — Next.js 16 (App Router, React 19, React Compiler + Cache
  Components/PPR on by default), TypeScript 6 `strict`, Turborepo + pnpm workspaces,
  Node 24.
- **Database** — PostgreSQL + Drizzle ORM, committed migrations, a copy-me `posts`
  entity (keyset pagination, indexes, transactions, optimistic UI), backup/restore/DR
  runbook, seeding.
- **Auth** — Better Auth: email/password + verification + reset + HIBP check,
  env-gated GitHub/Google OAuth, 2FA (TOTP + backup codes), passkeys, organizations /
  multi-tenancy, admin (ban + impersonation) on top of fresh-from-DB RBAC, persisted
  audit log + `/admin/audit`, sessions management, two-hop email change, danger-zone
  deletion, opt-in Turnstile CAPTCHA, DB-backed rate-limit storage.
- **API** — tRPC v11 reads + Server Actions writes with typed field errors; SSE
  realtime notifications over Postgres LISTEN/NOTIFY.
- **UI / state / forms** — Tailwind v4 + shadcn/ui shared package, dark mode,
  Storybook + opt-in visual regression; TanStack Query + Zustand with a documented
  read-model boundary; React Hook Form + Zod v4 shared validators.
- **i18n** — next-intl `[locale]` routing (en/es), per-locale SEO, locale-aware
  formatting.
- **Payments** — Stripe hosted Checkout → webhook → `subscriptions` table, customer
  reuse, billing portal, dunning sync, subscription gating, cancel-on-account-delete.
- **Email** — Resend + React Email templates with plain-text parts and a proven
  deliverability recipe.
- **Uploads / search / jobs** — Uploadthing (persisted + fail-closed delete),
  Meilisearch (settings as code, index-on-write), pg-boss background jobs with a slim
  worker image.
- **Observability** — Sentry, BetterStack logging + dashboards-as-code, PostHog with
  consent gate + GDPR export, health endpoint, request telemetry.
- **Security** — full header set, static CSP + verified nonce-CSP recipe, COOP,
  security.txt, app-level rate limiting, 7-day supply-chain age gate (Renovate +
  pnpm), SHA-pinned actions, Trivy, SBOM/provenance, CodeQL.
- **Testing / CI** — Vitest (coverage-gated) + Playwright (a11y + visual lanes) +
  DB integration tests; CI: verify / audit / e2e / docker-image lanes. The unit suite
  runs with zero keys and no database.
- **Deployment** — multi-stage Docker (web + worker), dev/prod compose, a worked and
  proven Fly.io runbook, Vercel/Railway/self-host paths.
- **Docs** — `FEATURES` (what + why), `GETTING_STARTED`, `MAINTENANCE`, `AGENTS.md`
  agent onboarding, 14 per-area context docs, decision log, verification checklist.

[1.1.0]: https://github.com/jrittelmeyer/next-web-boilerplate/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/jrittelmeyer/next-web-boilerplate/releases/tag/v1.0.0
