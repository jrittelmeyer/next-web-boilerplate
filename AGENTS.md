# next-web-boilerplate — agent onboarding

Production-ready Next.js monorepo starter for complex web applications. Every
architectural decision is documented in `docs/context/` — read the relevant context
file (table below) before working in that area.

> **Status:** feature-complete — **maintenance mode
> ([docs/MAINTENANCE.md](docs/MAINTENANCE.md)) is the standing state.** Current
> state: [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) · verification proof:
> [docs/VERIFICATION.md](docs/VERIFICATION.md) · new work
> ([docs/BACKLOG.md](docs/BACKLOG.md)) goes plan → sign-off → build.

**Stack anchor** (wrong-era guard — full table in [README](README.md), rationale in
[STACK.md](docs/context/STACK.md)): Next.js 16 App Router · React 19 · TypeScript 6
`strict` · Node 24 · Turborepo 2 + pnpm 11 · Tailwind **v4** + shadcn/ui · Drizzle +
PostgreSQL · Better Auth · tRPC (queries) + Server Actions (mutations) · Zustand +
TanStack Query v5 · RHF + Zod · Vitest + Playwright · Docker deploy.

## Working agreements

- **Plan → sign-off → build.** Present a detailed plan and wait for sign-off before
  implementing; don't start the next step unprompted. Write the plan to a file
  (scratchpad or docs) and reference it — a plan held only in-window dies with the
  window.
- **Verify by running, not by assuming.** Full gate (`lint` · `type-check` ·
  `build`), then drive the affected flow against a fresh prod build (`:3100`)
  without disturbing a standing dev server — the `live-verify` skill is the
  checklist.
- **Registry-verify every dependency** before adding/bumping (`dep-check` skill;
  release-age + exact-pin policy: `.claude/ai-dev-kit.config.json` → `depPolicy`).
- **Three strikes.** After three failed attempts at the same obstacle, stop:
  checkpoint a diagnosis to disk, fix the spec or the context, and restart fresh —
  never coach a poisoned window.
- **Fork exploration; point, don't paste.** Broad code sweeps go to a subagent that
  returns the conclusion; reference files and tail/grep logs instead of ingesting
  them.
- **Graceful degradation.** Every integration builds and runs with its env unset;
  features light up only when configured.
- **Cross-platform (Windows-safe).** No bash-only build steps.
- **Keep docs current, same commit.** Update `docs/PROJECT_STATUS.md` (state) and the relevant
  `docs/context/*` doc as part of the change that alters reality — a stale
  instruction file is worse than none. `packages/{db,ui,jobs,auth,email}` carry
  leaf `AGENTS.md` files: review the leaf in the same PR that changes that
  package's behavior.

## Commands

Full list: root `package.json` scripts. Gate = `pnpm lint` · `pnpm type-check` ·
`pnpm build`; tests = `pnpm test` (Vitest) · `pnpm test:e2e` (Playwright).
Non-obvious:

- `pnpm lint` = Biome + ESLint (`@next/eslint-plugin-next` only).
- `pnpm clean` clears package `dist`/`.next` outputs — **not** the Turbo cache
  (`.turbo/cache`, ~3.5 GB per build, no native cap). `pnpm cache:prune` evicts it
  to the cap (also runs on `pre-push`); `pnpm cache:size` reports it.

## Layout

Standard Turborepo shape — `apps/web` (Next.js app, `src/` layout), `packages/*`
(shared code), `tooling/*` (shared eslint/typescript/tailwind configs), `docker/`
(prod Dockerfile + dev/prod compose), `.github/workflows/` (CI). Non-obvious:
`packages/jobs` = pg-boss worker + enqueue helper; `packages/observability` =
BetterStack dashboards-as-code (dev/CI-only); `tooling/eslint` exists solely for
`@next/eslint-plugin-next`.

## Hard rules

Full rationale, naming table, and file-structure map:
[CONVENTIONS.md](docs/context/CONVENTIONS.md).

- TypeScript `strict`; no `@ts-ignore`/`as any`; no enums (use `as const` /
  literal unions); no `baseUrl`; `paths` never in a shared tsconfig.
- Named exports everywhere (default only where a framework requires); one React
  component per file; kebab-case filenames; dead code is CI-gated by knip
  (`/** @public — why */` exempts deliberate API surface).
- Server Components by default; `"use client"` at the lowest node; React Compiler
  is ON — no manual `useMemo`/`useCallback`/`React.memo`.
- Vitest = `*.test.*` co-located; Playwright = `*.spec.*` under `apps/web/e2e/` —
  never mix the suffixes.
- Server Actions return `ActionResult<T>` (`@repo/validators`); tRPC procedures
  throw `TRPCError`; never swallow errors.
- No comments unless the WHY is genuinely non-obvious.

## Context docs (load when relevant to your task)

| File | Load when working on... |
| --- | --- |
| [STACK.md](docs/context/STACK.md) | tech choices, adding dependencies, version questions |
| [ARCHITECTURE.md](docs/context/ARCHITECTURE.md) | adding features, creating files, package boundaries |
| [CONVENTIONS.md](docs/context/CONVENTIONS.md) | naming details, `apps/web/src` file map, git hooks, knip/compiler rationale |
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

> Historical detail (per-step rationale + verification, completed plans) lives in
> [docs/archive/](docs/archive/) — load it only when you need the background behind
> a past decision; it is not part of normal task context. Human-first guides (not
> agent context): [docs/FEATURES.md](docs/FEATURES.md) ·
> [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) ·
> [docs/plain-english-guide/](docs/plain-english-guide/).
