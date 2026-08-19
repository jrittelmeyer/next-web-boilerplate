# Project Audit — 2026-08-19 (sixteenth scoring pass)

> The `/project-audit` skill's sixteenth run, six days after the fifteenth
> ([PROJECT_AUDIT_2026-08-13.md](PROJECT_AUDIT_2026-08-13.md), **99.3/100**).
>
> **Method — git-bounded + live surface.** The fifteenth pass scored `main` at
> `971d304`; this pass's HEAD is `7c20dec`. The delta is **22 files across 8
> commits**, and almost all of it is the fifteenth pass's own prescriptions
> executing: the un-red commit (`fe7144a` — Biome format on
> `.claude/settings.json`, the nanoid route-1 park, the brace-expansion
> ranged-key rider), the `next` 16.3.0 → 16.3.1 supersede (docs), the
> `better-auth` 1.6.26 take, the `nanoid` 3.3.18 take, the auth leaf-rule
> scope-gap fix, one new template-surface feature (`checkpoint-autorun.mjs`,
> a Stop hook), and the 08-19 doc audit. Product code is byte-identical
> outside `packages/auth`/`apps/web` version pins and `pnpm-workspace.yaml`
> overrides — every prior per-group finding carries by identity. The pass
> verified each delta claim at its seam in the main loop (no product-code
> logic changed, so no adversarial subagent was spawned; the one nontrivial
> new artifact — the hook — was reviewed line-by-line here, including an
> external-doc check of its input-schema assumption), and re-ran the full
> live-surface + registry gates 2026-08-19 ~16:50–17:20 UTC.

## Headline: **99.4/100 — the fifteenth pass's five owner-carry items all executed on schedule (main green since 08-14, F5 closed, ledger clean at zero-zero-zero), and the one new template-surface artifact shipped with full process compliance; the standing deduction is still the dead Renovate lane, whose measured cost this pass is a breaking `better-auth` 1.7 minor arriving with no watch entry anywhere**

The +0.1 is composition, not drift: Security recovers its half-point (the
brace-expansion bare key is now the ranged form, verified live in
`pnpm-workspace.yaml`) and Testing & CI recovers the `main`-red point (green
streak since `fe7144a`, 6 consecutive completed CI runs). Nothing product-side
regressed; nothing product-side was even touched. The week's real story is
process health: every dated take the fifteenth pass scheduled landed (nanoid
same-day, 27 minutes after age-in; better-auth 1.6.26 with a contrarian
catch that widened the schema-diff rule; 16.3.0 correctly *refused* over a
live `sharp`/SVG regression verified against `vercel/next.js#96733`), and the
new Stop hook is the counter-example to the fifteenth pass's F2 — same
template surface, this time with the contrarian pass, the DECISIONS record,
the CHANGELOG entry, and a green gate all present. What has not moved is
Renovate: the dashboard issue hasn't been touched by Mend since **07-22**,
the fourth consecutive Monday window (08-17) passed empty, outdated packages
grew 56 → **66**, and `better-auth` ran five releases ahead — including a
**breaking 1.7.0** — with the repo's only discovery channel being this audit.

## Live-surface results (2026-08-19)

| Check | Result |
| --- | --- |
| Code-scanning alerts (API) | **0 open** |
| Secret-scanning alerts (API) | **0 open** |
| Dependabot alerts (API) | **0 open** |
| CI on `main` (`7c20dec`) | **GREEN** (16:21Z today) — CI + CodeQL both. Green streak since `fe7144a` 08-14 14:19Z: 6 consecutive completed runs (one `cancelled` at `34f9483` was a concurrency supersede; its content rode the next green run 12 min later) |
| Daily security-audit lane | **Green 08-15 · 08-16 · 08-17 · 08-18 · 08-19** — unbroken since the nanoid closure |
| `pnpm audit` (local, this pass) | **Zero vulnerabilities, zero ignored** — `ignoreGhsas: []` verified in the live file |
| Open PRs / untriaged issues | **0 / 0** — the only open issue is #1, Renovate's Dependency Dashboard fixture, **untouched by Mend since 2026-07-22T21:26Z** |
| `renovate/*` branches | **Still zero, ever** — fourth consecutive empty Monday window (07-27 · 08-03 · 08-10 · 08-17). F1 carries |
| `pnpm outdated -r` | **66 unique packages** (56 on 08-13, 49 on 08-06) — F1's compounding cost |
| Pages (Storybook gallery) | **HTTP 200** |
| README front door | Still says "calendar" **zero** times (F4 carries; B3 row open) |
| Remote branches | `main` + `docs/adopt-wrapper-backlog-row` (07-25, one BACKLOG line) — the latter is the parked repo-half of the wrapper program, tracked in owner memory; INFO note below |

## Currency & gates (re-verified this pass)

| Gate | Finding |
| --- | --- |
| `next` 16.3.1 dated take | **On time, due tomorrow**: 16.3.1 still `dist-tags.latest` (registry re-checked this pass; no 16.3.2), ages in **2026-08-20 ~22:45Z**. Riders carry: retire `sharp: 0.35.3` (sharp latest is still 0.35.3; next 16.3.1 pins `^0.35.3` — condition met), re-check postcss-key inertness, and the **order-dependent verification** (drive a `next/image` optimization *before* the OG/icon routes) |
| `better-auth` | **The line moved out from under the watch — no bullet tracked it (drift, fixed this pass).** Installed 1.6.26 (advisory-free, `pnpm audit` clean). Since the 08-14 take: 1.6.27 (published 08-11, **aged in 08-18**), 1.6.28 (08-13, ages in 08-20), 1.6.29 (08-14, ages in 08-21), 1.6.30 (08-17, ages in **08-24 ~19:11Z**), and **1.7.0/1.7.1 (08-18) — now `latest`, a breaking minor**: 15 breaking changes incl. an account-identity-by-issuer migration, captcha-path wildcard requirement, SCIM/MCP extractions. None of 1.6.27–1.7.1 carries a security fix (release notes checked). Response written this pass: a dated take for **1.6.30** (last 1.6.x; routine, riding the existing schema-diff + lockstep rules) and the 1.7 migration held for **plan → sign-off** — it is not a routine take, and two of its breaking areas (captcha paths, account identity) touch surfaces this repo wires. `@better-auth/passkey` 1.7.1 exists for lockstep when that day comes |
| TS7 cutover (B4) | `typescript` latest **7.0.2**, next tag `7.1.0-dev.20260819.1` → **7.1 not released; gate stands** |
| `nanoid` | **Closed.** `legacy` tag = 3.3.18 (installed floor), latest 6.0.1, no new advisory; the ranged key `"nanoid@<3.3.18": 3.3.18` verified live |
| Workspace overrides (live read) | All **11** present; brace-expansion now ranged (`"brace-expansion@<5.0.9"` — F5 closed as prescribed); `minimumReleaseAgeExclude` absent; `ignoreGhsas: []` |
| effect / esbuild-kit overrides | Still required — `uploadthing` latest is still 7.7.4 (exact-pins effect 3.17.7); `drizzle-kit` latest is still 0.31.10 (deps `@esbuild-kit`). Both carry by upstream identity |
| posthog-js (dompurify fix channel) | Latest **1.418.2** vs installed 1.391.2 — the vendored-dompurify ≥3.4.13 check still runs at the next take |
| Kit half of the gate-clean B1 row | **Still open** — ai-dev-kit remains at v0.13.0; its recent commits are docs-only, no `install.mjs` serialization fix yet. The repo half (un-red + retro-docs) verified DONE |
| e2e 20-green removal condition | **6 of 20** consecutive completed green CI runs since the red era ended 08-14. Not certifiable yet; both flake Watch entries carry |
| Dated-take discipline | **Recovered this week**: nanoid 3.3.18 taken 27 min after age-in; better-auth 1.6.26 and the 16.3.0 supersede decision both landed 08-14. The open defect is *coverage*, not execution — the successor better-auth releases had no bullet at all (F1's channel cost, measured again) |

## Delta verification (all claims checked at their seams)

- **`fe7144a` (un-red) — VERIFIED.** `main` green from 08-14 14:19Z; the
  fifteenth pass's prescribed one-commit fix shipped as specified (format fix +
  retroactive kit-0.13.0 CHANGELOG/STATUS entries). Total red window: ~38.4 h.
- **`nanoid` 3.3.18 take — VERIFIED.** Live file: `"nanoid@<3.3.18": 3.3.18`,
  allowlist `[]`, `pnpm audit` zero/zero; the brace-expansion rider landed in
  the same-day earlier commit exactly as the F5 prescription wrote it.
- **`better-auth` 1.6.26 take — VERIFIED.** `^1.6.26` in both
  `apps/web/package.json` and `packages/auth/package.json`;
  `@better-auth/passkey` exact `1.6.26` in lockstep. The take's contrarian
  pass materially improved the machinery: `packages/auth/AGENTS.md`'s
  schema-diff rule now names `@better-auth/core`'s `dist/db/` and the passkey
  package as diff surfaces (`34f9483`) — verified present in the leaf.
- **`next` 16.3.0 supersede — VERIFIED as process.** The MAINTENANCE bullet
  records the regression mechanism (process-global `sharp.block()` never
  unblocking SVG → breaks `ImageResponse`), the upstream fix PR, this repo's
  three affected files, and an order-dependent verification plan. The registry
  claim it makes ("re-checked 2026-08-19: 16.3.1 still latest") matches this
  pass's independent check.
- **`checkpoint-autorun.mjs` (new template surface) — REVIEWED LINE-BY-LINE,
  CLEAN.** Repo-identity guard (root `package.json` name — generated projects
  inert by default); dual loop guards (`stop_hook_active` + a 10-min-TTL lock
  file, independently sufficient); skip-on-pending-question and
  skip-during-rebase/merge/cherry-pick guards; upstream-less branches inert.
  The one assumption worth distrusting — that Stop-hook stdin carries a
  `last_assistant_message` field, without which the question guard would be
  silently inert — **checks out against the official hooks documentation**
  (documented for Stop/SubagentStop precisely for this use). Process
  compliance is the anti-F2: contrarian pass recorded (it added the
  repo-identity guard and the question skip before ship), owner authorization
  as a dated DECISIONS entry (AskUserQuestion-confirmed, scope stated,
  revisit-point named), CHANGELOG entry, `.gitignore` entry for the lock
  file, CLAUDE.md wiring note, green gate on the push.
- **08-19 doc audit — SPOT-CHECKED.** Deck carries the fifteenth pass (3
  mentions); `PHASE_HISTORY.md` gained the "Archived 2026-08-19" watch/overrides
  section its pointers promise; STATUS/BACKLOG watch compactions read true
  against the live surface everywhere except the better-auth line (below).

## Findings (this pass)

- **F1 — Renovate scheduled lane: CARRIED, sharpened again (−2, Monorepo &
  tooling).** Fourth consecutive empty Monday window (08-17); the Dependency
  Dashboard issue untouched by Mend since **07-22** (~4 weeks — the app isn't
  even scanning, let alone delivering); outdated 56 → **66**. The week's new
  measured cost: `better-auth` published five releases including a breaking
  1.7.0 that became `latest`, and no lane, bullet, or bot noticed until this
  pass — the 08-14 take verified 1.6.27/1.6.28 as in-gate but wrote no
  successor bullet, and nothing else exists to write one. The B1
  diagnosis/fallback row stands, still first in the dependency lane; next
  window Mon 08-24.
- **F2 — better-auth watch coverage gap (drift, fixed this pass; no
  deduction).** STATUS's "Open now, and nothing else" watch line and
  MAINTENANCE's dated-take set both omitted the moving better-auth line
  (1.6.27 aged in 08-18; 1.7.x breaking `latest`). Fixed this pass: a new
  dated-take bullet (1.6.30 routine take at 08-24 age-in; 1.7 explicitly
  gated on plan → sign-off with the passkey-lockstep and schema-diff riders
  restated) + the STATUS watch line updated. Scored per the 08-06/08-13
  precedent: the ecosystem moved after the 08-14 take, the response is
  written by this pass, and the *channel* defect is already priced in F1.
- **F3 — kit half of the gate-clean row: CARRIED (−1, Monorepo & tooling).**
  ai-dev-kit is still v0.13.0 with no installer-output fix, so the next
  `install.mjs --hooks` run would re-introduce the exact Biome-format red the
  repo half just cleaned up. The B1 row's kit half stays open.
- **INFO — `docs/adopt-wrapper-backlog-row` (07-25, one commit, +1 BACKLOG
  line) is the repo's only non-`main` branch.** It is the deliberately parked
  repo-half of the wrapper program (owner memory records it, with a trim
  instruction for when it's picked up), not forgotten clutter — but it is
  also invisible to a repo reader, since no repo doc mentions the branch.
  Owner call: delete it (the row is one line, trivially re-created), or leave
  parked. No deduction — one stale docs branch is not an adoption blocker.

## Doc drift (found this pass)

- **The better-auth dated-take state existed nowhere** (F2 above) — the
  successor-release bullet added to MAINTENANCE → dated takes; STATUS's
  "Open now, and nothing else" watch line corrected to include it.
- **BACKLOG's Renovate B1 row carried stale evidence numbers** ("48 dashboard
  entries · 50 outdated") — refreshed to the current measurements (dashboard
  frozen since 07-22 · 66 outdated) as part of the standard row-currency
  sweep.

Spot-checks that **passed** (no drift): the 16.3.1 bullet's registry claims;
the overrides file vs MAINTENANCE vs BACKLOG (all three agree, including the
two ranged-key conversions); `packages/auth/AGENTS.md` vs the 1.6.26 take
row; the checkpoint-hook prose in CLAUDE.md/DECISIONS/CHANGELOG vs the
shipped code (including its documented-field assumption); the deck/guide
fifteenth-pass stamps; VERIFICATION.md (untouched by the delta — carries).

## Score table

| # | Feature group | 08-13 | Now | This pass's basis |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 96 | **96** | F1 carried + sharpened (−2); kit `prodVerify.start` still broken (−1); kit gate-clean output still unshipped (−1, F3) |
| 2 | Framework & app architecture | 100 | **100** | Carries by identity |
| 3 | Database | 100 | **100** | Carries |
| 4 | Auth & access control | 100 | **100** | 1.6.26 installed and advisory-free; the 1.7 migration is a tooling-lane currency matter (dated take + plan gate written this pass), not an auth defect |
| 5 | API layer (tRPC + Actions) | 100 | **100** | Carries |
| 6 | UI & design system | 98.5 | **98.5** | Table-container, avatar-readying, `select`/`form` stories — all open B3 rows |
| 7 | State & data fetching | 100 | **100** | Carries |
| 8 | Forms & validation | 100 | **100** | Carries |
| 9 | Email | 99 | **99** | Localized reminder emails still open (−1, B2 row) |
| 10 | Payments (Stripe) | 100 | **100** | Byte-identical — carries |
| 11 | File uploads | 100 | **100** | Byte-identical — carries |
| 12 | Search | 100 | **100** | Byte-identical — carries |
| 13 | Background jobs | 100 | **100** | Carries |
| 14 | Observability | 100 | **100** | Byte-identical — carries |
| 15 | Security | 99.5 | **100** | F5 closed as prescribed (ranged brace-expansion key verified live); ledger 0/0/0 alerts, audit zero/zero, allowlist empty, every override conditioned |
| 16 | Testing & CI | 98 | **99** | `main` green since 08-14, heartbeat lane unbroken (+1 recovered); `set-active` still unexplained and the 20-green condition is at 6 (−1 carries) |
| 17 | Deployment & ops | 100 | **100** | Carries |
| 18 | Docs & DX | 98 | **98** | F4 README currency (−1); deck calendar gap (−0.5); v1.2.0 uncut while `[Unreleased]` keeps growing (−0.5) — all three have open B3 rows |
| 19 | Internationalization | 100 | **100** | Carries |
| 20 | Realtime / SSE | 100 | **100** | Carries |
| 21 | Calendar & scheduling | 96 | **96** | Long-tail batch (−2.5) · blank-grid 429 (−1) · invitee-side signal when email unconfigured (−0.5) — B3/B2/B3 rows |
| | **Overall (mean)** | **99.3** | **99.4** | 2086.5 / 21 = 99.36 — the fifteenth pass's prescriptions executed and verified (+1.5 recovered), no new product findings, F1 the standing deduction |

## Backlog delta

**Zero new rows.** Every open deduction already has a row or a Watch entry;
this pass's two changes are doc-currency edits, not new work items.

| Band | Row | Change |
| --- | --- | --- |
| Watch (MAINTENANCE dated takes) | `better-auth` successor bullet | **NEW bullet, this pass's F2 fix**: 1.6.30 routine take at age-in (08-24 ~19:11Z; registry re-verify, schema-diff incl. `@better-auth/core`, passkey lockstep); **1.7.x is plan → sign-off, not a routine take** (breaking minor; captcha-path + account-identity changes touch wired surfaces) |
| B1 | Restore Renovate PR delivery | Evidence refreshed (dashboard frozen since 07-22 · 66 outdated · 4th empty window); row text updated, priority unchanged (first in lane) |

**Owner-carry (dated, canonical in MAINTENANCE → Watch → dated takes):**
**2026-08-20 ~22:45Z** — `next` 16.3.1 ages in: plan → sign-off take with the
sharp-override retirement + postcss riders and the order-dependent verify.
**2026-08-24 ~19:11Z** — `better-auth` 1.6.30 ages in: routine take (re-verify
registry state first). **Mon 08-24** — the next Renovate window check; the B1
diagnosis (owner half at developer.mend.io) remains the root fix. **Unscheduled,
owner timing** — cut v1.2.0 after the 16.3.1 take lands (B3 row); the
better-auth 1.7 migration decision (plan first; no urgency — no advisory).

## Considered & excluded

- **Deducting for the better-auth 1.7 gap under Docs or Auth**: the drift was
  five days old, created by the ecosystem moving after a policy-correct take,
  found and fixed by this pass — the channel absence is F1's deduction, and
  double-counting it per-surface would grade the same defect twice.
- **A new row for the 1.7 migration itself**: it is a dated-take/plan-gate
  matter (MAINTENANCE), not a backlog build row — the repo's convention keeps
  dependency currency out of the banded table unless it needs real build work.
- **Scoring the `34f9483` cancelled CI run as a gate bypass**: it was a
  concurrency-group supersede; the commit's content was validated by the green
  run four minutes later. Not a process breach.
- **Certifying the e2e 20-green condition**: at 6 consecutive completed green
  runs it is one-third accrued; the condition self-resolves and both Watch
  entries carry unchanged.
- **A deduction for the stale `docs/adopt-wrapper-backlog-row` branch**: one
  parked docs branch, owner-tracked in memory with a resume instruction.
  Surfaced as INFO with a delete-or-keep call; not an adoption blocker.
- **Carried unchanged from 08-13**: Phase 6 Band 2 (owner-gated); guest
  reminders + inbound iTIP (owner-closed extension points); `main` branch
  protection (standing owner decision); knip's cosmetic `packages/ui` entry
  hint (one line in the next knip-touching change).

## Prioritization

Dated items lead; the band order is unchanged:

1. **2026-08-20 ~22:45Z — `next` 16.3.1** (plan → sign-off; riders: retire the
   `sharp: 0.35.3` override, re-check the postcss key's second condition;
   verification order: `next/image` optimization *before* the OG/icon routes).
2. **2026-08-24 ~19:11Z — `better-auth` 1.6.30** (routine; registry re-verify
   at take time; the leaf's widened schema-diff procedure + passkey lockstep).
3. **Renovate B1** (owner half): Mon 08-24 window check or start the Mend-side
   diagnosis — still the root fix for every currency finding this pass made.
4. **Kit half of the gate-clean B1 row** (edit a kit clone → re-install): the
   next kit reinstall stays red-risk until `install.mjs` emits gate-clean
   output.
5. **v1.2.0** (B3, owner timing): after the 16.3.1 take, per the row's own
   suggestion.

Within B2 the order carries (blank-grid 429 → localized reminders); B3 is
polish (README calendar currency first — the front door). Band order maps to
the backlog doc's B1 > B2 > B3 convention unchanged.
