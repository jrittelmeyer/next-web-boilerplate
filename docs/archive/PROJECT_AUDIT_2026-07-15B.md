# Project Audit — 2026-07-15B (seventh scoring pass, same-day delta)

> The `/project-audit` skill's seventh run, hours after the sixth
> ([PROJECT_AUDIT_2026-07-15.md](PROJECT_AUDIT_2026-07-15.md), **99.3/100**). Run
> because the tree moved the same day: three commits landed after the sixth pass's
> sha, one of which is the first **dependency-graph change** since launch.
>
> **Method.** (a) **Git-bounding:** `git diff 2fd6b80..HEAD` touches 11 files across
> three commits — `5ef1917` (donation link: `.github/FUNDING.yml` + README),
> `d5fbd23` (**pnpm `overrides:` trio** remediating 3 transitive Dependabot alerts —
> `pnpm-workspace.yaml` + lockfile), `9a06dde` (doc-audit pass 9 sweep). **No
> `apps/**`, `packages/**`, `tooling/**`, `docker/**`, or workflow file changed**, so
> every product-code finding carries by identity from the 99.3-verified tree; this
> pass verifies the three commits' claims live plus the standing time-alone checks.
> (b) **The override commit, proven end-to-end (live):** CI **and** CodeQL green on
> all three new commits; GitHub Dependabot shows **0 open / 3 fixed** (all marked
> fixed at the override commit's push, 22:27Z); local
> `pnpm audit --audit-level high --ignore-registry-errors` → `No known
> vulnerabilities found`, exit 0 (matches the updated VERIFICATION.md box verbatim);
> lockfile resolutions confirmed by inspection — `effect@3.21.4` everywhere,
> a **single** `postcss@8.5.15` in the whole tree (the ranged override deduped), and
> `esbuild: 0.25.12` under `@esbuild-kit/core-utils` with `drizzle-kit@0.31.10`
> confirmed as the `@esbuild-kit` parent; the age-gate claim holds (`effect@3.21.4`
> published 2026-06-18, > 7 days). `ignoreGhsas` is empty, so the audit now guards
> the overrides live — regression turns CI red. (c) **Funding surface (live):**
> GraphQL `fundingLinks` returns the CUSTOM PayPal entry (FUNDING.yml parsed +
> sponsorships enabled), the Sponsor control renders on the repo page, and
> `paypal.me/JohnRittelmeyerDev` resolves 200. The standing owner-side gate
> ("donation link when the PayPal account exists") is **resolved**. (d) **Doc-audit
> commit spot-checks:** DATABASE.md's corrected `drizzle/migrations/` path matches
> the real tree; the `@esbuild-kit`-parent correction (drizzle-kit, **not**
> dotenv-cli) matches the lockfile; the new
> `MAINTENANCE.md#watch-items-…` anchor matches the actual heading; STACK/DEPLOYMENT
> relative links resolve. (e) **Currency & gates (live):** `next` latest **16.2.10**
> (16.3.0 still preview/canary — the TS7 gate is unchanged, stays B4); `typescript`
> latest 7.0.2 with 7.1 still dev-tagged; Renovate Dependency Dashboard alive
> (deprecation table + **6 pending-approval major GH-Actions updates** + the
> Monday-scheduled batch); **zero untriaged issues/PRs**. Same rubric and
> calibration as passes 1–6.
>
> **Headline: overall 99.35/100 (up from 99.3).** **Zero drift found — the first
> pass with none**: every checkable claim in the three new commits proved true live.
> Docs & DX moves 99 → **100** — its deduction in passes 5 and 6 was fresh drift
> found *that pass*, and this pass found none (caveat: an hours-long window is a
> weak test of staleness; the next longer-window pass is the real one). Zero new
> backlog rows — the fourth consecutive pass. Maintenance-only stands.

## Score table

| # | Feature group | 07-15 | Now | Dominant deductions |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 100 | **100** | — (override trio lives in `pnpm-workspace.yaml` with removal conditions; audit guards it live) |
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
| 15 | Security | 99 | **99** | Static-CSP `'unsafe-inline'` default — deliberate, verified nonce recipe ships (−1). Supply-chain posture *improved* this window: 3 known-vulnerable transitives eliminated, allowlist emptied, audit guards live. |
| 16 | Testing & CI | 100 | **100** | — |
| 17 | Deployment & ops | 100 | **100** | — |
| 18 | Docs & DX | 99 | **100** | Zero drift found (first pass with none); prior −1 was per-pass drift, basis absent. Short-window caveat noted above. |
| 19 | Internationalization | 99 | **99** | Partial (primary-journey) coverage — deliberate, won't-fix (−1) |
| 20 | Realtime / SSE | 100 | **100** | — |
| | **Overall (mean)** | **99.3** | **99.35** | |

## Findings

1. **The Dependabot remediation is real, not just claimed.** All three alerts show
   `state: fixed` on GitHub (timestamped at the override commit's push), the local
   audit is clean with an **empty** allowlist, and the lockfile resolutions match
   each override's comment — including the subtle ones (the ranged `postcss@<8.5.10`
   key deduped the tree onto the already-present 8.5.15; the child-scoped esbuild
   override left the healthy 0.25.12/0.28.1 copies untouched). The design choice to
   *empty* `ignoreGhsas` rather than keep stale ignores means `pnpm audit` now
   fails red if any override regresses — the overrides are self-guarding.
2. **Funding surface live end-to-end** — FUNDING.yml parsed by GitHub (GraphQL
   confirms), Sponsor control rendering, PayPal.Me resolving 200. The last
   owner-side deferral from the launch ("donation link when PayPal exists") closes.
3. **Zero doc drift — a first.** Passes 5 and 6 each caught fresh drift; this pass
   verified every changed claim (audit box text, alert states, paths, anchors,
   lockfile parents, release dates) and found all true. The same-day doc-audit
   passes 8/9 deserve the credit; the honest caveat is the short window.
4. **Renovate has 6 major GH-Actions updates pending dashboard approval**
   (checkout v7 · setup-node v6 · upload-artifact v7 · codecov-action v7 ·
   codeql-action v4 · pnpm/action-setup v6) plus the Monday 2026-07-20 scheduled
   batch. Majors-behind-approval is the configured posture, not a fault — but the
   approvals are now a concrete owner action for the Monday flow.
5. **TS7 gate unchanged** since the sixth pass (16.3.0 still preview/canary;
   TS 7.1 still dev-tagged). B4 row stands as written.

## Backlog

**Zero new rows** (fourth consecutive pass). The open set remains
[BACKLOG.md](../BACKLOG.md)'s two — **email bounce/complaint handling** (B3) and the
**TypeScript 7 cutover** (B4) — plus the three **override-removal watch conditions**
added this window (already tracked in MAINTENANCE.md → Watch items; not new rows).
Every deduction above maps to one of those or a standing won't-fix.

**Owner-side:** the PayPal/FUNDING item is **done** (this window). `CODECOV_TOKEN`
remains decided-SKIP. **New owner calendar item:** Monday 2026-07-20 — merge the
scheduled Renovate batch *and* decide the 6 pending-approval majors.

## Considered and excluded (visible decisions)

- **All prior exclusions re-affirmed unchanged** (see the 07-14B list; code position
  identical, ecosystem position re-checked above).
- **Approving the 6 pending Renovate majors from this audit.** Excluded: the
  dashboard-approval gate on majors is the deliberate config; batching them into the
  Monday flow with CI as the judge is the documented process. This audit's job was
  to confirm the automation is alive (it is), not to preempt it.
- **Scoring Security up for the remediation.** Excluded: the allowlisted advisories
  were already assessed no-runtime-exposure in prior passes (the −1 there is the CSP
  default, unrelated). The remediation hardens posture and simplifies the story but
  doesn't recover a named deduction.

## Won't-fix notes

Carried verbatim from the sixth pass (all still the right call): magic-link recipe
(Auth −1) · `updatePost` error shape (API −1) · `persist` unwired (State −1) · UT
prod-callback (Uploads −2) · signed-in reindex (Search −1) · DLQ recipe posture
(Jobs −1) · static CSP (Security −1) · partial i18n coverage (i18n −1) · OTel
(Observability −1) · per-org billing (Payments −2).

## Prioritization statement

**Maintenance-only stands.** The only product-affecting change since the verified
tree — the override trio — is proven correct at every layer (lockfile, local audit,
CI, GitHub alert states) and is self-guarding + removal-tracked. The public surface
gained its last deferred piece (funding) and everything on it is verified alive.
Near-term calendar: **2026-07-20** (Renovate batch + the 6 pending majors), the
**three override-removal conditions** (uploadthing→effect ≥3.20 · next→postcss
≥8.5.10 · drizzle-kit drops `@esbuild-kit`), and the **TS7 stable-Next watch**.
Bands in `BACKLOG.md` remain the single source of truth; this report is the scoring
record.
