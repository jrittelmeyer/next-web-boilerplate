# Project Audit — 2026-07-17 (eighth scoring pass — the path-to-100 verification)

> The `/project-audit` skill's eighth run: the scoring pass that verifies the
> **path-to-100 program** ([PATH_TO_100_2026-07-15.md](PATH_TO_100_2026-07-15.md) —
> 11 rows recovering the 13 points locked behind won't-fix/deferred
> classifications). Prior pass: [PROJECT_AUDIT_2026-07-15B.md](PROJECT_AUDIT_2026-07-15B.md),
> **99.35/100**.
>
> **Method.** (a) **Git-bounding:** `git diff c45797c..HEAD` — **153 files,
> +9,579/−1,331 across 15 commits** = the 11 program rows (`e58ca6b` → `3396b30`),
> the program charter (`a7f7a6b`), doc-audit pass 10 (`aed0bab`), and the #4b
> closure (`b5fab98`). Unlike passes 6–7 this window is NOT docs-only — every
> program row was re-verified in code this pass; untouched surfaces carry from the
> 99.35 tree by identity. (b) **Per-row code verification** (all 11 confirmed —
> see the table). (c) **Live checks:** CI **and** CodeQL green on HEAD
> (`b5fab98`); `pnpm audit --audit-level high` → clean, exit 0 (the override trio
> still guards); **0 open Dependabot alerts**; **0 untriaged issues/PRs** (only
> the Renovate dashboard); funding surface confirmed via GraphQL (`fundingLinks`
> + `hasSponsorshipsEnabled` + `isTemplate` all true); en/es catalogs re-compared
> live — **491/491 keys, identical trees**. (d) **Currency & gates:** `next`
> latest **16.2.10** (16.3.0 still preview/canary → the TS7 gate stands, B4);
> `typescript` latest 7.0.2 with 7.1 still dev-tagged; all three
> **override-removal conditions still unmet** (uploadthing 7.7.4 still pins
> `effect` 3.17.7 · drizzle-kit 0.31.10 unchanged · next 16.2.10 still pins
> postcss 8.4.31); Renovate alive — the Monday 2026-07-20 batch queued plus
> **eight** pending-approval majors (typescript v7 and postgres-18 joined the
> six). (e) The program's **honesty clauses** applied: each row checked for newly
> minted deductions (tests, docs, perf posture, graceful degradation) — none
> found. Same rubric and calibration as passes 1–7.
>
> **Headline: overall 100.0/100.** All 13 re-litigated points are **recovered and
> verified**. Zero drift across a 153-file window — the long-window staleness test
> pass 7 couldn't provide. Zero new backlog rows (fifth consecutive pass). The
> PATH_TO_100 contingency ("each row ships without minting new deductions and
> currency stays green") **held on both halves**. Maintenance-only resumes.

## Score table

| # | Feature group | 07-15B | Now | What recovered it (verified in code this pass) |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 100 | **100** | — (audit clean, exit 0; overrides guarded live) |
| 2 | Framework & app architecture | 100 | **100** | — (`CSP_MODE` is build-time-resolved in `next.config.ts`; default mode byte-identical, `cacheComponents` preserved) |
| 3 | Database | 100 | **100** | — (migrations 0016/0017 verified: `email_suppressions` + the `num_nonnulls` XOR check with both FK indexes) |
| 4 | Auth & access control | 99 | **100** | #6 — `magicLink()` env-gated on `isEmailConfigured()` in the safe tuple position (`auth.ts:551`); capture-seam e2e + live send proof |
| 5 | API layer (tRPC + Actions) | 99 | **100** | #1 — `updatePost` ships `zodFieldErrors` (`post.ts:182`); both forms map inline via the shared `FieldActionError` |
| 6 | UI & design system | 100 | **100** | — |
| 7 | State & data fetching | 99 | **100** | #2 — `ui-store` persists hydration-safely (`partialize` + `skipHydration` + `<StoreRehydration/>` at `layout.tsx:124`); unit tests + `state.spec.ts` |
| 8 | Forms & validation | 100 | **100** | — |
| 9 | Email | 99 | **100** | #8 — signature-verified `/api/resend/webhook` (rate-limited before crypto) → `email_suppressions` → `send.tsx:101` consults `isEmailSuppressed()` |
| 10 | Payments (Stripe) | 98 | **100** | #11 — XOR-owned `subscriptions` (org rows carry NO `user_id` by design); owner/admin gate before the config gate (`billing.ts:93` → `:97`); webhook `metadata.organizationId` mapping; org-delete → A13 cancel via `organizationHooks` (`auth.ts:445`); live-verified + keyless `billing-org.spec.ts` |
| 11 | File uploads | 98 | **100** | #4 — `uploads.spec.ts` (the last zero-e2e integration) + the prod-callback tunnel proof **run live 2026-07-17** (dated box in VERIFICATION.md) |
| 12 | Search | 99 | **100** | #5 — `reindexPosts` gated on `requireAdmin()` (`post.ts:302`); `/search` resolves the same check server-side (`page.tsx:25`) |
| 13 | Background jobs | 99 | **100** | #3 — every queue created AND `updateQueue`-converged with `deadLetter: "failed-jobs"` (`worker.ts:42–43`); watched consumer + integration test on real Postgres |
| 14 | Observability | 99 | **100** | #9 — `buildOtelSpanProcessors()` gated on `OTEL_EXPORTER_OTLP_ENDPOINT`, riding Sentry's own provider via `openTelemetrySpanProcessors` (`sentry.server.config.ts:15`); unset = `[]` = prior behavior |
| 15 | Security | 99 | **100** | #10 — `CSP_MODE=nonce` first-class: shared directive list (`lib/csp.ts`) feeds the static header AND the proxy's per-request `'nonce-…' 'strict-dynamic'` CSP (`proxy.ts:106–110`); `csp-nonce.spec.ts` matrix in the `ENABLE_CSP_NONCE` lane (ON here); default static CSP byte-identical |
| 16 | Testing & CI | 100 | **100** | — (e2e surface grew to **25 spec files** — six new: uploads · state · magic-link · email-suppression · csp-nonce · billing-org; coverage include-list picked up `lib/otel.ts` + `stores/ui-store.ts`) |
| 17 | Deployment & ops | 100 | **100** | — |
| 18 | Docs & DX | 100 | **100** | Zero drift across 153 changed files — every spot-checked claim (paths, line refs, gates, counts, dated proof boxes) proved true; FEATURES.md covers all six new features |
| 19 | Internationalization | 99 | **100** | #7 — full-surface en/es coverage; key trees re-verified identical live (491/491; 485 at #7's ship, grown by later rows) |
| 20 | Realtime / SSE | 100 | **100** | — |
| | **Overall (mean)** | **99.35** | **100.0** | |

## Findings

1. **The program is real end-to-end, not just claimed.** All 11 rows verified in
   code at the exact seams their docs name: the XOR ownership check exists in both
   schema and migration SQL; the billing role-gate genuinely precedes the config
   gate; the webhook maps `metadata.organizationId`; the DLQ converges
   pre-existing queues; the OTel processors ride Sentry's provider (no second
   provider anywhere); the nonce proxy mints per-request and the default build's
   header path is untouched. Every graceful-degradation claim holds structurally
   (new env vars `RESEND_WEBHOOK_SECRET` / `OTEL_EXPORTER_OTLP_ENDPOINT` are
   optional; keyless CI is green, which exercises exactly that posture).
2. **Zero drift on the first long-window, high-churn test.** Pass 7's "zero
   drift" came with an hours-window caveat; this pass covered a 153-file program
   window and still found none. Nearest miss: PROJECT_STATUS's #7 row said
   "485-key trees" — true at ship, 491 today after later rows added keys
   (trees still identical). Clarified in place; not counted as drift (a dated
   build-record, not a current-state claim).
3. **The live proofs are dated and specific.** VERIFICATION.md carries fresh
   dated boxes for the #4b tunnel proof (2026-07-17, cloudflared → prod :3000 →
   callback → row → delete sweep), the #11 org-billing matrix (2026-07-17), and
   the #10 nonce matrix (2026-07-17, byte-identical default + runtime-override
   no-op). Uploads' former "platform property" deduction is closed the same way
   Stripe's was — by a worked, proven runbook.
4. **Currency: nothing re-opened.** TS7 gate unchanged (16.3.0 still
   preview/canary; TS 7.1 still dev-tagged); all three override-removal
   conditions still unmet; 0 open alerts; audit clean. The ecosystem did move
   under Renovate: **eight** majors now pending dashboard approval (typescript v7
   and postgres-18 Docker tag joined the six) — the typescript-v7 PR should stay
   unapproved while the TS7 gate stands.
5. **The scoring math from PATH_TO_100 lands exactly:** 1987/2000 + 13 recovered
   = 2000/2000. Honesty clause 1 stands: **100 is a state to maintain, not a
   trophy** — future passes re-run currency checks and can re-open deductions as
   the bar ("best available today") moves.

## Backlog

**Zero new rows** (fifth consecutive pass). The open set is now exactly one row:
the **TypeScript 7 cutover** (B4, externally gated on stable-Next TS7 support,
costs no points). The won't-fix ledger that consumed 13 points across passes 1–7
is **empty**.

**Owner-side:** Monday 2026-07-20 — merge the scheduled Renovate batch and decide
the **8** pending-approval majors (approve the GH-Actions six at will; **hold
typescript v7** per the TS7 gate; postgres-18 at leisure). Local-only: the stale
`@example.com` e2e-user cleanup (the mass DELETE needs an explicit owner OK)
remains the one standing local-hygiene item — it affects a local-only spec walk,
not the repo.

## Considered and excluded (visible decisions)

- **All prior exclusions re-affirmed** — including the four advised-against rows
  in PATH_TO_100 (seat-quantity billing · a second upload provider · nonce as
  the default CSP · OTel on by default). Each remains the right call after
  seeing the shipped rows.
- **Unit-testing `lib/csp.ts`.** Excluded: it's exercised by both build modes
  (the default build's byte-identical header is itself an assertion) plus the
  four-test nonce e2e matrix; the coverage include-list convention is
  tested-modules-only, and a unit test re-asserting a directive string adds
  maintenance without catching the real failure mode (mode wiring), which the
  e2e already pins.
- **Approving the pending Renovate majors from this audit.** Same reasoning as
  pass 7: dashboard-approval is the configured posture; batching into the Monday
  flow with CI as judge is the process. Confirmed alive; not preempted.

## Won't-fix notes

**None.** The list carried verbatim through passes 5–7 (10 items, 13 points) is
fully retired by the program — each entry either shipped as a program row or was
re-classified in PATH_TO_100 with the reasoning recorded there.

## Prioritization statement

**The path-to-100 program is VERIFIED at 100.0/100 — maintenance-only resumes as
the standing state** (Renovate drives deps; docs stay current; steps happen on
real need). Near-term calendar: **2026-07-20** (Renovate batch + the 8 pending
majors, typescript-v7 held), the **three override-removal conditions**
(uploadthing→effect ≥3.20 · next→postcss ≥8.5.10 · drizzle-kit drops
`@esbuild-kit`), and the **TS7 stable-Next watch** — the lone open backlog row.
Bands in `BACKLOG.md` remain the single source of truth; this report is the
scoring record.

## Addendum (2026-07-17, same day — a miss, owned)

Hours after this report was committed, the owner spotted **3 open CodeQL
code-scanning alerts** (created 2026-07-16 23:36Z → 07-17 06:36Z by the scans of
the program's final commits — i.e. **open while this pass scored**). The pass
missed them because it checked the CodeQL *workflow conclusion* (green) and the
Dependabot alerts API (0 open) but never queried the code-scanning alerts API — a
green analyze run only means the scan uploaded. **Method fixed:** the
project-audit skill now requires querying the open-alerts APIs directly.

Assessment and same-day fix (all three): (1) `js/tainted-format-string` in
`packages/email/src/send.tsx` — the fail-open suppression-lookup warn passed a
user-controlled email inside a printf-position template literal with a trailing
arg; a `%s`-bearing address garbled the log line (proven live). Real
product-code defect, impact limited to log confusion in an error path; fixed
with a literal `%s` format string. (2) `js/bad-tag-filter` in
`e2e/csp-nonce.spec.ts` — the script-tag regex was case-sensitive; a test
assertion, not a sanitizer, tightened with `/i`. (3)
`js/incomplete-url-substring-sanitization` in `e2e/billing-org.spec.ts` —
`url().includes("stripe.com")` in the either-outcome assertion; tightened to a
parsed-hostname check. **Scores unchanged** — a same-day-fixed log-formatting
nit and two test-assertion tightenings don't re-open a deduction — but the
alerts-API blind spot was a genuine audit-method gap, and this addendum is its
record.
