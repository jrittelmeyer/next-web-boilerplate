# Phase B — 100/100 Implementation & Documentation Audit

> **What this is.** A read-only audit of the whole repo against a 100/100 bar
> (correctness · modern best practice · code↔doc drift · completeness · DX). It is the
> evidence/reasoning record; the **actionable, prioritized backlog** distilled from it
> was completed 2026-07-05 and is archived in [PHASE_HISTORY.md](PHASE_HISTORY.md)
> ("Audit backlog — 100/100 pass"); the forward backlog is now
> [../BACKLOG.md](../BACKLOG.md). No code was changed during the audit.
>
> _Performed: 2026-06-24, at the Phase 1+2 completion checkpoint (CI green)._

## Baseline confirmed green

`pnpm lint` ✓ · `pnpm type-check` ✓ · `pnpm build` ✓ (exit 0, 21 routes, `/` static) ·
`pnpm test` ✓ (18/18: validators 9, ui 9). E2E + DB-integration were **not** run locally
(no DB/browser); they run in the CI `e2e` lane by design. Installed versions match
STACK.md exactly (better-auth 1.6.20, next 16.2.9, react 19.2.7, typescript 6.0.3,
drizzle-orm 0.45.2, zod 4.4.3, tailwindcss 4.3.1). Migrations match schema (role col +
posts present). No stray `TODO`/`HACK`/`as any`/`@ts-ignore`; the one `biome-ignore`
([send.tsx:57](../../packages/email/src/send.tsx#L57)) is justified.

**Headline:** unusually clean codebase. **No must-fix correctness bugs.** The gap to a
true 100/100 is not bug-fixing — it's **one missing surface (auth/dashboard UI)** plus
doc drift and best-practice polish.

## A. Correctness / bugs (all low-severity; none must-fix)

| # | File:line | Severity | Issue | Fix sketch |
|---|---|---|---|---|
| A1 | [next.config.ts:99-104](../../apps/web/next.config.ts#L99-L104) | Low (cosmetic) | The `/ingest/decide` rewrite is **unreachable** — preceding `/ingest/:path*` already matches it, same destination. Dead config. | Delete the third rewrite entry. |
| A2 | [search router:12](../../apps/web/src/server/trpc/routers/search.ts#L12) + [post router:10](../../apps/web/src/server/trpc/routers/post.ts#L10) | Low (best-practice) | The two **public, abusable** endpoints (`search.search` hits the external engine; `post.list` runs a 50-row DB query) use plain `publicProcedure` with **no rate limit**, while the *trivial* `user.health` is the one wearing `rateLimitedProcedure`. Limiter demoed on the wrong surface. | Apply `rateLimitedProcedure` to `search`/`list`; add `.min(0).max(200)` bound on the search `query`. |
| A3 | [rate-limit.ts:166](../../apps/web/src/lib/rate-limit.ts#L166) | Low (documented) | `clientKeyFromHeaders` falls back to a single `"unknown"` bucket when no `x-forwarded-for`/`x-real-ip` — on a host that doesn't set those, *all* clients share one bucket. | Deploy note on which platforms set the header; consider denying the webhook if neither present. |

## B. Doc inaccuracies / code-doc drift

| # | Where | Severity | Drift |
|---|---|---|---|
| B1 | [README.md:7-9](../../README.md#L7-L9) | **Med (must-fix)** | "**Status: complete — all 16 build steps are done**" — stale by a whole phase. Project is at Step 29 (Phase 1+2 complete). The public-facing README undersells the repo. |
| B2 | [README.md:77-78](../../README.md#L77-L78) | Med | The Documentation list of context docs **omits `SECURITY.md` and `DECISIONS.md`** (lists 11 of 13). |
| B3 | `.env.example` + [DEPLOYMENT.md:14-57](../context/DEPLOYMENT.md#L14-L57) | Med | Both the example file *and* the DEPLOYMENT "full target set" **omit three vars that exist in `env.ts`**: `AUTH_TRUSTED_ORIGINS`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Not discoverable for a cloner enabling distributed rate-limiting / extra CSRF origins. |
| B4 | [CONVENTIONS.md:44-48](../context/CONVENTIONS.md#L44-L48) | Low | "File Structure" diagram presents `app/(auth)/` and `app/(dashboard)/` as established structure. **Neither directory exists** (confirmed). Aspirational; ARCHITECTURE.md correctly frames it as future, so CONVENTIONS is the odd one out. |
| B5 | [README.md:39-43](../../README.md#L39-L43) | Low | Quickstart says "start Postgres" but compose also starts Meilisearch; phrase as "Postgres + Meilisearch". |

Everything else spot-checked (STACK version table, DECISIONS log, AUTH RBAC, SERVICES
per-integration claims, the lazy-singleton rationales, Docker/standalone gating, turbo
passthrough) is **accurate to the code.**

## C. "Definitely add" — gaps a true 100/100 modern Next.js boilerplate ships

| # | Gap | Effort | Value | Notes |
|---|---|---|---|---|
| **C1** | **Auth UI + app shell** — `(auth)` login/signup/forgot/reset pages and a `(dashboard)` layout (nav + user menu + sign-out). | Med-High | **Very High** | Biggest boilerplate-fitness gap. Better Auth is fully wired server-side, but the proxy redirects `/dashboard/*` and `/admin/*` to **`/login` — which 404s**. A cloner gets zero auth UI and must hit the HTTP API (which is what the E2E auth spec does today). Unblocks: real proxy redirects, the `(dashboard)` group docs already reference, and converting the E2E auth spec to UI steps. **Highest-leverage single step.** |
| **C2** | **`apps/web` Vitest project** (mocked `@/env`) covering Server Action + tRPC procedure logic. | Med | Med-High | Currently *intentionally* absent — the most logic-dense files (`post.ts`, `admin.ts`, `rate-limit.ts`, `rbac.ts`) have **no unit coverage** beyond the DB-integration mirror. Test the branching (auth gate, rate-limit block, validation failure) with a mocked env. |
| **C3** | **DB-backed checks on PRs**, not just push-to-main. | Med | Med | Auth/posts/a11y E2E + DB integration run **only after merge** ([ci.yml:96](../../.github/workflows/ci.yml#L96)). A PR can go green and break the core flow, caught only post-merge. Add a lightweight Postgres-service lane to PRs. |
| **C4** | **Stripe webhook → DB persistence** as a *worked* example (even minimal), not a TODO. | Med | Med | A payments boilerplate that never persists a subscription is half a feature. Ship the `subscriptions` table from DATABASE.md + the `checkout.session.completed` write behind the same graceful gate. |

## D. Nice-to-haves

| # | Item | Effort | Value |
|---|---|---|---|
| D1 | Posts reference depth: **edit/update flow, pagination, optimistic UI** (orig. Phase 3 A) | Med | Med |
| D2 | **Admin UI depth** — `/admin` is a stub; build user-list + `setUserRole` surface (orig. D) | Med | Med |
| D3 | **React Compiler** (`reactCompiler` — Next 16/React 19.2 supports it) as a modern default | Low-Med | Med |
| D4 | Demonstrate Next 16 **`'use cache'` / `cacheComponents`** and/or `next/after` for the serverless log-flush (docs mention `waitUntil`; code doesn't use `after()`) | Med | Med |
| D5 | **Decouple `siteUrl` from `BETTER_AUTH_URL`** ([site.ts:22](../../apps/web/src/lib/site.ts#L22)) — public/marketing origin often differs from auth origin | Low | Low-Med |
| D6 | **Component gallery / Storybook** for `@repo/ui` (orig. B); **`degit`/create-app** scaffold | Med | Med |
| D7 | Background-jobs story (orig. C); observability dashboards-as-code (orig. E) | Med-High | Med |
| D8 | CI **Turbo remote cache** + bundle-analyzer script | Low | Low |

## E. Confirmed-excellent (do NOT touch)

- **Graceful degradation** is real and complete — verified by the green no-creds build
  across Stripe/Resend/Sentry/PostHog/Uploadthing/Meilisearch/Upstash. The
  lazy-guarded-singleton pattern (`lib/stripe.ts`, `lib/search.ts`, `lib/posthog.ts`) is
  consistent and correct.
- **RBAC** (`lib/rbac.ts`, `trpc.ts` `adminProcedure`) reads the role **fresh from the
  DB, never the cookie-cached session** — correct, and the identity-vs-authority
  reasoning is sound. `role` deliberately kept out of `additionalFields`.
- **Stripe webhook**: rate-limit-before-crypto, raw-body read, signature verify, clean
  429/503/400 separation.
- **Health endpoint**: liveness+readiness merged with intent, timeout-bounded ping,
  swallows the late rejection to avoid an unhandled-rejection.
- **tRPC telemetry** (`trpc.ts`): Sentry only on `INTERNAL_SERVER_ERROR`, BetterStack
  level mapping, `flush()` on the error branch only.
- **Security headers/CSP** (`next.config.ts`): dev/prod variance is correct; the
  static-vs-nonce decision is documented honestly with an upgrade path.
- **Env + Turbo strict-env** (`env.ts`, `turbo.json`): `skipValidation` +
  `globalPassThroughEnv` + `build.env` is the non-obvious correct wiring.
- **Docker**: multi-stage, non-root uid 1001, standalone gated behind `BUILD_STANDALONE`,
  node-based healthcheck. Cross-platform (Windows EPERM) discipline is real.
- Auth/DB schema centralization, the seed's dynamic-import ordering, the `@repo/ui`
  raw-tsx + Tailwind v4 `@source` wiring — all correct and matching docs.
