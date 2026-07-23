# next-web-boilerplate — agent onboarding

Production-ready Next.js monorepo starter for complex web applications. Every
architectural decision is documented in `docs/context/`. Read the relevant context
file before working in that area.

> **Status:** feature-complete — the **path-to-100 program** shipped all 11 rows and
> was **verified at 100.0/100** by the eighth audit pass (2026-07-17;
> [docs/archive/PROJECT_AUDIT_2026-07-17.md](docs/archive/PROJECT_AUDIT_2026-07-17.md)).
> The tenth/eleventh passes (2026-07-22) held **99.65** — no code regressed; the
> maintenance gaps they flagged were closed the same week (Renovate schedule widened,
> PR-delivery proof due 2026-07-27; `/_next/image` e2e added; the 2026-07-22 advisory
> batch remediated via `next` 16.2.11 + the new security-triage pipeline)
> ([docs/archive/PROJECT_AUDIT_2026-07-22B.md](docs/archive/PROJECT_AUDIT_2026-07-22B.md)).
> **Maintenance mode ([docs/MAINTENANCE.md](docs/MAINTENANCE.md)) is the standing
> state.** Every integration is built and verified end-to-end — see
> [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for exactly what's in place and
> [docs/VERIFICATION.md](docs/VERIFICATION.md) for the hands-on proof checklist. New
> work (see [docs/BACKLOG.md](docs/BACKLOG.md)) goes plan → sign-off → build.

## Working agreements

How agents work in this repo:

- **Plan → sign-off → build.** For each step, present a detailed plan and wait for the
  user's sign-off before implementing. Don't start the next step unprompted.
- **Verify by building/running, not by assuming.** Run the full gate (`lint` ·
  `type-check` · `build`) plus a live check where the change is observable;
  live-verify against a fresh prod build (e.g. `:3100`) without disturbing a standing
  dev server.
- **Version-check every dependency against the npm registry** before adding it
  (`pnpm view <pkg> version` / dist-tags) — never blog posts. Respect a ~7-day
  release-age; exact-pin packages that publish frequently (e.g. `lint-staged`,
  `lucide-react`). See [docs/MAINTENANCE.md](docs/MAINTENANCE.md).
- **Graceful degradation.** Every integration builds and runs with its env unset;
  features light up only when configured.
- **Cross-platform (Windows-safe).** No bash-only build steps — the repo is developed
  on Windows too.
- **Keep docs current.** Update `docs/PROJECT_STATUS.md` (state) and the relevant
  `docs/context/*` doc as part of the change.
- **Local disk hygiene.** The Turbo cache (`.turbo/cache`) has no native size cap and
  each build adds ~3.5 GB; `pnpm clean` does **not** clear it. Run `pnpm cache:prune`
  periodically (it also runs on `pre-push`). See
  [DEPLOYMENT.md](docs/context/DEPLOYMENT.md#local-disk-hygiene-turbo-cache).

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19) |
| Language | TypeScript 6 (`strict`) |
| Runtime | Node.js 24 (Active LTS) |
| Monorepo | Turborepo 2.x + pnpm 11.x workspaces |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Better Auth |
| API | tRPC (queries) + Server Actions (mutations) |
| State | Zustand + TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Testing | Vitest + Playwright |
| Email | Resend + React Email |
| Payments | Stripe |
| Observability | Sentry + BetterStack + PostHog |
| File uploads | Uploadthing |
| Search | Meilisearch |
| Deployment | Docker (platform-agnostic) |

## Commands

```bash
pnpm dev           # start all apps in dev mode
pnpm build         # build all apps and packages
pnpm lint          # Biome + ESLint (@next/eslint-plugin-next only)
pnpm lint:fix      # auto-fix lint issues
pnpm type-check    # TypeScript across all packages
pnpm test          # Vitest unit + integration tests
pnpm test:e2e      # Playwright E2E tests
pnpm format        # Biome formatter
pnpm clean         # run each package's clean task (dist/.next) — NOT the Turbo cache
pnpm cache:size    # report the local Turbo cache size (.turbo/cache)
pnpm cache:prune   # evict oldest Turbo cache entries to the size cap (default 20 GB)
```

## Monorepo Structure

```text
apps/web/           — Next.js application (src/ layout)
packages/db/        — Drizzle schema, migrations, DB client
packages/auth/      — Better Auth config + session utilities
packages/email/     — React Email templates + Resend client
packages/jobs/      — pg-boss background-jobs worker + enqueue helper
packages/observability/ — BetterStack dashboards-as-code: monitors/heartbeats (dev/CI-only)
packages/ui/        — shadcn/ui shared component library
packages/validators/— Zod schemas shared across client + server
tooling/eslint/     — @repo/eslint-config (Next.js-specific rules only)
tooling/typescript/ — @repo/typescript-config (base / nextjs / react-library)
tooling/tailwind/   — @repo/tailwind-config (shared design tokens)
docs/context/       — agent context files (load on demand)
docker/             — prod Dockerfile + docker-compose (dev + prod)
.github/workflows/  — CI pipeline
```

## Context Docs (load when relevant to your task)

| File | Load when working on... |
| --- | --- |
| [STACK.md](docs/context/STACK.md) | tech choices, adding dependencies, version questions |
| [ARCHITECTURE.md](docs/context/ARCHITECTURE.md) | adding features, creating files, package boundaries |
| [CONVENTIONS.md](docs/context/CONVENTIONS.md) | writing any code |
| [DATABASE.md](docs/context/DATABASE.md) | schema, queries, migrations |
| [AUTH.md](docs/context/AUTH.md) | auth flows, sessions, protected routes, RBAC |
| [API.md](docs/context/API.md) | tRPC procedures or Server Actions |
| [STATE.md](docs/context/STATE.md) | Zustand stores, client vs server state, TanStack Query boundary |
| [TESTING.md](docs/context/TESTING.md) | writing or running tests |
| [UI.md](docs/context/UI.md) | components, layouts, Tailwind, shadcn, adopting a brand/token sheet |
| [I18N.md](docs/context/I18N.md) | translating copy, formatting dates/numbers/currency, adding a locale, locale routing/`[locale]`, per-locale SEO, the LanguageSwitcher |
| [SERVICES.md](docs/context/SERVICES.md) | Stripe, Resend, Sentry, PostHog, Uploadthing, Meilisearch |
| [SECURITY.md](docs/context/SECURITY.md) | security headers, CSP, allowlisting a new SaaS origin |
| [DEPLOYMENT.md](docs/context/DEPLOYMENT.md) | Docker, env vars, CI/CD, infrastructure |
| [DECISIONS.md](docs/context/DECISIONS.md) | the *why* behind a cross-cutting choice (driver, env, auth-schema ownership, tRPC/Action split, Tailwind/shadcn wiring, dependency pins) |
<!-- /project-init or /project-adopt: uncomment the row below (delete this wrapper line and the closing one) once docs/PRODUCT.md exists.
| [PRODUCT.md](docs/PRODUCT.md) | the product brief — vision, target users, MVP scope, feature groups + the audit bar |
-->

> Historical detail (per-step rationale + verification, completed plans) lives in
> [docs/archive/](docs/archive/) — load it only when you need the background behind a
> past decision; it is not part of normal task context. Human-first guides:
> [docs/FEATURES.md](docs/FEATURES.md) (what's included & why) ·
> [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) (template usage) ·
> [docs/plain-english-guide/](docs/plain-english-guide/) (zero-jargon tour + pitch
> deck for non-technical readers — not agent context).
