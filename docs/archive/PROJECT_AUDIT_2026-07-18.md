# Project Audit — 2026-07-18 (ninth scoring pass — first maintenance-mode pass at 100)

> The `/project-audit` skill's ninth run: the first pass **inside** standing
> maintenance mode, verifying that the 100.0/100 state held through a
> docs-heavy window plus the first post-launch Renovate **major** wave. Prior
> pass: [PROJECT_AUDIT_2026-07-17.md](PROJECT_AUDIT_2026-07-17.md), **100.0/100**
> (plus its same-day addendum: 3 open CodeQL alerts missed by checking workflow
> conclusions instead of the alerts API — method fixed, applied below).
>
> **Method.** (a) **Git-bounding:** `git diff b5fab98..HEAD` (`d062ab34`) —
> **50 files, +4,306/−195 across 26 commits**. The product-code surface is
> small and fully re-verified this pass: the 3 CodeQL-alert fixes (`19eee69`),
> the Renovate major wave (`45e1617`→`c024b42`: six SHA-pinned action majors) +
> postgres 16→18 (`c1162e2`) + the required 18+ volume-path fix (`7fb4dcb`),
> `scripts/init-app.mjs` slim/U1 (+340 lines), and a `knip.jsonc` entry for the
> kit hooks. Everything else is docs (`plain-english-guide/` published, ai-dev-kit
> extraction, doc-audit passes 11–12) and committed `.claude/` installer output.
> **Untouched surfaces — all of `apps/web/src`, every workspace package except
> `packages/email`, all migrations — carry the 07-17 verified-100 findings by
> identity.** (b) **Changed-code verification** (see table notes). (c) **Live
> checks (alerts APIs queried directly, per the pass-8 addendum):** CI **and**
> CodeQL green on HEAD `d062ab3`; **0 open code-scanning alerts**; **0 open
> Dependabot alerts**; **0 untriaged issues/PRs** (only the Renovate dashboard
> issue); Renovate alive — **typescript-v7 is the sole pending-approval major
> (correctly held per the TS7 gate)** and ~36 minors await the Monday 2026-07-20
> schedule; the CI `audit` lane (pnpm audit) is green on HEAD, so the override
> trio still guards live. (d) **Currency & gates:** `next` latest **16.2.10**
> (16.3.0 still preview.6/canary.89 → **the TS7 gate stands**); `typescript`
> latest 7.0.2 with **7.1 still dev-tagged**; all three **override-removal
> conditions still unmet** (uploadthing 7.7.4 still pins `effect` 3.17.7 ·
> drizzle-kit still 0.31.10 · next 16.2.10 still pins postcss 8.4.31).
> Renovate's dashboard now also flags the `@react-email/components` deprecation
> (no replacement PR available) — the standing known non-issue, unchanged.
> Same rubric and calibration as passes 1–8.
>
> **Headline: overall 100.0/100 — the state held.** Zero new deductions from the
> changed surface; the major wave landed with conventions intact (every action
> bump kept the full-SHA pin + version comment; postgres 18 was proven on a
> fresh volume before merge and the 18+ mount-path break is fixed **and**
> documented with a consumer migration note in CHANGELOG). One drift item found
> — two in-code comments still saying `postgres:16` — recorded below as the one
> new backlog row (sub-point nit; scores unchanged, pass-8-addendum precedent).

## Score table

| # | Feature group | 07-17 | Now | This pass's basis |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 100 | **100** | `knip.jsonc` gains a root `entry` for the kit hook scripts (correct: stdin/stdout handlers invisible to the import graph); audit lane green on HEAD |
| 2 | Framework & app architecture | 100 | **100** | Byte-identical — carries |
| 3 | Database | 100 | **100** | Schema/migrations byte-identical; local Postgres now 18 (fresh-volume proof + migrations green before merge) |
| 4 | Auth & access control | 100 | **100** | Byte-identical — carries |
| 5 | API layer (tRPC + Actions) | 100 | **100** | Byte-identical — carries |
| 6 | UI & design system | 100 | **100** | Byte-identical — carries |
| 7 | State & data fetching | 100 | **100** | Byte-identical — carries |
| 8 | Forms & validation | 100 | **100** | Byte-identical — carries |
| 9 | Email | 100 | **100** | `send.tsx` suppression-warn fix verified: `options.to` is now a `%s` format **arg**, never part of the format string (js/tainted-format-string closed); `send.test.tsx` pins the convention |
| 10 | Payments (Stripe) | 100 | **100** | Product code byte-identical; `billing-org.spec.ts` assertion hardened (parsed-hostname check replaces `includes("stripe.com")`) |
| 11 | File uploads | 100 | **100** | Byte-identical — carries |
| 12 | Search | 100 | **100** | Byte-identical — carries |
| 13 | Background jobs | 100 | **100** | Byte-identical (one stale comment — see Drift) |
| 14 | Observability | 100 | **100** | Byte-identical — carries |
| 15 | Security | 100 | **100** | All 3 CodeQL alerts fixed in code exactly as the addendum recorded; **0 open alerts via the alerts API**; codeql-action v4 landed SHA-pinned |
| 16 | Testing & CI | 100 | **100** | Six action majors merged with the SHA-pin convention intact; e2e/CSP-nonce/docker lanes on `postgres:18`; 25 spec files (count re-verified); `csp-nonce.spec.ts` regex now case-insensitive |
| 17 | Deployment & ops | 100 | **100** | Both compose files on `postgres:18-alpine` with the 18+ volume mount at `/var/lib/postgresql` + in-file rationale comment (docker-library/postgres#1259); CHANGELOG carries the existing-volume migration note; docker-image lane green |
| 18 | Docs & DX | 100 | **100** | Consumer surface grew: `plain-english-guide/` (12 chapters + deck) published and indexed from README/docs-README/AGENTS; `init-app --slim` + `/project-init` on-ramp documented in GETTING_STARTED; status/backlog/AGENTS all reflect maintenance mode. One drift nit (below) — sub-point, backlogged |
| 19 | Internationalization | 100 | **100** | Byte-identical — carries |
| 20 | Realtime / SSE | 100 | **100** | Byte-identical — carries |
| | **Overall (mean)** | **100.0** | **100.0** | |

## Drift findings

1. **Two in-code comments still say `postgres:16`** —
   [`packages/db/vitest.config.ts:6`](../../packages/db/vitest.config.ts) and
   [`packages/jobs/vitest.integration.config.ts:5`](../../packages/jobs/vitest.integration.config.ts)
   ("the E2E CI lane which provisions a `postgres:16` service"). The 2026-07-18
   postgres-18 merge updated the workflows, both compose files, and every
   `docs/` mention (TESTING.md, DEPLOYMENT.md), but missed these two comments
   living in code files. Current-state claims, now wrong → **drift**. Because
   the fix touches product-code files, this audit (docs-only by contract)
   records it as backlog row **M-1** instead of fixing inline. Magnitude is
   sub-point (two comment lines; every actual config value is correct), so
   scores are unchanged — same treatment the pass-8 addendum gave its nits.
   `PHASE_HISTORY.md`'s `postgres:16` mentions are dated build records, not
   drift.

Nothing else: every other spot-checked claim in the changed docs proved true
against code (compose mount path, CI service images, the `/project-init` and
`--slim` behaviors match `scripts/init-app.mjs`, the MAINTENANCE watch-item
list matches BACKLOG, the plain-english guide's PostgreSQL-18 aside is current).

## Findings

1. **The first Renovate major wave landed cleanly, conventions intact.** All six
   action bumps kept the full-40-char SHA pin + human-readable version comment
   (the P1-5 convention survived automation). The postgres 16→18 bump was *not*
   merged blind: the 18+ image's refusal of the legacy `/data` mount was caught
   by a local fresh-volume proof, fixed in both compose files with an in-file
   rationale comment, and turned into a consumer-facing migration note in
   CHANGELOG. This is exactly the maintenance-mode behavior the docs promise.
2. **The pass-8 addendum's method fix is now standing practice and pays off:**
   this pass queried `code-scanning/alerts?state=open` and
   `dependabot/alerts?state=open` directly — both 0 — rather than trusting green
   workflow conclusions. The 3 alerts the addendum owned are verified fixed in
   code (literal `%s` format string in `send.tsx` with a test pinning it; `/i`
   on the script-tag regex; parsed-hostname Stripe check).
3. **The consumer on-ramp deepened without touching product code:** the
   plain-english guide is now public and linked from all three doc indexes;
   `init-app --slim` gives derived apps a one-command template-history removal
   with an honest per-line leftover report; `/project-init` is documented in
   README + GETTING_STARTED as optional ("everything below works exactly the
   same without it") — graceful degradation applied to DX.
4. **Currency: nothing re-opened.** TS7 gate stands (16.3.0 still
   preview/canary; 7.1 still dev-tagged); all three override-removal conditions
   unmet; typescript-v7 is the only pending-approval Renovate major — the hold
   the docs prescribe is the hold actually in effect. The ~36-minor Monday batch
   is the next owner touchpoint.

## Backlog

**One new row** (the first since 2026-07-15, breaking a five-pass zero streak —
on a comment nit):

| Band | Area | Item | Fixes | Lifts | Effort |
| --- | --- | --- | --- | --- | --- |
| B1 | Docs-in-code | **M-1: update the two stale `postgres:16` comments** in `packages/db/vitest.config.ts` + `packages/jobs/vitest.integration.config.ts` to `postgres:18` | The last two references to the pre-2026-07-18 CI service version | Docs & DX (sub-point hygiene; no score movement) | S (two comment lines; ride it on any next code-touching change) |

Open set otherwise unchanged: the **TypeScript 7 cutover** (B4, externally
gated, costs no points).

**Owner-side (not backlog):** Monday 2026-07-20 — the scheduled ~36-minor
Renovate batch, triage per PR at open time; keep holding typescript-v7. The
local-only stale `@example.com` e2e-user cleanup remains the one standing
local-hygiene item.

## Considered and excluded (visible decisions)

- **All prior exclusions re-affirmed** (incl. the four advised-against
  PATH_TO_100 rows and pass-8's `lib/csp.ts` unit-test exclusion).
- **Automated tests for `scripts/init-app.mjs`.** The slim path is now ~340
  lines of self-mutating scaffold logic — but it's a run-once, interactive,
  git-recoverable on-ramp script, scratch-verified end-to-end twice (fresh run ·
  patched content · idempotent re-run) plus once more via the Potluck trial. A
  test harness that scaffolds a throwaway repo per run adds real maintenance for
  a script whose failure mode is visible and reversible. Excluded; revisit only
  if slim regressions actually recur.
- **Scoring the `.claude/` kit output as a product group.** It's committed
  installer output with its own upstream repo, CI, and drift guard
  (`install.mjs --check`); its quality is the kit repo's concern. The one
  repo-side seam (knip entries, settings merge) was verified here.
- **Preempting the awaiting-schedule Renovate minors.** Same reasoning as
  passes 7–8: dashboard/schedule is the configured posture; Monday's batch with
  CI as judge is the process.

## Won't-fix notes

**None.** The ledger stays empty.

## Prioritization statement

**100.0/100 held through the first maintenance-mode window — maintenance-only
remains the standing state.** Near-term calendar: **2026-07-20** (the ~36-minor
Renovate batch; typescript-v7 stays held), the **three override-removal
conditions** (uploadthing→effect ≥3.20 · next→postcss ≥8.5.10 · drizzle-kit
drops `@esbuild-kit`), the **TS7 stable-Next watch**, and the trivial **M-1**
comment fix riding the next code touch. Bands in `BACKLOG.md` remain the single
source of truth; this report is the scoring record.
