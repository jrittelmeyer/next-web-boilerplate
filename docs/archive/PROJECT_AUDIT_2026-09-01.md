# Project Audit — 2026-09-01 (seventeenth scoring pass)

> The `/project-audit` skill's seventeenth run, thirteen days after the sixteenth
> ([PROJECT_AUDIT_2026-08-19.md](PROJECT_AUDIT_2026-08-19.md), **99.4/100**).
>
> **Method — git-bounded + live surface.** The sixteenth pass scored `main` at
> `7c20dec`; this pass's HEAD is `8414839`. The delta is **71 files across 20
> commits**: two dated dependency takes (`next` 16.3.1 taken-then-reverted, then
> 16.3.3 on a route-(2) exception; `better-auth` 1.6.30 exact-pinned), the
> CVE-2026-14456 Docker fix (a shared `patched` stage), the v1.2.0 release cut, the
> ai-dev-kit 0.13.0 → 0.23.11 line (`--hooks` adopted, docs-sanity parity, Biome/knip
> excludes), the self-hosted `renovate.yml`, and four doc/harness audits. **Product
> code is byte-identical** outside `apps/web`/`packages/auth`/`packages/jobs`
> `package.json` (pins + `clean` scripts), `docker/Dockerfile`, `biome.json`,
> `knip.jsonc`, `pnpm-workspace.yaml`, `scripts/docs-sanity.mjs` and the new
> workflow — no `src/` file moved — so every prior per-group finding carries by
> identity and no adversarial product-code subagent was spawned. The three
> nontrivial new artifacts (`renovate.yml`, the Dockerfile `patched` stage, the
> docs-sanity kit-wiring parity check) were reviewed line-by-line in the main loop.
> A mechanical doc↔code reference sweep (every line-numbered reference in the
> context docs, the count claims, the STACK.md version table, the hard rules) ran in
> a read-only subagent; its results are under "Reference sweep" below. The
> live-surface + registry gates were re-run 2026-09-01 ~11:10–11:40 UTC, and the
> report file was handed to the `contrarian` subagent **before any row was seeded**
> — its 13 findings and their dispositions close the report.

## Headline: **99.3/100 — the two dated takes, the CVE fix and the release cut all landed with the process intact (contrarian passes, plan files, both Docker images booted locally), the ledger is zero-zero-zero and `main` is green at HEAD; the −0.1 is three template-surface/CI findings that predate this window but were never scored — `renovate.yml` failing red every Monday in every generated project, a deterministic month-boundary e2e red that was diagnosed but tracked nowhere, and the shared permission allowlist — plus STACK.md's version table left behind by both takes; partly offset by v1.2.0 cut and the kit gate-clean row closed**

Nothing product-side regressed; nothing product-side was touched. The week's
story is maintenance under load: `next` moved three times (16.3.1 taken and
reverted the same day when CI's Docker lane caught a standalone-only boot crash
`next start` never exercises — the incident became Dependency-policy rule 6;
16.3.3 taken on the age gate's route-(2) exception for an AVIF-decode RCE
reachable through this repo's own upload surface, exclude scoped to every
lockstep package after a contrarian catch), `better-auth` 1.6.30 exposed that a
caret range silently resolves into the breaking 1.7 line (now exact-pinned), and
the Docker lane went red for four days on a base-image OpenSSL CVE that a shared
`apk upgrade` stage fixed. Renovate's picture changed shape rather than resolving:
the Mend App opened the **first scheduled `renovate/*` PR in the repo's history**
(#56, a no-lockfile actions bump, every lane green) the same morning the
self-hosted fallback shipped and then failed at startup for want of its secret —
two hosts are configured against one repo, the owner's host decision is the one
action between the standing deduction and its closure, and the fallback itself
turned out to be the one workflow in the repo that fails rather than skips when a
generated project hasn't configured it.

## Live-surface results (2026-09-01)

| Check | Result |
| --- | --- |
| Code-scanning alerts (API) | **0 open** |
| Secret-scanning alerts (API) | **0 open** (secret scanning + push protection enabled) |
| Dependabot alerts (API) | **0 open** |
| `pnpm audit` (local, this pass) | **No known vulnerabilities**; `ignoreGhsas: []` verified in the live file |
| GHSA DB (`advisories?affects=`) | `better-auth@1.6.30` → 0 · `next@16.3.3` → 0 |
| CI on `main` (`8414839`) | **GREEN** — CI run `33468251274` attempt 2 (attempt 1 cancelled by a leftover session monitor re-running the old e2e job, recorded in owner memory) + CodeQL `33468251255`. Every lane incl. Docker, visual, csp-nonce; perf skipped by design |
| CI red window since 08-19 | `32dd92a` 08-25 verify lane (kit 0.23.1 push — knip unused-file, fixed next commit) · Docker lane red **08-26 → 08-30** on CVE-2026-14456 (`9968296`, the 08-27 heartbeat, `999b097`, `5210b27`) — fixed `870b6c1`, green since · `3e68733` **attempt 1 e2e red 09-01 02:37Z** (F3 below), attempt 2 green |
| Daily security-audit lane | **Green 08-21 → 09-01**, unbroken (12/12) |
| Open PRs / untriaged issues | **1 / 0** — [#56](https://github.com/jrittelmeyer/next-web-boilerplate/pull/56) (Mend Renovate, `actions/checkout` 7.0.1 across `ci.yml`/`codeql.yml`/`pages.yml`/`security-audit.yml`, **10/10 checks green** incl. `renovate/stability-days`; awaiting the host decision). Issue #1 = the Dependency Dashboard, `updatedAt` **still 2026-07-22** |
| `renovate/*` branches | **1, ever** — `renovate/actions-checkout-7.x` (08-31 10:57Z). Self-hosted `renovate.yml` run `33425165393` (08-31 18:28Z) → `failure` at startup: `RENOVATE_TOKEN` unset (`gh secret list -R …` → empty, verified) |
| `pnpm outdated -r` | **58 unique** (66 on 08-19) — 6 majors behind: `typescript` 7 (held), `@types/node` 26, `jsdom` 30, `size-limit`/`@size-limit/file` 13, `@testing-library/jest-dom` 7 |
| Exact-pinned publishers vs `latest` | `posthog-js` 1.391.2 → **1.423.0** (the dompurify fix channel) · `@sentry/nextjs` 10.59.0 → 10.73.0 · `stripe` 22.2.2 → 22.6.0 · `knip` 6.24.0 → 6.34.0 — F1's measured cost this pass |
| Releases | v1.2.0 published 08-30 · **v1.0.0 and v1.1.0 are `draft=true`, `published_at=null`** since 2026-07-20 (F5) |
| Pages (Storybook gallery) | **HTTP 200**; last deploy 08-03 (`@repo/ui` unchanged since) |
| README front door | `cp .env.example .env` · `docker compose … up -d` · `pnpm install` · `pnpm --filter @repo/db db:migrate` · `pnpm dev` — every Scripts-block command resolves to a real root script; `.nvmrc` = 24; CI badge 200. "calendar" appears **once** (Layout line, 08-26) — the status blurb + feature enumeration still omit it (B3 row, text refreshed) |
| Community files | CONTRIBUTING · CODE_OF_CONDUCT · `.github/SECURITY.md` · PR template · two issue forms + `config.yml` · FUNDING — GitHub community profile **100%** |
| `pnpm docs:sanity` | **Green** — 65 files link-checked, AGENTS.md commands verified, kit-wiring parity, 117/150 lines |
| `docs/archive/README.md` index | **25 rows = 25 files** before this report (its same-commit rule had slipped three times before 08-31; holding — this report adds row 26) |
| Remote branches | `main` · `renovate/actions-checkout-7.x` · `docs/adopt-wrapper-backlog-row` (parked, owner-tracked — INFO carries) |

## Currency & gates (re-verified this pass)

| Gate | Finding |
| --- | --- |
| `next` 16.3.3 `minimumReleaseAgeExclude` | **Present, due today**: 16.3.3 published 2026-08-25T15:32Z → the block goes inert **2026-09-01 ~15:32Z** (this pass ran ~11:10Z — on schedule, not late). It has **ten** entries (`next`, `@next/env`, 8 `@next/swc-*`) — MAINTENANCE's "all 9" was a miscount shared with the CHANGELOG/STATUS rows (contrarian #3; the living doc is corrected, the historical rows stand). Delete + prove with a frozen install, per the 07-28/08-06 precedent; the same edit should fix the file's `vite` comment (F8 rider) |
| `next` 16.3.4 dated take | `dist-tags.latest` = 16.3.4 (published 2026-08-31T20:00:51Z, no 16.3.5) → ages in **2026-09-07 ~20:00Z**. **Pre-triaged this pass (Dependency-policy rule 6):** the release "re-enables AVIF Image Optimization" (#97949) — the other half of the 16.3.3 mitigation, i.e. the exact subsystem the security take moved — and raises `optionalDependencies.sharp` `^0.35.3` → **`^0.35.4`** (`sharp` 0.35.4 published 2026-08-26T09:42Z, ages in 09-02 — clear by the take), so the lockfile moves `sharp` too. Three backports (testmode passthrough recursion, a TS-alias build error, Turbopack `crossOrigin`); nothing touches `output: 'standalone'`. Riders written into MAINTENANCE: Docker build+boot both images (rule 6), drive `/_next/image` with an **AVIF** source *then* the OG/icon routes (order-dependent), confirm the libheif floor in the vendored libvips, and bump `@next/eslint-plugin-next` in lockstep (it resolves 16.2.12 today) |
| `better-auth` | Installed **1.6.30 exact**; `latest` 1.7.2 (08-26, bug fixes only — ban expiry, client types, callback-URL validation); GHSA DB reports **0 advisories** against 1.6.30. 1.7.x stays plan → sign-off (15 breaking changes incl. captcha-path wildcards and issuer-scoped account identity, both wired here). `@better-auth/passkey` 1.6.30 in lockstep; 1.7.2 exists for the migration day |
| TS7 cutover (B4) | `typescript` latest **7.0.2**, `next` tag `7.1.0-dev.20260901.1` → 7.1 not released; gate stands |
| Workspace overrides (live read) | **10 keys** (nine security + `vite`), every security key ranged, each with its dated why/removal comment; `sharp` override retired 08-26 as its condition met; `auditConfig.ignoreGhsas: []` — matches BACKLOG's "ten overrides… nine security + the vite freshness pin" exactly |
| effect / esbuild-kit overrides | Still required — `uploadthing` latest **7.7.4** (exact-pins effect 3.17.7); `drizzle-kit` latest **0.31.10** (still deps `@esbuild-kit`). Carry by upstream identity |
| posthog-js (dompurify fix channel) | Latest 1.423.0 vs installed 1.391.2 — 32 minors; the vendored-dompurify ≥3.4.13 check still runs at the next take |
| ai-dev-kit | Installed **0.23.11**; clone `C:\Projects\Development\Personal\ai-dev-kit` at **0.23.16** (08-31, `harness-audit` reference refresh; tree clean); `install.mjs --check --dest .` → **13 drifted files**, all upstream-forward, same set as 08-31. **Tags now exist v0.23.11 → v0.23.16** (the B1 kit row's rider (f) is satisfied kit-side). Adapter `adapters/next-web-boilerplate.json` still legacy `prodVerify` (unchanged since `3f21e66`) |
| Renovate schedule vs self-hosted cron | `.github/renovate.json`: `schedule: ["on monday"]`, `timezone: America/New_York`, lockfile maintenance Mondays; `renovate.yml` cron `0 12 * * 1` = 08:00 EDT Monday — inside the window. Next window **Mon 2026-09-07 12:00Z** (the self-hosted run fails again unless the secret lands or the file goes) |
| e2e 20-green removal condition | **Reset** — the lane went red on `3e68733` attempt 1 (09-01) for a third, now-diagnosed cause (F3). Since the Docker fix (`870b6c1`, 08-30): 5 completed CI runs, 4 green first-attempt, 1 green on rerun |
| CI heartbeat | `cron: "30 4 * * 4"` — next Thu **2026-09-03 04:30Z**; the 08-27 heartbeat correctly inherited the Docker red. Note: 04:30Z sits inside F3's window whenever a *winter* 1st falls on a Thursday (the EST window runs to 05:00Z) |

## Delta verification (all claims checked at their seams)

- **`next` 16.3.3 take (`9968296`) — VERIFIED.** `apps/web/package.json` `^16.3.3`;
  the exclude block lists `next` + `@next/env` + 8 `@next/swc-*` — ten entries, the
  contrarian-caught shape (its own prose says "9"; corrected in MAINTENANCE); `sharp`
  override gone from the live file with its retirement comment; registry: 16.3.3 pins
  `sharp ^0.35.3`, so the condition ("next's own pin ≥0.35.0") is genuinely met and
  the lockfile resolves `sharp@0.35.3` unaided.
- **`better-auth` 1.6.30 take (`2942a23`) — VERIFIED.** Exact `1.6.30` in both
  `apps/web/package.json` and `packages/auth/package.json`, `@better-auth/passkey`
  exact `1.6.30`; STACK.md's `better-auth` row rewritten to "1.6.30 (exact)" with the
  caret-resolution WHY — but not its passkey row (F8). Registry confirms the
  mechanism: `^1.6.30` satisfies 1.7.2 today.
- **CVE-2026-14456 fix (`870b6c1`) — REVIEWED LINE-BY-LINE, CLEAN.** A `patched`
  stage (`FROM node:${NODE_VERSION}` + `apk upgrade --no-cache libssl3 libcrypto3`)
  feeds both `worker` and `runner`; npm stripped from both runtimes; unprivileged
  users; the HEALTHCHECK uses `node fetch` (no curl in alpine). Plan file archived
  with its contrarian disposition; Docker lane green on every commit since.
- **`renovate.yml` (`c69eb6e`, new template surface) — REVIEWED; one finding (F2).**
  Both actions SHA-pinned; `permissions: contents: read`; token from the secret;
  cron inside Renovate's own schedule window; header documents the dual-host race
  and the `workflow`-scope PAT need. What it lacks is the repo's own skip-when-unset
  convention — see F2.
- **docs-sanity kit-wiring parity (`32dd92a`) — READ.** Reads both wiring forms,
  anchors exec form unquoted / shell form quoted, and diffs the kit-marker entries
  against `hooks/ai-dev-kit/hooks.json` on event/matcher/handler/if/timeout. Green
  this pass. (Its shape ignores `asyncRewake`, as the harness audit noted — rider (b)
  of the kit row.)
- **v1.2.0 cut (`e5e99f0`) — VERIFIED**, with a caveat that became F5: the CHANGELOG
  rollup, tag and *published* release all exist; the two earlier milestone releases
  the same header sentence claims are drafts.
- **08-26 / 08-31 doc audits — SPOT-CHECKED.** Showcase stamped "Current as of
  2026-08-31" (sixteen passes, 99.4 — one pass stale after this report; hunt #6 of
  the next `/doc-audit` owns the restamp, per precedent); DEPLOYMENT.md's Renovate
  section rewritten to the self-hosted workflow with the "committed but not yet
  live" status — consistent with the live surface; CONVENTIONS → Agent tooling
  carries the installer-route + `--hooks` rationale; archive index restored. What
  neither audit caught is under F8.

## Findings (this pass)

- **F1 — Renovate delivery: CARRIED (−2, Monorepo & tooling), the state changed
  shape.** The Mend App opened the first scheduled `renovate/*` PR ever (#56 —
  proving the github-actions manager, which runs *before* the pnpm work that gets
  killed, flows on Mend's tier), while the Dependency Dashboard's `updatedAt` is
  still 07-22 (the pnpm half still never finishes). The self-hosted fallback shipped
  and failed at startup — no `RENOVATE_TOKEN` — so two hosts are now live against
  the workflow header's own "never both" warning; the duplicate-dashboard race is
  latent only because the self-hosted run dies before it opens anything. Outdated
  fell 66 → 58 on the two manual takes, but the exact-pinned publishers this repo
  chose *because* a lane would bump them are drifting: `posthog-js` 32 minors
  (the dompurify fix channel), `@sentry/nextjs` 14, `knip` 10, `stripe` 4. Scoring
  note (contrarian #10): the −2 is a **fixed-price deduction for "delivery not
  restored"**, held since 07-29 by design; the compounding cost is recorded in the
  row rather than re-priced each pass. The row is one owner action from closing —
  a secret, or a deletion — then merge/close #56.
- **F2 — `renovate.yml` fails red every Monday in every project generated from the
  template (NEW, −1 Monorepo & tooling; template surface; own B1 row).** The repo's
  convention for lanes generated projects must not inherit hot is explicit
  (MAINTENANCE → Automation on a fork: unset `ENABLE_*` variables make lanes *skip
  silently — they don't fail*; `ENABLE_CODEQL`/`ENABLE_VISUAL`/`ENABLE_PERF`/
  `ENABLE_GHCR_PUBLISH`/`ENABLE_CSP_NONCE` all follow it, as job-level
  `if: ${{ vars.X == 'true' }}` at `ci.yml:294/547/602`, `codeql.yml:33`).
  `renovate.yml` is the one workflow that violates it: `scripts/init-app.mjs` ships it
  verbatim (its only `.github` deletion is `FUNDING.yml`), so every project created
  from the template — "Use this template" or `degit`, whose creation push registers
  the schedule — gets a "Renovate" run that fails at startup each Monday until its
  owner adds a classic PAT or deletes the file; a **private** generated repo never
  hits GitHub's 60-day schedule auto-disable, so it fails forever. Observed here as
  run `33425165393`. **Contrarian corrected the framing (#1):** *forks* are not the
  exposure — GitHub disables `schedule` in forks by default — generated projects are;
  and the fix must not wait on the host decision, because a job-level gate costs the
  same three lines under either host and is deleted for free under host (b), while
  every project generated in the meantime inherits the red. Mechanism: `secrets`
  cannot be read in a job-level `if`, so gate on `vars.ENABLE_RENOVATE == 'true'`
  (ON here once host (a) is chosen; unset elsewhere), or a first step that exits 0
  with a `::notice` when the token is empty; add `ENABLE_RENOVATE` to MAINTENANCE's
  variable list in the same commit. **New B1 row, S**, contrarian + sign-off at build.
- **F3 — Month-boundary e2e defect: deterministic, diagnosed, tracked nowhere
  (NEW, −1 Testing & CI).** The e2e lane failed on `3e68733` attempt 1
  (2026-09-01 02:37Z): `apps/web/e2e/calendar-invitations.spec.ts:165` timed out
  waiting for `getByRole('button', { name: /Standup/ })`. Root cause, confirmed
  from the job log and the page code: `dayInThisMonth()` (`:54-58`) builds the
  event's date from the **runner's** clock (`new Date().getMonth()` → September,
  UTC) while the organizer's stored zone is `America/New_York` (`:73`) and
  `/calendar` opens on *today in the stored zone*
  (`apps/web/src/app/[locale]/(dashboard)/calendar/page.tsx:39-45` →
  `instantToCivil(Date.now(), preferences.timeZone)`) — where it was still 22:37 on
  08-31, so the grid opened on August with no chip to click. Deterministic in the
  window **00:00–04:00 UTC on the 1st of every month** (05:00 in EST — which puts
  the 04:30Z heartbeat inside it whenever a winter 1st is a Thursday): any push,
  heartbeat or rerun landing there goes red, and attempt 2 (04:18Z) went green
  exactly as the diagnosis predicted. The diagnosis lived only in a session's
  memory — no repo doc, Watch entry or row named it, and MAINTENANCE's flake bullet
  still said the lane "has gone red once". It also resets the "20 consecutive green
  e2e lanes" removal counter both flake entries share, and `apps/web/e2e` ships to
  generated projects, so their lanes inherit the window. **Fix (S, test-only):**
  derive the day in `EVENT_ZONE` (`Intl.DateTimeFormat("en-CA", { timeZone:
  EVENT_ZONE })` → `YYYY-MM`) and make `now` injectable (or unit-test the helper) so
  the discrimination proof runs on any day, not only near a boundary (contrarian
  #5). **Not** the alternative the draft offered — `calendar.spec.ts`'s fixed-2027
  date + `gotoMonth` — because this spec visits `/calendar` six times and ~7 arrow
  presses per visit would trip the 20/min `calendar.range` cap its own header
  (`:29-30`) already works around (contrarian #2). `a11y.spec.ts:157`'s UTC-month
  seed is **verified safe**, not seeded as work: `DEFAULT_TIME_ZONE = "UTC"`
  (`apps/web/src/lib/user-preferences.ts:25,59-60`) and the a11y user stores no
  zone, so viewer zone and seed zone coincide; a grep of `apps/web/e2e` finds no
  other runner-clock month derivation (contrarian #4). **New B2 row + MAINTENANCE
  Watch entry (c)**; the next window is 2026-10-01.
- **F4 — Two hard rules are violated in code with no recorded exception (NEW,
  −0.5 Framework & app architecture).** AGENTS.md: "React Compiler is ON — no manual
  `useMemo`/`useCallback`/`React.memo`" and "no `as any`". Live (grep-verified this
  pass, confirmed as the complete set by the sweep): `apps/web/src/components/
  notifications/notifications-feed.tsx:103,111,120` (`useMemo` ×3, one carrying a
  WHY), `apps/web/src/components/observability/use-consent.ts:47,52` (`useCallback`
  ×2), `apps/web/src/server/actions/calendar-rsvp.test.ts:144` (`as any`, an
  invalid-input probe). Zero enums, zero `@ts-ignore`. The harness audit surfaced
  these through a lint probe; the project audit scores them as doc↔code drift — an
  absolute rule the code doesn't keep and no CONVENTIONS exception records.
  Recovery is the **B3 lint row's step 1, kept neutral per site** (contrarian #8):
  `notifications-feed.tsx:98-106` memoizes a query key used as *effect deps* and
  for `setQueryData` exact-match — a referential-stability-for-correctness argument
  the Compiler does not guarantee (it bails on rule-breaking components) — so
  "record the exception with its WHY" is a legitimate outcome there, "remove" is the
  likely one for the `useCallback`s, and `as never` for the test.
- **F5 — Two of three milestone releases are unpublished drafts (NEW, −0.5 Docs &
  DX; public surface).** `gh api …/releases`: v1.0.0 and v1.1.0 `draft=true`,
  `published_at=null` since 2026-07-20; only v1.2.0 (08-30) is published. The
  CHANGELOG header — "Each milestone is tagged … with a matching GitHub Release" —
  is true for tags (all three are public) and false publicly for two of three
  releases: drafts are invisible to non-collaborators, so a consumer landing on
  Releases sees one entry for a changelog that names three. Deliberate drafting is
  unlikely (both drafted on v1.1.0's date; v1.2.0 published) but unproven, so the
  reword fallback stays. Fix: publish both drafts — **`gh release edit v1.0.0
  --draft=false --latest=false`** (and v1.1.0): the `--latest=false` matters, since a
  newly published release defaults to "Latest" and would steal the badge from
  v1.2.0 (contrarian #6) — an outward-facing publish, the owner's click. **New B3
  row.**
- **F6 — The shared permission allowlist ships `winget install *` and
  `docker exec *` into every generated project (NEW to this audit, −0.5 Monorepo &
  tooling; filed 08-31 by the harness audit as a B1 row).** Verified live in
  `.claude/settings.json:4-11` this pass: eight `allow` grants from the 07-14 release
  commit, two of them broad exec classes, two dead one-offs, zero `deny`. The
  harness audit priced it in its own rubric (Permissions 82/100); this is a separate
  scorecard, not a double count — but the draft had homed it under **Security**,
  which was wrong (contrarian #7): the allowlist governs an agent session on a dev
  box and nothing in the deployed app's posture changed. Re-homed to Monorepo &
  tooling (template surface), same half point; Security stays at 100. Mapped to the
  existing B1 permissions row — no new row.
- **F7 — Kit currency: CARRIED into the merged kit-bump row (no new deduction).**
  Installed 0.23.11 vs clone 0.23.16; 13 drifted files (same set); adapter still
  legacy `prodVerify` — the start command a real run copied verbatim on 08-31 is
  still the shipped one. New this pass: tags v0.23.11 → v0.23.16 exist, so rider (f)
  is satisfied kit-side; the row's target moves 0.23.15 → 0.23.16.
- **F8 — The canonical per-dependency record was left stale by both dated takes
  (NEW, −0.5 Docs & DX; fixed in this pass's commit).** `docs/context/STACK.md` —
  the doc AGENTS.md routes every "version question" to — still said `next ^16.2.12`
  and `@better-auth/passkey 1.6.25` after the 08-26 takes moved both (its
  `better-auth` row *was* updated in that commit, so the miss is partial), and
  MAINTENANCE's override list still carried `sharp: 0.35.3` as active with a live
  removal condition eleven days after its retirement. Three doc surfaces, two takes,
  and the 08-26 full doc-audit pass ran between them. Unlike 08-19's F2 this is not
  ecosystem motion after a policy-correct take — it is the "keep docs current, same
  commit" agreement slipping on the doc that exists to absorb exactly these edits.
  **Scoring rule, stated (contrarian #9):** drift in the doc AGENTS.md routes to *for
  that exact question* costs even when the pass fixes it; incidental drift fixed
  in-pass (the sweep's other finds) does not. Two riders fall out: bump
  `@next/eslint-plugin-next` in lockstep at the 16.3.4 take (it resolves 16.2.12
  today — its own `pnpm add` in `tooling/eslint`), and correct the
  `pnpm-workspace.yaml` `vite` comment ("never import vite directly" — `packages/ui`
  declares it) the next time that file is touched, i.e. today's exclude deletion.
- **F9 — Two hard rules are stated without the carve-outs the codebase has always
  lived by (drift in the rule text; fixed in this pass's commit, no deduction).**
  "One React component per file" (AGENTS.md, `CONVENTIONS.md:35`) vs seven shadcn
  primitives exporting compound parts from one file (`dropdown-menu.tsx` 15,
  `dialog.tsx` 10, `select.tsx` 10, `table.tsx` 8, `card.tsx` 7, `form.tsx` 7,
  `avatar.tsx` 3 — upstream's distribution shape, which every `shadcn add`
  re-creates) plus ~20 **unexported** helper components beside their parents
  (`login-form.tsx` ×6, `org-settings.tsx` ×3, `two-factor-card.tsx` ×2, …; every one
  of the 66 app component files exports exactly one component); and "Vitest
  `*.test.*` co-located" vs the 12 integration suites under a package's own
  `__tests__/integration/` that TESTING.md documents as the opt-in location.
  Sixteen passes scored this practice at 100 — the rule *text* is what drifted, and
  loosening it to match verified practice is the honest fix (the code is not moving:
  re-splitting shadcn files fights the upstream tool, and knip already polices any
  *exported* second component). Reworded in AGENTS.md (template surface —
  contrarian #11 verified the edit is safe: no `init-app.mjs` anchor touches
  hard-rule text, `docs:sanity` checks only `## Commands` names and a warn-only
  150-line budget) and CONVENTIONS.md, with the contrarian's precision: "unexported
  helper components" (bounded, knip-policed) and "a package's own
  `__tests__/integration/`" (TESTING.md's table names only `db`; `jobs` is prose-only).
- **INFO — the 08-25 → 08-30 red window cost no new points.** Each red had a named
  cause, a same-day or next-day fix, and the process artifacts intact (the CVE fix
  carried a plan file, a contrarian pass and both images booted locally; the knip
  miss was fixed in the next commit). The reason is state-at-HEAD grading and the
  08-13/08-19 precedent (a superseded red whose content rode the next green run is
  not a process breach) — *not* "the standing Testing deduction prices the class",
  which the draft said and contrarian #10 corrected: the standing −1 is specifically
  `set-active`.
- **INFO — `docs/adopt-wrapper-backlog-row` (carried).** Still the only parked
  branch; owner-tracked in memory; delete-or-keep remains the owner's call.

## Doc drift (found this pass; every fix lands in this pass's commit)

- **`docs/VERIFICATION.md` Phase 1 — "8 HTML files" for the email export** →
  **13** (`magic-link` since 07-16 and the four calendar templates —
  `calendar-invitation`, `calendar-event-updated`, `calendar-event-cancelled`,
  `calendar-reminder` — never joined the list). Also `trpc.ts:118` → `:119`.
- **`docs/BACKLOG.md` `select`/`form` stories row — "20 components, 13 stories"** →
  **16 components, 13 stories** (`packages/ui/src/components/*.tsx` minus stories/
  tests); story-less are `form`, `select` and the non-visual `theme-provider`.
- **`docs/BACKLOG.md` kit row — "0.23.11 → 0.23.15"** → **0.23.16**; rider (f)
  ("ask the kit to tag v0.23.11–v0.23.15") is done kit-side.
- **`docs/BACKLOG.md` README-calendar row — "the front door says calendar zero
  times"** → it names it once (the Layout line, 08-26); the blurb and feature
  enumeration still omit it. Its "+1" re-priced to +0.5 to match the table.
- **`docs/BACKLOG.md` Renovate B1 row** — #56's verified state (10/10 checks; four
  workflow files, **not** `renovate.yml`, which postdates the PR — so its
  `actions/checkout` stays at v7.0.0 after the merge) and a pointer to the new F2
  row.
- **`docs/MAINTENANCE.md` e2e flakes bullet — "the lane HAS gone red once"** → it
  went red again 09-01 for a third distinct cause; **(c)** added with the evidence
  and removal condition; the 20-green counter reset noted. **Dated takes** — the
  16.3.4 pre-triage (AVIF re-enabled, `sharp` floor `^0.35.4`, riders); the exclude
  deletion's count (ten, not nine) and its `vite`-comment rider; the "all 9 lockstep
  packages" miscount in the 16.3.3 entry. **Automation on a fork** — the
  `renovate.yml` fails-rather-than-skips warning and `ENABLE_RENOVATE` in the
  variable list.
- **`docs/PROJECT_STATUS.md`** — the seventeenth pass row + litany + watch pointer.
- **`docs/context/STACK.md` · `DECISIONS.md` · `UI.md` · `TESTING.md` ·
  `docs/MAINTENANCE.md` override bullets · `AGENTS.md`/`CONVENTIONS.md` hard-rule
  text** — the reference sweep's finds (F8, F9 and the rest), itemized next.

### Reference sweep (subagent, read-only)

Scope: every line-numbered reference outside `docs/archive/` (15 — 2 VERIFICATION ·
3 MAINTENANCE · 1 TESTING · 9 BACKLOG), 1,442 backticked path tokens and 786
relative links across 50 docs, the count claims, the STACK.md version table against
every manifest, and the AGENTS.md hard rules against `apps/web/src` + `packages/*/src`.
All 786 links resolve; 13 of 15 line refs match exactly, one is a one-line near-miss
(`trpc.ts:118` → the limiter sits at `:119-122`; bumped), one rotted (below).

Found and fixed:

- `docs/context/TESTING.md:311` cited `MAINTENANCE.md:198` for the docs:sanity
  failed-open example — that line is now the reminder-emails Watch item; the example
  lives at `:757`. Re-pointed at the section anchor (line refs into a Watch list rot
  on every edit).
- `apps/web/globals.css` (DECISIONS ×2, UI ×1) → `apps/web/src/app/globals.css`;
  `app/loading.tsx` (DECISIONS, UI) → `app/[locale]/loading.tsx`.
- **`docs/context/STACK.md` — F8.** `next` row `^16.2.12` (manifest `^16.3.3` since
  08-26); `@better-auth/passkey` row `1.6.25` (manifest `1.6.30` since 08-26); the
  `@next/eslint-plugin-next` "same patch train" note — now false: it resolves 16.2.12,
  deliberately outside the 16.3.3 exclude, so a lockstep bump rides the 16.3.4 take;
  the `vite` row's "never imported directly" — `packages/ui` declares `vite: 8.0.16`
  as a devDep for Storybook's builder (the `pnpm-workspace.yaml` comment says the same
  wrong thing; that file is template surface, so its comment is a rider on today's
  exclude deletion); `@t3-oss/env-nextjs` "latest — verify at install" → `^0.13.11`.
- **`docs/MAINTENANCE.md` override bullets** — the `sharp: 0.35.3` bullet still read
  as an active override with a live removal condition (retired 08-26; the yaml
  comment and the 16.3.3 entry recorded it, the bullet didn't); the `brace-expansion`
  bullet still said "convert to the ranged form (riding the 08-14 nanoid take)" as if
  pending (done 08-14) and, with `fast-uri`, carried a bare-key header; `nanoid` had
  no bullet in the override list at all (its story lived only in the dated-take
  entries) — one-liner added so rule 5's "mirrored in the Watch items" is true.
- **Hard rules stated without their carve-outs — F9** (`AGENTS.md`,
  `CONVENTIONS.md:35`): reworded as described there.

Passed: 29 e2e specs; 9 + 3 integration files; 13 templates (after the fix above);
16 components / 13 stories; migrations `0000`–`0025` in
`packages/db/drizzle/migrations/`; the 10 override keys vs BACKLOG; every other
STACK.md row (react, better-auth, drizzle-*, @trpc/*, react-query, zustand, zod,
next-intl, posthog-js, @sentry/nextjs, stripe, uploadthing, tailwindcss, typescript,
vitest, @playwright/test, knip, turbo, biome, pg-boss, pnpm); kebab-case across 396
files; `*.spec.*` placement; the `useMemo`/`useCallback`/`as any` sites (F4) confirmed
as the complete set; zero enums, zero `@ts-ignore`. INFO: four stale `.gitkeep`
placeholders sit in long-populated dirs (`apps/web/src/{components,lib,server}/`,
15/57/5 entries) plus one in the still-empty `hooks/` — `git rm` the three in any
passing commit.

Spot-checks that **passed** (no drift): the overrides file vs BACKLOG vs
MAINTENANCE (10 keys, nine security + vite, all agree); the 16.3.3 exclude's
packages vs its MAINTENANCE bullet (modulo the shared "9" miscount, corrected);
DEPLOYMENT's Renovate section vs the live workflow/secret/PR state; STACK.md's
`better-auth` exact-pin row vs both manifests; CONVENTIONS' installer-route and
`--hooks` prose vs `settings.json`/`hooks.json`/`biome.json`; README quickstart +
Scripts vs root `package.json`; `.claude/settings.local.json` gitignored
(`.gitignore:54`); `init-app.mjs` anchors untouched by the F9 rewording.

## Score table

| # | Feature group | 08-19 | Now | This pass's basis |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 96 | **95.5** | F1 carried, fixed-price (−2); **F2 `renovate.yml` fails-not-skips in generated projects (−1, new B1 row)**; kit bump + legacy adapter (−1, merged B1 row); **F6 the template-surface exec grants + no deny floor (−0.5, B1 permissions row — re-homed here from Security)**; the kit gate-clean row **closed 08-25** (+1 recovered) |
| 2 | Framework & app architecture | 100 | **99.5** | **F4** — the Compiler rule violated at five sites, `as any` in a test, no recorded exception (−0.5; B3 lint row step 1, neutral per site). F9's rule-text drift fixed, no deduction |
| 3 | Database | 100 | **100** | Byte-identical — carries |
| 4 | Auth & access control | 100 | **100** | 1.6.30 exact, advisory-free (GHSA DB 0); 1.7.x plan-gated with no advisory forcing it |
| 5 | API layer (tRPC + Actions) | 100 | **100** | Carries |
| 6 | UI & design system | 98.5 | **98.5** | Table-container (−0.5), avatar-readying (−0.5), `select`/`form` stories (−0.5) — all open B3 rows; count claim corrected |
| 7 | State & data fetching | 100 | **100** | Carries |
| 8 | Forms & validation | 100 | **100** | Carries |
| 9 | Email | 99 | **99** | Localized reminder emails still open (−1, B2 row); template count drift fixed |
| 10 | Payments (Stripe) | 100 | **100** | Byte-identical — carries (`stripe` SDK 4 minors behind, F1's cost, no advisory) |
| 11 | File uploads | 100 | **100** | Byte-identical; the AVIF RCE path through `imageUploader` was closed by the 16.3.3 take, and 16.3.4's AVIF re-enable is pre-triaged |
| 12 | Search | 100 | **100** | Byte-identical — carries |
| 13 | Background jobs | 100 | **100** | Carries (`clean` script added; worker image on the `patched` stage) |
| 14 | Observability | 100 | **100** | Byte-identical — carries |
| 15 | Security | 100 | **100** | Ledger 0/0/0, `pnpm audit` clean, allowlist empty, every override ranged + conditioned, exclude block on schedule, CVE-2026-14456 fixed with the lane as witness. The agent-permission allowlist (F6) is priced under Monorepo & tooling — nothing in the deployed posture moved |
| 16 | Testing & CI | 99 | **98** | `set-active` still unexplained (−1 carries); **F3** the deterministic month-boundary red, diagnosed but untracked, counter reset (−1, new B2 row) |
| 17 | Deployment & ops | 100 | **100** | Dockerfile `patched` stage reviewed clean; rule 6 (exercise standalone before a `next` bump) recorded from the 16.3.1 incident |
| 18 | Docs & DX | 98 | **98** | README calendar currency (−0.5, progress since 08-26); deck calendar gap (−0.5); **v1.2.0 cut — recovered (+0.5)**; **F5** two draft releases vs the CHANGELOG claim (−0.5, new B3 row); **F8** STACK.md's version table left stale by both dated takes and a full doc audit (−0.5, fixed this pass — the stated rule); the rest of the sweep's drift fixed, no deduction |
| 19 | Internationalization | 100 | **100** | Carries |
| 20 | Realtime / SSE | 100 | **100** | Carries |
| 21 | Calendar & scheduling | 96 | **96** | Long-tail batch (−2.5) · blank-grid 429 (−1) · invitee-side signal when email unconfigured (−0.5) — B3/B2/B3 rows |
| | **Overall (mean)** | **99.4** | **99.3** | 2084.5 / 21 = 99.26 — dated takes, CVE fix and release cut all verified; three never-scored template/CI findings priced plus the stale dependency record; F1 one owner action from closing |

## Backlog delta

| Band | Row | Change |
| --- | --- | --- |
| B1 | **Tooling / CI — fork-safe gate for `renovate.yml`** (F2) | **NEW.** Job-level `if: ${{ vars.ENABLE_RENOVATE == 'true' }}` (or a skip-with-notice first step); `ENABLE_RENOVATE` into MAINTENANCE's variable list; does not wait on the host decision. Workflow surface ⇒ contrarian + sign-off. Monorepo +1. Effort S |
| B2 | **Testing — month-boundary fix in `calendar-invitations.spec.ts`** (F3) | **NEW.** Test-only, S; derive the day in `EVENT_ZONE` with an injectable `now`; **not** `gotoMonth`; a11y seed verified safe. Testing +1. Land before 2026-10-01 00:00Z |
| B3 | **Docs / release — publish the v1.0.0 + v1.1.0 draft releases** (F5) | **NEW.** Owner one-click ×2 with `--latest=false` (or reword the CHANGELOG header). Docs & DX +0.5 |
| B1 | Restore Renovate PR delivery | Evidence refreshed (#56 10/10 green, files, `actions/checkout` note; 58 outdated; exact-pin drift); points at the new gate row. Monorepo +2 with delivery restored |
| B1 | Kit 0.23.11 → **0.23.16** + adapter contract | **Edited:** target moved; rider (f) satisfied (tags exist through v0.23.16); 13 drifted files re-verified |
| B1 | Least-privilege pass on `.claude/settings.json` | Unchanged; now also carries **Monorepo & tooling +0.5** (F6) |
| B3 | Gate the prose-only hard rules, lint-only | Step 1 stated neutral per site (the `notifications-feed` memo is a correctness argument); now also carries **Framework +0.5** (F4) |
| B3 | README calendar currency | **Edited:** "zero times" → once (Layout); blurb + enumeration still open. Docs +0.5 (was +1) |
| B3 | Stories for `select` + `form` | **Edited:** 16 components / 13 stories; `theme-provider` named as the non-visual third |

**Owner-carry (dated, canonical in MAINTENANCE → Watch → dated takes):**
**2026-09-01 ~15:32Z** — delete the `next@16.3.3` **ten-entry**
`minimumReleaseAgeExclude`; prove with a frozen install; same edit corrects the
file's `vite` comment (F8 rider). **Thu 2026-09-03 04:30Z** — CI heartbeat.
**Mon 2026-09-07 12:00Z** — both Renovate hosts' windows; decide the host first,
then merge/close #56 (the F2 gate row is independent of that choice).
**2026-09-07 ~20:00Z** — `next` 16.3.4 ages in: plan → sign-off with the
AVIF/`sharp` 0.35.4/standalone riders above, plus `@next/eslint-plugin-next` in
lockstep. **2026-10-01 00:00–04:00Z** — the month-boundary window recurs; F3's fix
should predate it. **Unscheduled, owner timing** — the better-auth 1.7 migration
(plan first; no advisory).

## Considered & excluded

- **Deducting Auth for the better-auth 1.7 gap** — no advisory against 1.6.30
  (GHSA DB queried), plan-gated by decision; same call as 08-19.
- **A backlog row for the 16.3.4 take** — dated-take/plan-gate matter (MAINTENANCE),
  per the repo's convention that dependency currency stays out of the banded table
  unless it needs build work. The pre-triage is written there instead.
- **Scoring the 08-25 → 08-30 red window per incident** — state-at-HEAD grading and
  the 08-13/08-19 precedent (INFO above).
- **Scoring the Dockerfile's unpinned `apk upgrade` as a reproducibility defect** —
  deliberate and documented in the stage comment (Alpine's live repo, judged by the
  Trivy gate on every build); pinning apk versions would re-red the lane on every
  Alpine patch, which is the failure the stage exists to avoid.
- **A separate deduction for the exact-pinned publishers drifting** — that is F1's
  measured cost, held as a fixed-price deduction (stated in F1).
- **Certifying either standing e2e flake closed** — (a) no signup-hang recurrence and
  (b) no `set-active` recurrence in the window, but the shared 20-green counter
  reset on F3; both carry unchanged.
- **Keeping the hard rules as written and moving the code (F9)** — re-splitting
  shadcn compound files fights `shadcn add` on every upstream refresh, unexported
  helpers are already bounded by knip, and the integration-suite location is a
  documented, deliberate design (real Postgres, opt-in lane); sixteen passes graded
  the practice at 100. The text moved to the practice, not the reverse.
- **Scoring `dependabot_security_updates: disabled`** — deliberate posture (Renovate
  owns direct-dep PRs, `pnpm-workspace.yaml` overrides own transitives, Dependabot
  *alerts* stay on and were queried).
- **The two `Stop`-wired `checkpoint-autorun` handlers** — harness-audit territory,
  re-affirmed inert there; a node spawn per stop, nothing else.
- **Correcting the "9 lockstep packages" count in the historical PROJECT_STATUS and
  CHANGELOG rows** — the status doc's header forbids rewriting historical rows; the
  living MAINTENANCE entry and this report carry the correction.
- **Restamping the showcase (guide/deck/FEATURES say sixteen passes, 99.4)** —
  `/doc-audit` hunt #6 owns showcase currency by precedent; noted in the handoff.
- **Carried unchanged from 08-19**: Phase 6 Band 2 (owner-gated); guest reminders +
  inbound iTIP (owner-closed extension points); `main` branch protection (standing
  owner decision, 404 re-confirmed); knip's cosmetic `packages/ui` entry hint; the
  parked wrapper branch (INFO).

## Prioritization

Dated items lead; the band order is unchanged (B1 > B2 > B3):

1. **Today ~15:32Z — the 16.3.3 exclude block** (mechanical, S, frozen-install proof;
   ten entries; fix the `vite` comment in the same edit).
2. **F2 `renovate.yml` gate (B1, S)** — template surface, contrarian + sign-off;
   independent of the host decision and blocking every project generated meanwhile.
3. **Renovate host decision (B1)** — one action: `RENOVATE_TOKEN` + uninstall Mend
   *or* delete `renovate.yml`; then merge/close #56 (needs the `workflow` scope) —
   the root fix for every currency finding this pass made.
4. **F3 month-boundary spec fix (B2, S, test-only)** — before the 10-01 window; it
   also restarts the 20-green counter honestly.
5. **Kit 0.23.16 + adapter `verify` block, and the permissions pass (B1 ×2)** —
   template surface, contrarian + sign-off; rider (a) is a precondition of *any*
   reinstall.
6. **2026-09-07 ~20:00Z — `next` 16.3.4** (plan → sign-off with the riders).
7. **B3 polish**, breadth first: publish the two drafts (one click, `--latest=false`)
   → README calendar currency → the five-site Compiler decision + lint rules → deck →
   table-container → `select`/`form` stories → invitee-side signal → avatar readying.

Within B2 the order carries (blank-grid 429 → localized reminders), with the new
spec fix ahead of both because it is deterministic and dated.

## Contrarian disposition

Run on this file **before any row was seeded**, with the primary sources (not a
summary). It verified the diagnosis, the counts and the rewording's safety itself —
`calendar/page.tsx:39-45`, `user-preferences.ts:25,59-60`, `pnpm-workspace.yaml:282-291`,
`init-app.mjs:197-284`, `docs-sanity.mjs:76-84,284-289`, `dropdown-menu.tsx:211-227`,
`notifications-feed.tsx:98-106`, the GitHub docs on `schedule` in forks and
`make_latest` — and its two Majors changed the shape of what was seeded.
Verdict: **Sound with caveats**.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | Major | F2 as a *rider* defers a template-surface fix behind an unrelated owner decision; "fork" framing wrong — GitHub disables `schedule` in forks, generated (template/degit) repos are the exposure and private ones never auto-disable; `secrets` unusable in a job-level `if` | **Folded** — own B1 row, now; `vars.ENABLE_RENOVATE` gate or step-level notice; `ENABLE_RENOVATE` added to the variable list; wording "generated project" throughout |
| 2 | Major | F3's `gotoMonth` alternative would trip the 20/min `calendar.range` cap (six `/calendar` visits × ~7 arrows) — the exact 429 the spec's header avoids | **Folded** — alternative struck; `Intl.DateTimeFormat` derivation only; `page.tsx:39-45` evidence added |
| 3 | Minor | The exclude block has **ten** entries, not nine; MAINTENANCE's "all 9" and the report shared the miscount | **Folded** — report + MAINTENANCE corrected; the historical STATUS/CHANGELOG rows stand (header rule) |
| 4 | Minor | The a11y sub-task is closable now: `DEFAULT_TIME_ZONE = "UTC"`, the a11y user stores no zone; no other runner-clock month derivation in `apps/web/e2e` | **Folded** — verified-closed in F3 and the row, not seeded as work |
| 5 | Minor | "Prove it discriminates" is only executable near a month boundary | **Folded** — injectable `now` / unit-test the helper, in the row |
| 6 | Minor | Publishing an old draft steals "Latest" (`make_latest` defaults true) | **Folded** — `--latest=false` on both edits, in the row |
| 7 | Minor | F6 homed under Security misreports — nothing in the deployed posture moved | **Folded** — re-homed to Monorepo & tooling; Security 100; mean unchanged |
| 8 | Minor | F4's "remove the memoization" lean presumes the wrong outcome for `notifications-feed.tsx` (referential stability for effect deps + `setQueryData`) | **Folded** — step 1 neutral per site; "record the exception" named as a legitimate outcome there |
| 9 | Minor | Pass-fixed drift scored inconsistently (F8 −0.5, the rest 0) with the rule unstated; BACKLOG's README row promised "+1" vs the table's −0.5 | **Folded** — rule stated in F8; row re-priced to +0.5 |
| 10 | Minor | INFO rationale wrong ("standing deduction prices the class" — it is specifically `set-active`); F1's flat −2 defensible only as a stated fixed price | **Folded** — both reworded |
| 11 | Minor | Rewording safe and accurate (no `init-app` anchor, `docs:sanity` unaffected, counts verify); say "unexported helpers"; "a package's own `__tests__/integration/`"; number the finding | **Folded** — F9, with both precisions |
| 12 | Minor | B2 defensible; the 04:30Z heartbeat is inside the EST window when a winter 1st is a Thursday; `apps/web/e2e` ships to generated projects | **Folded** — both facts in F3 and the row |
| 13 | Minor | "Fixed in this pass's doc edits" was prospective at hand-off | **Folded** — every fix lands in this pass's commit; section header says so |

None overruled. The pre-fold draft carried F2 as a rider, offered `gotoMonth` as an
equal alternative, seeded an a11y audit that was already answerable, homed F6 under
Security, and undercounted the exclude block it told the owner to delete today.
