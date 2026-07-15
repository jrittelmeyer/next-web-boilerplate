# Project Audit — 2026-07-15 (sixth scoring pass, currency & public-surface)

> The `/project-audit` skill's sixth run — the first under the skill's **upgraded
> procedure** (upgraded earlier the same session, commit `afb8072`): git-bounding is now
> mandatory, and two new check classes are permanent — the **public/consumer surface**
> (on-ramp truth, community files, automation actually alive) and **goals & gates**
> (stated-goal alignment + re-checking externally-gated watch rows, because currency
> counts even on a byte-identical tree). Those checks institutionalize what the fifth
> pass ([PROJECT_AUDIT_2026-07-14B.md](PROJECT_AUDIT_2026-07-14B.md), **99.3/100**)
> improvised ad hoc; the trigger was a goals-vs-intentions review: post-launch, the
> repo's success axis shifted from internal build quality to **external viability**
> (consumer first-run success · staying current · automation staying alive), and the
> construction-era audits never gauged that axis systematically.
>
> **Method.** (a) **Git-bounding:** `git diff 01ca6c3..HEAD` (the fifth-pass sha →
> this pass) touches only `docs/**` and `.claude/**` — **zero product-code changes**.
> Product code therefore remains byte-identical to the 99.3-verified tree through two
> proven chains (pass 5 proved `main` ≡ the private 99.3 tree; nothing but doc commits
> since), so **every per-group finding carries by identity** and this pass spends its
> effort on what time alone can invalidate. The doc commits in the window (`2588874`
> checkpoint-skill alignment · `c303f62` CI-watch/Renovate drift fixes · `2283938`
> Mend Silent-mode note · `afb8072` this session's doc-audit) each trace to
> live-verified facts. (b) **Currency & gates (live, this session):** npm registry via
> `pnpm view` — `next` latest `16.2.10` (the repo's `^16.2.9` covers it; current),
> `typescript` latest `7.0.2` with 7.1 still dev-tagged; **the TS7 upstream gate
> moved** — vercel/next.js#95490 closed *completed* 2026-07-10 (PR #95639: canary
> detects TS7, offers `experimental.useTypeScriptCli`; auto-detect planned before
> stable) — found by the same-session doc-audit and fixed across
> BACKLOG/STACK/MAINTENANCE/PROJECT_STATUS in `afb8072`; Node 24 Active-LTS claim
> holds. (c) **Public surface (live):** repo PUBLIC, `is_template: true`, 7 topics;
> CI **and** CodeQL green on the latest pushed commits; **Renovate alive, not just
> configured** — Dependency Dashboard is issue #1, update PRs Monday-scheduled (first
> batch expected 2026-07-20, so none yet is healthy, not dormant); **zero untriaged
> issues/PRs**; badges/community files verified at pass 5 and untouched since.
> (d) **Goals:** the README's stated goal (production-ready public template,
> maintenance mode) matches what the repo is; the identified axis shift was encoded
> into the audit skills rather than left as a finding. Same rubric and calibration as
> passes 1–5.
>
> **Headline: overall 99.3/100 (unchanged).** No correctness bugs (code byte-identical
> to the verified tree). **One currency drift found (TS7 gate moved upstream) + one
> broken relative link (STACK.md → BACKLOG.md), both fixed pre-report in `afb8072`.
> Zero new backlog rows — the third consecutive pass to generate nothing.
> Maintenance-only stands.**

## Score table

| # | Feature group | 07-14B | Now | Dominant deductions |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 100 | **100** | — |
| 2 | Framework & app architecture | 100 | **100** | — |
| 3 | Database | 100 | **100** | — |
| 4 | Auth & access control | 99 | **99** | Magic-link/email-OTP stays a recipe — won't-fix (−1) |
| 5 | API layer (tRPC + Actions) | 99 | **99** | `updatePost` first-issue error shape — won't-fix (−1) |
| 6 | UI & design system | 100 | **100** | — |
| 7 | State & data fetching | 99 | **99** | `persist` unwired is deliberate — won't-fix (−1) |
| 8 | Forms & validation | 100 | **100** | — |
| 9 | Email | 99 | **99** | App-side bounce/complaint handling — existing B3 row, deferred (−1) |
| 10 | Payments (Stripe) | 98 | **98** | Per-org billing — documented deferral (−2) |
| 11 | File uploads | 98 | **98** | UT prod-callback needs a public URL — platform property, won't-fix (−2) |
| 12 | Search | 99 | **99** | Signed-in-user reindex — documented P1-2 decision, won't-fix (−1) |
| 13 | Background jobs | 99 | **99** | DLQ documented (A20) but not wired — recipe posture, won't-fix (−1) |
| 14 | Observability | 99 | **99** | OTel — standing exclusion (−1) |
| 15 | Security | 99 | **99** | Static-CSP `'unsafe-inline'` default — deliberate, verified nonce recipe ships (−1) |
| 16 | Testing & CI | 100 | **100** | — |
| 17 | Deployment & ops | 100 | **100** | — |
| 18 | Docs & DX | 99 | **99** | One currency drift (TS7 gate, 07-10→07-15 stale window) + one broken link — found + fixed this pass (−1) |
| 19 | Internationalization | 99 | **99** | Partial (primary-journey) coverage — deliberate, won't-fix (−1) |
| 20 | Realtime / SSE | 100 | **100** | — |
| | **Overall (mean)** | **99.3** | **99.3** | |

## Findings

1. **Currency drift (the new check's first catch): the TS7 gate moved.** Next.js merged
   experimental TS7 support into canary 2026-07-10 (PR #95639 —
   `experimental.useTypeScriptCli`; the tracking issue #95490 the docs pointed at is
   closed *completed*). Four docs + a memory described the issue as the open gate.
   **Fixed in `afb8072`**: the re-gate is now "TS7 support reaching a **stable** Next
   release" — potentially ahead of TS 7.1, since Next now shells to the CLI instead of
   needing the JS Compiler API. The cutover stays blocked today (canary + experimental
   ≠ adoptable under this repo's discipline).
2. **Broken relative link**: `docs/context/STACK.md` linked `BACKLOG.md` bare (resolves
   to the nonexistent `docs/context/BACKLOG.md`); every sibling doc correctly uses
   `../BACKLOG.md`. Fixed in `afb8072`; a sweep found no other instance.
3. **Public surface healthy**: CI + CodeQL green, Renovate live (dashboard = issue #1),
   zero untriaged issues/PRs, template flag + topics on. First Renovate update PRs are
   expected Monday 2026-07-20 per the committed schedule — check them then.
4. **Goals**: no goal drift — the repo is what the README claims. The post-launch
   success-axis shift (external viability) is now permanently encoded in the audit
   skills (`.claude/skills/project-audit/SKILL.md` §1; the operator-side doc-audit
   skill gained the matching currency/outward-facing class).

## Backlog

**Zero new rows** (third consecutive pass). The open set remains
[BACKLOG.md](../BACKLOG.md)'s two: **email bounce/complaint handling** (B3, deferred by
choice — no external gate) and the **TypeScript 7 cutover** (B4, gate refined this
pass: stable-Next TS7 support, experimental-in-canary since 2026-07-10). Every
deduction above maps to one of those or a standing won't-fix.

**Owner-side (unchanged):** PayPal/FUNDING restoration when the account exists;
`CODECOV_TOKEN` decided SKIP 2026-07-14.

## Considered and excluded (visible decisions)

- **All prior exclusions re-affirmed unchanged** (see the 07-14B report's list — code
  and ecosystem position identical for all of them).
- **Bumping `next` to 16.2.10 / adopting canary TS7 support now.** Excluded: the caret
  already admits 16.2.10 (Renovate will propose it on schedule), and canary +
  experimental flags fail the repo's own stability discipline — the refined BACKLOG
  gate is the correct posture.
- **A scheduled "currency check" CI job** (auto-probing upstream gates like #95633).
  Excluded: the audit cadence + Renovate already cover it at the right frequency; a CI
  probe of external issue-states is flaky by design and would false-red forks.

## Won't-fix notes

Carried verbatim from the fifth pass (all still the right call): magic-link recipe
(Auth −1) · `updatePost` error shape (API −1) · `persist` unwired (State −1) · UT
prod-callback (Uploads −2) · signed-in reindex (Search −1) · DLQ recipe posture
(Jobs −1) · static CSP (Security −1) · partial i18n coverage (i18n −1) · OTel
(Observability −1) · per-org billing (Payments −2).

## Prioritization statement

**Maintenance-only stands.** Product code is provably the 99.3-verified tree; the
published claims are audit-verified and currency-corrected; the public surface and
dependency automation are alive. There is still no unblocked, unbuilt row. The
near-term calendar items are external: **2026-07-20** (first scheduled Renovate PRs —
merge per MAINTENANCE policy) and the **TS7 stable-Next watch** (re-attempt the
cutover when `useTypeScriptCli`/auto-detect ships stable). Bands in `BACKLOG.md`
remain the single source of truth; this report is the scoring record.
