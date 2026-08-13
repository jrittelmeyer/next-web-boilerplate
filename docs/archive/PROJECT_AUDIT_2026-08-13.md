# Project Audit — 2026-08-13 (fifteenth scoring pass)

> The `/project-audit` skill's fifteenth run, seven days after the fourteenth
> ([PROJECT_AUDIT_2026-08-06.md](PROJECT_AUDIT_2026-08-06.md), **99.3/100**).
>
> **Method — git-bounded, one adversarial review agent + live surface.** The
> fourteenth pass scored `main` at `f9626b6`; this pass's HEAD is `971d304` —
> which the pass itself had to discover: the local clone sat at `5677a02` until
> the live-surface check surfaced a newer commit on origin (see F2). The delta
> is **26 files** across ten commits: the two missing rate limiters, the B2
> predicate-sensor sweep (PR #51), the subscription-fixture time-bomb fix, the
> 08-07 parks and their 08-12 exits (`pnpm-workspace.yaml`), the kit
> 0.8.0 → 0.13.0 reinstall, and docs. Product code byte-identical outside that
> delta carries the prior pass's findings by identity. One subagent
> adversarially reviewed the product-code delta (limiters, sensors, overrides)
> while the main loop independently verified every seam and ran the live
> surface + registry gates, 2026-08-13 ~19:40–20:30 UTC.

## Headline: **99.3/100 — the 08-06 closures all held under adversarial re-review (API layer reaches 100), but the week's two new events both land on the tooling lane: the kit 0.13.0 reinstall was pushed to `main` un-gated and fails the repo's own lint (red since 08-12 23:54Z, heartbeat inherited), and the nanoid advisory widened out from under the 08-12 park exit four hours before this pass ran**

The score is flat at 99.3 and the composition tells the real story: +1.5 of
verified closures (the `deleteCalendar` limiter, the `/rsvp` read cap, the F2
revert sensors — all confirmed genuine at their seams) offset by −2 of new
findings, both process-shaped rather than product-shaped. Nothing in the
product tree regressed. What regressed is the *pipeline around it*: a
template-surface commit bypassed the gate, the contrarian policy, and the
same-commit docs rule in one push — exactly the failure mode the standing
"`main` has no branch protection" Watch item prices — and the dependency lane's
manual-process substitute (dated takes) is now measurably slipping 2–3 days per
take while Renovate delivery stays dead. The nanoid re-flag is the sharpest
version of the same lesson: with no automated PR delivery, an advisory that
widens *after* a correct take has no channel back into the repo except the
daily audit lane going red — or an audit pass like this one, which caught it
four hours after the advisory moved and a half-day before the lane would have.

## Live-surface results (2026-08-13)

| Check | Result |
| --- | --- |
| Code-scanning alerts (API) | **0 open** |
| Secret-scanning alerts (API) | **0 open** |
| Dependabot alerts (API) | **0 open** — #25/#26 stayed auto-closed |
| CI on `main` (`971d304`) | **RED** — the kit-reinstall push run failed `pnpm lint` (08-12 23:54Z), and the **08-13 Thursday heartbeat failed identically** (05:53Z). CodeQL green on the same commit. `5677a02`'s own runs (CI + CodeQL) were green 08-12 19:26Z |
| Red cause (reproduced locally) | Biome **format** error on `.claude/settings.json` — kit 0.13.0's installer serialized the new split `command`/`args` hook entries multi-line where Biome collapses them (1 error), plus `context-guard.mjs:29` `noUndeclaredEnvVars` (warning, non-gating). One `biome format --write` fixes the error |
| Daily security-audit lane | **Green 08-10 · 08-11 · 08-12 · 08-13** (06:09Z — 9½ hours *before* the nanoid advisory widened; tomorrow's 05:00Z run goes red unless the park lands first) |
| `pnpm audit` (local, this pass) | **1 HIGH — GHSA-2v37-7h3g-55p8 (nanoid)**: the advisory's 3.x range widened to `<3.3.18` at **2026-08-13T15:43:02Z**, re-capturing the tree's 3.3.17 (57 paths, all build tooling). See F3 |
| `security-triage` issue | None open (nothing has fired since the widening yet) |
| Open PRs / untriaged issues | **0 / 0** — the only open issue is #1, Renovate's Dependency Dashboard fixture |
| Pages (Storybook gallery) | **HTTP 200** |
| `renovate/*` branches | **Still zero, ever** — the Mon 08-10 window passed empty; third consecutive empty window since the config was exonerated (07-27 · 08-03 · 08-10). F1 carries |
| `pnpm outdated -r` | **56 unique packages** (49 on 08-06) — F1's compounding cost |
| Community files / on-ramp | Unchanged outside the delta (carried); README still says "calendar" **zero** times (F4) |

## Currency & gates (re-verified this pass)

| Gate | Finding |
| --- | --- |
| TS7 cutover (B4) | `typescript` latest **7.0.2**, next tag `7.1.0-dev.20260813.1` → **7.1 not released; gate stands** |
| `next` 16.3.0 | Still `dist-tags.latest` (no 16.3.1; canary `16.3.1-canary.15`). Aged in **2026-08-10 ~20:34Z** → the plan → sign-off take is now **3 days overdue**; both riders (retire the `sharp: 0.35.3` override; check postcss-key inertness) carry unchanged |
| `better-auth` | **1.6.27 exists** (published 2026-08-11T18:02Z → ages in **08-18 ~18:02Z**; no advisory). The due take today is still **1.6.26** (aged in 08-11 ~21:20Z, now **2 days overdue**); installed `^1.6.25` ×2 + passkey exact `1.6.25` verified in lockstep |
| `nanoid` | **GHSA-2v37-7h3g-55p8 widened 2026-08-13T15:43Z** to `<3.3.18` / first-patched 3.3.18 — the 08-12 exit's "3.3.18 = `legacy`-tag fix, no advisory delta" was true when written and is now false. 3.3.18 (published 08-07T16:41Z) **ages in 08-14 ~16:41Z**. Response = the new dated take in MAINTENANCE (park route (1) now, or accept one red daily lane tomorrow; then promote the key floor to `"nanoid@<3.3.18": 3.3.18`) |
| Workspace overrides (live read) | All **11** overrides present with removal conditions (vite · effect · postcss ranged · esbuild-kit scoped · brace-expansion · fast-uri ranged · dompurify ranged · nanoid ranged · sharp · undici ranged · socket.io-parser ranged); **no** `minimumReleaseAgeExclude`; `ignoreGhsas: []`. One condition contradicts mechanics — see F5 (brace-expansion's bare key) |
| effect / esbuild-kit overrides | Still required — `uploadthing` 7.7.4 (latest) still exact-pins effect 3.17.7; `drizzle-kit` 0.31.10 (latest) still deps `@esbuild-kit` |
| posthog-js (dompurify fix channel) | Latest **1.417.0** vs installed 1.391.2 — the next take is where the vendored-dompurify ≥3.4.13 check (Watch) runs |
| Dated-take discipline | Slippage is now a pattern: park exits +2 days (08-10 → 08-12), `next` 16.3.0 +3 days and counting, `better-auth` 1.6.26 +2 days and counting. This is F1's manual-process cost made measurable |

## Delta verification (the core of this pass)

Every claim was verified twice: independently by the main loop at the seam, and
by a subagent reviewing the full product-code delta adversarially.

- **`deleteCalendar` limiter — VERIFIED.** `calendar.ts:915-920`: keyed
  `calendar:delete:${userId}`, 10/60s, after `requireSession`, before schema
  parse — the same order as the sibling actions. The new unit test pins the
  exact key + shape and asserts the DB is never touched on denial; the
  shared-gates test now covers it alongside the others.
- **`/rsvp` read cap — VERIFIED.** `rsvp.ts:47-48`: keyed
  `calendar:rsvp:read:${attendeeId}`, 60/60s, deliberately **after**
  `verifyRsvpToken` — an unverifiable token consumes no bucket, so the key is
  not attacker-mintable; null-on-denial renders the same 200 "no longer valid"
  page, adding no enumeration oracle. The comment states the in-memory
  per-instance honesty. Matches `invitations.md:239` exactly.
- **F2 revert sensors — VERIFIED GENUINE.** The spelling pins capture the
  app's real `where(...)` through a recording double, compile it with
  `new PgDialect().sqlToQuery()`, and regex-assert the rule tokens — the F4 pin
  requires *both* arms (`"user_id" is null or … <> $N`), so reverting
  `or(isNull, ne)` → `ne` goes red; the F6b pin covers the respond-UPDATE's
  verified-email arm. TESTING.md's new "Predicate sensors" section describes
  exactly what shipped (pin + planted defect = complete sensor; deciding-column
  e2e with fixture warning comments).
- **Subscription fixture — VERIFIED.** `FUTURE = new Date(8.64e15)` (the max
  ECMAScript date): the mid-day time bomb class is gone, with the story
  recorded at the fixture.
- **Park exits (`pnpm-workspace.yaml`) — VERIFIED** against the live file (see
  the currency table). The nanoid key's *rationale comment* is the one thing
  time has since invalidated (F3) — a currency event, not a defect in the
  take.
- **Kit 0.13.0 hook content — REVIEWED (main loop; outside the subagent's
  range).** The changes are sound hardening: malformed-event `try/catch`
  guards, `CLAUDE_PROJECT_DIR`-anchored config resolution (fixes
  cwd-dependence), segment-boundary + case-insensitive path matching with
  regex escaping. The defects are confined to the install *output* quality:
  the settings.json serialization (F2) and the undeclared-env-var lint warning.

**Adversarial re-review (subagent, full product-code delta) — all five areas
PASS, one new finding (F5 below).** Highlights beyond the seam checks above:
the `deleteCalendar` limiter is byte-for-byte the sibling contract
(position, key shape, window, shared constant — all **8** calendar actions now
carry step 2, making `api.md`'s now-unqualified six-step claim true); the
`/rsvp` null-on-denial genuinely collapses no-cookie/forged/expired/removed/
deleted/rate-limited into one render branch (same 200, same copy, no 429
headers, and the Upstash RTT lands only *after* successful verification, so
timing cannot enumerate tokens); the spelling pins were **red-proven by
reconstruction** — the fixed spellings compile GREEN against the tests' exact
regexes, the reverted spellings (bare `ne()`, dropped `email_verified` arm)
compile RED, and neither pin can pass vacuously; the planted-defect
complements exist in `calendar-attendees.test.ts` as claimed; every
discriminating fixture carries its warning comment; the four e2e sensors
assert the deciding data (the enqueued `pgboss.job` recipient set; the victim
row's `status`/`user_id` read directly from Postgres; the `emailVerified`-only
`listInvites` guard; the range ownership conjunct with seeded in-window
events). The reviewer also reproduced the nanoid exposure claim against the
installed artifact (`postcss/lib/input.js` calls `nanoid(6)` from
`nanoid/non-secure`; the vulnerable functions are unreached) and ran the
gates: 142/142 unit tests, `tsc --noEmit`, knip — clean.

## Findings (this pass)

- **F1 — Renovate scheduled lane: CARRIED, sharpened (−2, Monorepo &
  tooling).** Third consecutive empty Monday window (07-27 · 08-03 · 08-10);
  zero `renovate/*` branches ever; 56 unique outdated packages (49 on 08-06).
  New this pass: the manual dated-take substitute is measurably slipping — the
  park exits ran 2 days late, `next` 16.3.0 is 3 days overdue, `better-auth`
  1.6.26 is 2 days overdue — and the nanoid re-flag (F3) shows what the
  missing delivery channel costs when an advisory moves *after* a correct
  take. The B1 diagnosis/fallback row stands, still first in the dependency
  lane; next window Mon 08-17.
- **F2 — `main` is red: the kit 0.13.0 reinstall was pushed un-gated and its
  install output fails the repo's own lint (NEW; −1 Monorepo & tooling, −1
  Testing & CI).** `971d304` (2026-08-12 23:54Z, direct push) rewrote
  `.claude/settings.json` into a form Biome's formatter rejects; `pnpm lint`
  fails, so the verify lane failed on the push and the 08-13 Thursday
  heartbeat failed identically — `main` has been red ~20 hours. Three
  self-imposed disciplines were bypassed at once (the full-gate agreement, the
  ALWAYS-contrarian rule for `.claude/**`, same-commit docs — the kit jump has
  no CHANGELOG entry or STATUS row), which is precisely the cost the standing
  "`main` has no branch protection" Watch item describes. The hook *content*
  is good (see above); the defect is the installer's output quality plus the
  process. One commit un-reds it (`biome format --write .claude/settings.json`
  + the skipped docs); the durable half is kit-side (emit gate-clean output).
  New B1 row; **advised against** a repo-side Biome ignore for the file — it
  would hide future kit-output drift from the gate.
- **F3 — the nanoid advisory widened out from under the 08-12 exit (NEW; no
  deduction — response window open).** GHSA-2v37-7h3g-55p8's 3.x range moved
  to `<3.3.18` at 2026-08-13T15:43Z — ~20 hours after the exit merged, ~4
  hours before this pass. The 08-12 take was policy-correct on the registry
  state of its day; the tree's 3.3.17 is simply vulnerable-flagged again
  (exposure analysis unchanged: build-tooling paths, the vulnerable functions
  never invoked). Every audit-running lane goes red from now until the
  response lands: the CI audit *merge gate* fails at HIGH on any PR, and the
  daily lane files the triage issue tomorrow 05:00Z. The response is written
  as a dated take in MAINTENANCE (park now **or** accept one red lane; promote
  the key floor to `"nanoid@<3.3.18": 3.3.18` at age-in 08-14 ~16:41Z, since
  the current `<3.3.17` key cannot move a 3.3.17 copy). Scored per the 08-06
  precedent: competent execution of the stated policy is the bar, and the
  policy's clock started four hours ago.
- **F4 — README says "calendar" zero times: CARRIED (−1, Docs & DX).**
  Re-verified by grep this pass; the B3 currency row is open.
- **F5 — `brace-expansion: 5.0.9` is still a bare override key (NEW, from the
  adversarial re-review; −0.5 Security).** Its comment ends "remove once a
  routine bump naturally carries the lockfile past 5.0.9" — the exact
  unsatisfiable-removal defect the **same 08-12 commit** diagnosed in its own
  fast-uri comment and fixed for fast-uri and dompurify, left un-applied on
  the third eligible key. While bare, the key rewrites every future
  brace-expansion resolution to exactly 5.0.9, so the stated condition can
  never fire and a future >5.0.9 fix would be silently forced *down* (the
  hazard the undici comment articulates). No current exposure — 5.0.9 is
  today's fix floor. Cheapest closure: convert to the ranged
  `"brace-expansion@<5.0.9": 5.0.9` riding the 08-14 nanoid PR (same file,
  same class); MAINTENANCE's bullet corrected this pass (doc half).

## Doc drift (found this pass)

- **The nanoid dated-take state** existed nowhere (the advisory moved today) —
  added to MAINTENANCE → dated takes with both response routes and the
  merge-gate warning, plus a re-flag clause on the BACKLOG Watch bullet.
- **The better-auth dated take** didn't know about 1.6.27 — bullet updated
  (due take remains 1.6.26; 1.6.27 ages in 08-18; re-verify at take time).
- **The kit 0.13.0 update is undocumented** — no CHANGELOG entry, no STATUS
  row (part of F2; the fix commit should carry both, so it is left to that
  commit rather than half-recorded here).
- **MAINTENANCE's brace-expansion removal condition was unsatisfiable as
  written** (F5's doc half) — corrected to the ranged-key conversion, with
  the code half riding the 08-14 take.

Spot-checks that **passed** (no drift): `api.md` (deleteCalendar 10/min ·
range 20/min) and `invitations.md` (60/min per invitation, keyed by attendee
id) match the shipped code; TESTING.md's predicate-sensor section describes
exactly what PR #51 shipped; CHANGELOG carries every delta item *except* the
kit commit (above); the workspace-override comments match MAINTENANCE
verbatim; VERIFICATION.md untouched by the delta and carried.

## Score table

| # | Feature group | 08-06 | Now | This pass's basis |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 97 | **96** | F1 carried + sharpened (−2); kit `prodVerify.start` still broken (−1); NEW: kit install output fails the repo gate (−1, F2's tooling half) |
| 2 | Framework & app architecture | 100 | **100** | Carries by identity |
| 3 | Database | 100 | **100** | Carries |
| 4 | Auth & access control | 100 | **100** | Carries; 1.6.26/1.6.27 are dated takes on the tooling lane, not auth defects |
| 5 | API layer (tRPC + Actions) | 99.5 | **100** | The last named gap closed and verified: `deleteCalendar` limiter (10/min, unit-pinned) + the `/rsvp` read cap (60/min, null-on-denial) |
| 6 | UI & design system | 98.5 | **98.5** | Table-container remedy, avatar-readying gating, `select`/`form` stories — all open B3 rows |
| 7 | State & data fetching | 100 | **100** | Carries |
| 8 | Forms & validation | 100 | **100** | Carries |
| 9 | Email | 99 | **99** | Localized reminder emails still open (−1, B2 row) |
| 10 | Payments (Stripe) | 100 | **100** | Byte-identical — carries |
| 11 | File uploads | 100 | **100** | Byte-identical — carries |
| 12 | Search | 100 | **100** | Byte-identical — carries |
| 13 | Background jobs | 100 | **100** | Carries |
| 14 | Observability | 100 | **100** | Byte-identical — carries |
| 15 | Security | 100 | **99.5** | Ledger verified live (0/0/0 alerts; empty allowlist; the reviewer re-derived the nanoid exposure claim from the installed artifact). F3 is a 4-hour-old ecosystem move with the policy response already written — not a deduction. F5 is: the bare brace-expansion key contradicts the repo's own stated ranged-key rule, applied to only 2 of the 3 eligible keys in the same commit (−0.5) |
| 16 | Testing & CI | 98.5 | **98** | F2's two revert-insensitive proofs closed with genuine sensors (+0.5); `set-active` still unexplained (−1, instrumented, next red is the evidence); NEW: `main` red ~20h incl. the heartbeat (−1, F2's CI half) |
| 17 | Deployment & ops | 100 | **100** | Heartbeat *ran* on schedule and detected exactly what it should; the red is the lint cause, scored once under 16 |
| 18 | Docs & DX | 98 | **98** | F4 README currency (−1); deck calendar gap (−0.5, B3); v1.2.0 uncut vs the CHANGELOG's own promise (−0.5, B3) |
| 19 | Internationalization | 100 | **100** | Carries |
| 20 | Realtime / SSE | 100 | **100** | Carries |
| 21 | Calendar & scheduling | 95.5 | **96** | F2's predicates now revert-sensitive (+0.5); remaining: long-tail batch (−2.5) · blank-grid 429 (−1) · invitee-side signal when email unconfigured (−0.5) |
| | **Overall (mean)** | **99.3** | **99.3** | 2085 / 21 = 99.29 — flat headline, shifted composition: +1.5 verified closures against −2.5 of new findings, all three of them pipeline-shaped, none product-shaped |

## Backlog delta

**One new row.** Every other open deduction already has a row.

| Band | Row | Change |
| --- | --- | --- |
| B1 | **Un-red `main` + make kit install output pass the repo gate** (NEW) | Repo half: one commit (`biome format --write .claude/settings.json` + the skipped CHANGELOG/STATUS entries). Kit half: `install.mjs` emits gate-clean output; declare `CLAUDE_PROJECT_DIR` for the lint warning. Template surface ⇒ contrarian + sign-off |
| Watch | Temporary security overrides bullet | Nanoid re-flag clause added (advisory widened 08-13; the 08-14 dated take is the response) |
| Watch | F5 (brace-expansion bare key) | **Not a standalone row** — a rider on the 08-14 nanoid dated take in MAINTENANCE (one-line ranged-key conversion, same file, same class); the bullet's unsatisfiable removal condition corrected this pass |

**Owner-carry (dated, canonical in MAINTENANCE → Watch → dated takes):**
**TODAY** — the F2 un-red commit; and the F3 route decision (park GHSA-2v37
now = every lane stays green, or accept one red daily lane + auto-filed triage
issue tomorrow). **2026-08-14 ~16:41Z** — `nanoid` 3.3.18 ages in: promote the
key floor, delete any park. **OVERDUE** — `next` 16.3.0 (aged in 08-10; plan →
sign-off; sharp-override retirement + postcss riders). **OVERDUE** —
`better-auth` 1.6.26 (aged in 08-11; routine; 1.6.27 ages in 08-18).
**Mon 08-17** — the next Renovate window check (B1 diagnosis is the real fix).

## Considered & excluded

- **Deducting Security for the nanoid re-flag**: the advisory widened four
  hours before the pass; no lane had run since; the policy response was
  written into MAINTENANCE by this pass. Competent execution of a stated
  policy is the bar (08-06 precedent) — the clock is running, not expired.
- **Counting the e2e green streak toward `set-active`'s 20-consecutive-run
  removal condition**: several e2e-green lanes accumulated since 08-03 (both
  08-12 push runs and today's heartbeat all passed e2e), but this pass did not
  enumerate all runs since 08-03 to certify the count; the condition
  self-resolves and the instrumentation is in place.
- **A repo-side Biome ignore for `.claude/settings.json`**: rejected in the
  B1 row itself — it would permanently hide kit-output drift from the gate,
  which is the only automated check the kit boundary has.
- **Scoring the direct push as a Security finding**: it is a process breach,
  not an access-control defect — the repo's own Watch item already names the
  absence of branch protection as an owner decision; priced under tooling/CI.
- **Four reviewed-and-accepted residuals from the adversarial pass** (INFO,
  no rows): a token-holder can grief their own invitation's 60/min read
  bucket (bounded — requires possessing the capability, self-heals ≤60s, the
  submit path is separately capped per-IP); the pre-verify `/rsvp` path is
  deliberately unlimited (one HMAC per forged token, no DB — "abuse
  dampening, not the defence" is the stated design); the four e2e sensors
  ride at the tail of two long serial tests, so an earlier-flow failure masks
  them (the stated existing-fixtures economy); the F4 pin is order-sensitive
  (`or(ne, isNull)` would trip it) — the declared pin posture, updated beside
  the integration proof on any equivalent rewrite.
- **A row for knip's pre-existing configuration hint** (`packages/ui` entry
  `./src/hooks/**/*.ts` not found): cosmetic, not in the delta, the gate does
  not fail on it — worth one line in the next knip-touching change, not a row.
- **Carried from 08-06 unchanged**: Phase 6 Band 2 (owner-gated); guest
  reminders + inbound iTIP (owner-closed extension points); `main` branch
  protection (standing owner decision); the F8 census class runtime guard.

## Prioritization

Dated/urgent items lead, then the band order is unchanged:

1. **TODAY — un-red `main`** (new B1 row, repo half; one commit) **bundled
   with the F3 park** if the green-path route is chosen — note any PR opened
   before the park lands fails the audit merge gate at HIGH, so the format fix
   and the park should travel together.
2. **2026-08-14 ~16:41Z — nanoid 3.3.18**: promote the ranged key's floor,
   delete the park; **rider: convert `brace-expansion: 5.0.9` to its ranged
   form in the same change (F5)**.
3. **`next` 16.3.0** (3 days overdue): plan → sign-off, with the
   sharp-override retirement and postcss-inertness riders.
4. **`better-auth` 1.6.26** (2 days overdue): routine take; re-verify against
   1.6.27's age-in on 08-18.
5. **Renovate B1** (owner half): Mon 08-17 window check, or start the
   Mend-side diagnosis — it remains the root fix for the slippage F1 now
   measures.

Within B2, the band order carries from 08-06 (blank-grid 429 → localized
reminders); B3 is polish (README calendar currency first — the front door).
Band order maps to the backlog doc's B1 > B2 > B3 convention unchanged.
