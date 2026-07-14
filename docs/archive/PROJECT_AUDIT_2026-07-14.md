# Project Audit — 2026-07-14 (fourth scoring pass, post-close of everything)

> The `/project-audit` skill's fourth run, two days after the third
> ([PROJECT_AUDIT_2026-07-12B.md](PROJECT_AUDIT_2026-07-12B.md), **98.2/100**) and after
> every row that pass re-affirmed as score-lifting closed: the B2 uuid-cursor hardening
> and A32 (its two local rows), A13 cancel-on-delete, the **Fly.io real-host deploy**
> (proven live), the **Stripe Phase-5 live-verify** (test mode), and the **production
> email domain + deliverability** (hop-2 gap closed). **Method:** with the 07-12B pass's
> code verification two days old, this pass (a) ran the same day as the seventh
> doc-audit (commit `43257f7`), which re-read every doc + memory file and spot-checked
> ~20 drift-prone claims against code (commands, spec/template/coverage counts, dual
> stripe pins, CI job set, auth rate rules, `DB_POOL_MAX` ownership, `.claude/`
> contents); (b) enumerated the **exact code delta since the audited base**
> (`3dea8cb..HEAD` — 12 files, ~341 insertions) and read the full diff; (c) verified
> each close in code, not the docs' word; and (d) fresh-eyes-swept `fly.toml`, `env.ts`,
> the Stripe webhook route, and `proxy.ts`, plus targeted greps (apiVersion lockstep,
> remaining `toLocale*` call sites, new test files). CI is green on HEAD (run
> 29357991269: verify · audit · e2e · docker-image · visual). Same rubric and
> calibration as before: correctness & robustness (30) · completeness (25) · security
> (15) · performance (10) · testing (10) · docs & DX (10); graded against the best
> conceivable production starter today.
>
> **Headline: overall 99.3/100 (up from 98.2).** No correctness bugs. Every close is
> real in code. **Zero new backlog rows** — for the first time, an audit pass generated
> nothing: every remaining deduction maps to an already-filed gated/deferred row or a
> standing won't-fix. The three doc drifts found this day were found and fixed by the
> same-day doc-audit before this scoring pass. **Maintenance-only stands.**

## Close verification (code, not docs)

| Row | Verified in code |
| --- | --- |
| B2 uuid-cursor | `routers/post.ts` — `cursorSchema` is `z.object({ createdAt: z.date(), id: z.uuid() })`, exported and shared by `list`/`listMine`; pinned by the new `routers/post.test.ts` (accept-uuid + reject-non-uuid-at-the-boundary, with a `../trpc` stub so the pure-schema test skips the app-context module load). `routers/admin.ts` carries the comment-only note that its cursor deliberately stays `z.string()` (`user.id` is text). |
| A32 | `i18n/request.ts` returns `formats.dateTime.short` (`medium`+`short`) + a global `timeZone: "UTC"` (with the override guidance and the deferred-`now` note in-comment); `notifications-feed.tsx` renders `createdAt` via `useFormatter().dateTime(d, "short")`. Grep confirms the **six** remaining `toLocale*` display sites all sit on English-only pages by design (billing · passkeys-card · sessions-card · pending-invitations · post-item · uploads-list); the feed/request hits are comments and the send action's `toLocaleTimeString("en-US", …)` builds demo *body data* (not chrome) with a pinned locale. |
| A13 | `packages/auth/src/auth.ts` — `pendingStripeCancellations` Map (the `pendingUploadKeys` hand-off shape); `beforeDelete` captures non-terminal subscription ids (`notInArray(status, ["canceled","incomplete_expired"])`) in a graceful try/catch; `afterDelete` consumes the Map and enqueues only when ids exist. `packages/jobs` — `cancel-stripe-subscriptions` handler: strict Zod payload, env-gated (unconfigured → logged skip + complete, nothing to retry), pinned `apiVersion` **identical to `lib/stripe.ts`** (grep-verified), immediate-cancel + keep-customer policy with both one-line swaps documented, `StripeInvalidRequestError` → idempotent skip, any other error → throw → pg-boss retry. Registered in `worker.ts`; `stripe@22.2.2` pinned in `packages/jobs` identically to `apps/web` (manypkg-enforced). **Five** unit tests cover configured/unconfigured/idempotent-skip/retry-throw/invalid-payload. |
| Fly.io deploy | Committed root `fly.toml`: `docker/Dockerfile` build, `internal_port 3000`, `force_https`, **`auto_stop_machines "off"` + `min_machines_running 1`** with the SSE/LISTEN rationale in-comment, `/api/health` check with a 40s grace period mirroring the Dockerfile `HEALTHCHECK`, `shared-cpu-1x`/512 MB with an OOM note. Live proof recorded in VERIFICATION.md Phase 6 (the test Fly app: health 200 `database:up`, prod headers, sign-up → user row in managed Postgres). |
| Stripe Phase 5 · email domain | Doc-only closes (no `src` change — confirmed by the delta enumeration): the verification records are the dated banners in VERIFICATION.md Phase 5 / → Resend, cross-checked against the git history this pass. |

## Fresh-eyes sweep (clean)

`env.ts` matches DEPLOYMENT.md's env block var-for-var (and `DB_POOL_MAX` correctly
lives in `packages/db/src/client.ts`, not the app schema). The Stripe webhook route
still rate-limits before any crypto, reads the raw body, 503s unconfigured, 400s bad
signatures, and treats `invoice.payment_failed` via `invoice.parent.subscription_details`
with a retrieve-and-project (never a hardcoded status). `proxy.ts`'s metadata-segment
guard, locale-stripped gate, and locale-correct redirect targets are as documented.
The same-day doc-audit's ~20 spot checks (19 e2e specs · 8 templates · 25-module
coverage include · CI job set · auth customRules incl. admin caps · root scripts) all
matched.

## Score table

| # | Feature group | 07-12B | Now | Dominant deductions |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 100 | **100** | — |
| 2 | Framework & app architecture | 100 | **100** | — |
| 3 | Database | 100 | **100** | — |
| 4 | Auth & access control | 99 | **99** | Magic-link/email-OTP stays a recipe — won't-fix (−1) |
| 5 | API layer (tRPC + Actions) | 98 | **99** | B2 uuid-cursor closed (+1) · `updatePost` first-issue error shape — won't-fix (−1) |
| 6 | UI & design system | 100 | **100** | — |
| 7 | State & data fetching | 99 | **99** | `persist` unwired is deliberate — won't-fix (−1) |
| 8 | Forms & validation | 100 | **100** | — |
| 9 | Email | 96 | **99** | Domain + deliverability + hop-2 proof shipped (+3) · app-side bounce/complaint handling — **existing B3 row**, unplanned (−1) |
| 10 | Payments (Stripe) | 88 | **98** | Phase-5 live-verify closed (+8) · A13 shipped (+2) · per-org billing — documented deferral (−2) |
| 11 | File uploads | 98 | **98** | UT prod-callback needs a public URL — platform property, won't-fix (−2) |
| 12 | Search | 99 | **99** | Signed-in-user reindex — documented P1-2 decision, won't-fix (−1) |
| 13 | Background jobs | 99 | **99** | DLQ documented (A20) but not wired — recipe posture, won't-fix (−1). (A13 adds a fourth worked, tested handler — reinforces, no score change.) |
| 14 | Observability | 99 | **99** | OTel — standing exclusion (−1) |
| 15 | Security | 99 | **99** | Static-CSP `'unsafe-inline'` default — deliberate, verified nonce recipe ships (−1) |
| 16 | Testing & CI | 100 | **100** | — |
| 17 | Deployment & ops | 92 | **100** | Real-host deploy PROVEN on Fly.io + committed `fly.toml` + worked runbook (+8) |
| 18 | Docs & DX | 99 | **99** | The append-log regrew a 6th time and two real code↔doc drifts accumulated (2FA-issuer `SITE_NAME` phantom; stale two-element `plugins` literal) — all found + fixed same-day by doc-audit `43257f7` (−1 for the recurrence) |
| 19 | Internationalization | 98 | **99** | A32 closed (+1) · partial (primary-journey) coverage — deliberate, won't-fix (−1) |
| 20 | Realtime / SSE | 100 | **100** | — |
| | **Overall (mean)** | **98.2** | **99.3** | |

## Doc ↔ code drift

Found this day and **already fixed** by the same-day doc-audit (commit `43257f7`, CI
green) before this scoring pass:

1. AUTH.md claimed the 2FA `issuer` "defaults to `SITE_NAME`" — no such var exists
   anywhere; `twoFactorIssuer()` derives the hostname from `BETTER_AUTH_URL`.
2. AUTH.md still quoted `plugins: [haveIBeenPwned(), nextCookies()]` from before five
   more plugins landed (order is load-bearing per the conditional-spread tuple gotcha).
3. PROJECT_STATUS listed one committed `.claude/` skill; there are three.

Nothing further surfaced during this pass's code sweep.

## Backlog

**Zero new rows.** Every deduction above maps to an already-filed row or a standing
won't-fix:

- Email −1 → **existing B3 row** (app-side bounce/complaint handling; deferred
  2026-07-14 — present a plan first).
- Payments −2 → per-org billing, the documented Phase-5 org-aware deferral (BACKLOG's
  posture: build on real need).
- The externally-gated rows (Enable CodeQL — B1; TS7 cutover — B4) don't cost points:
  the workflow/watch entries ship complete and the gates are external.

## Considered and excluded (visible decisions)

- **All prior exclusions re-affirmed unchanged** (hosted realtime · notification
  preferences/digests · TanStack Table · OTel · per-account lockout · locale-routed
  authed sitemap/RTL/locale cookies · Stryker · blur placeholders/OG theming · console-
  error E2E lane · rate-limiting `markAllRead`).
- **Shared `STRIPE_API_VERSION` constant** (the literal now lives in `lib/stripe.ts` +
  the jobs handler, each with a keep-in-lockstep comment). Excluded: extracting it means
  a new cross-package export for one string; the manypkg-enforced identical `stripe` pin
  plus the paired comments already make drift loud, and the two clients are in different
  processes by design.
- **Continuous deploy on push-to-main** (e.g. `fly deploy` from CI). Excluded:
  host-dependent (the starter is deliberately platform-agnostic), needs deploy secrets
  in CI, and most forks pick their own target; the committed `fly.toml` + runbook is the
  right boilerplate boundary.
- **Deploying the jobs worker as a second Fly app** in the verified deploy. Excluded
  from the proof (documented as a follow-up in the runbook): the worker is optional by
  design — jobs queue harmlessly — and its image is already CI-built and compose-run.

## Won't-fix notes (deductions without backlog items)

Carried forward, all re-checked, all still the right call: magic-link recipe (Auth −1)
· `updatePost` error shape (API −1) · `persist` unwired (State −1) · UT prod-callback
(Uploads −2) · signed-in reindex (Search −1) · DLQ recipe posture (Jobs −1) · static
CSP (Security −1) · partial i18n coverage (i18n −1) · OTel (Observability −1).

## Prioritization statement

**Maintenance-only stands, now with an empty local tail.** For the first time there is
no unblocked, unbuilt row: the open set is exactly BACKLOG.md's three — **Enable
CodeQL** (externally gated on public/GHAS; near-zero effort when it lifts, strict
ordering: gate first, then the variable), **bounce/complaint handling** (deferred;
plan → sign-off when picked up), and **TS7 cutover** (gated on Next.js TS7 support,
~Q4 2026). The 0.7 points between 99.3 and 100 are one deferred email nicety, one
documented payments deferral, and nine standing won't-fixes — none of which should be
built speculatively. Bands in `BACKLOG.md` stay the single source of truth; this
report is the scoring record.
