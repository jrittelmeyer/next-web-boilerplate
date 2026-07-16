# Architecture

> When to load: adding new features, creating files, understanding package boundaries, importing between packages.

## Monorepo Layout

```
next-web-boilerplate/
  apps/
    web/                    — the Next.js application
  packages/
    db/                     — @repo/db
    auth/                   — @repo/auth
    email/                  — @repo/email
    jobs/                   — @repo/jobs
    observability/          — @repo/observability (dev/CI-only)
    ui/                     — @repo/ui
    validators/             — @repo/validators
  tooling/
    eslint/                 — @repo/eslint-config
    typescript/             — @repo/typescript-config
    tailwind/               — @repo/tailwind-config
  docs/context/             — agent context files
  docker/                   — Dockerfile, docker-compose.yml
  .github/workflows/        — CI pipeline
  biome.json                — root Biome config (applies to all packages)
  turbo.json                — Turborepo task pipeline
  pnpm-workspace.yaml       — workspace package globs
```

## Package Responsibilities

### `apps/web`
The Next.js application. Contains all routing, pages, and app-level code. Imports from all `@repo/*` packages. Never the other way around — packages must not import from `apps/web`.

Internal structure:
```
apps/web/
  src/
    app/              — App Router. The root layout.tsx is a bare passthrough (globals.css
                        only); the SEO/PWA metadata route files (robots.ts, sitemap.ts,
                        manifest.ts, opengraph-image.tsx + twitter-image.tsx, icon.tsx,
                        apple-icon.tsx) and api/ stay at the root, outside [locale]
      [locale]/       — the WHOLE page tree (next-intl path routing — see I18N.md);
                        [locale]/layout.tsx is the real document shell (<html lang>,
                        providers, Toaster)
        (auth)/       — C1 auth UI: login/signup/forgot-password/reset-password
                        (shared centered-card layout, no app nav); renders at /login, …
        (dashboard)/  — protected app shell (nav + user menu + sign-out); the layout
                        runs the authoritative session check, redirects to /login if none.
                        Holds /dashboard and /admin (D2; admin-only nav link + RoleControl)
    i18n/             — next-intl plumbing (routing.ts / request.ts / navigation.ts)
    proxy.ts          — edge gate: optimistic auth-cookie redirect + i18n locale routing
    components/       — App-specific React components (not shared); feature subfolders
                        (e.g. observability/ — PostHogProvider + the observability demo)
    lib/              — App-specific utilities and helpers (trpc/ client+server, stripe.ts,
                        uploadthing.ts, search.ts, posthog.ts — the posthog-node server
                        singleton; site.ts — siteUrl/siteConfig for metadata)
    server/           — Server-only code: tRPC routers (trpc/), server actions (actions/)
    hooks/            — Custom React hooks (placeholder until needed)
    stores/           — Zustand stores (client UI state, e.g. ui-store.ts — see STATE.md)
    types/            — local TypeScript types (add when needed)
    instrumentation.ts          — Sentry register() + onRequestError (Next.js server hook)
    instrumentation-client.ts   — Sentry browser init + onRouterTransitionStart
    sentry.server.config.ts     — Sentry Node init (loaded by instrumentation.ts)
    sentry.edge.config.ts       — Sentry edge init (loaded by instrumentation.ts)
  e2e/                — Playwright E2E specs (*.spec.ts) + fixtures
  public/             — Static assets
  next.config.ts      — wrapped with withSentryConfig; PostHog /ingest rewrites
  playwright.config.ts— E2E config (webServer boots the prod build on :3000)
  tsconfig.json       — extends @repo/typescript-config/nextjs
```

Observability *instrumentation* (Step 13) lives **app-local**, not in a `@repo/*`
package: the Sentry instrumentation files are a Next.js convention (must be in the
app), the PostHog server client is a thin config singleton (`lib/posthog.ts`, same
posture as `lib/stripe.ts`/`lib/search.ts`), the PostHog client provider is an app
component, and BetterStack's `log` is imported directly from `@logtail/next` where
needed. (`@repo/observability` is a different thing — dev/CI-only dashboards-as-code,
above — not runtime instrumentation.)

**SEO / PWA metadata (Step 23)** is all App Router file conventions in `app/`, plus
one helper. `lib/site.ts` (server-only) is the single source of truth — `siteUrl`
(`SITE_URL ?? BETTER_AUTH_URL`, so the canonical public/SEO origin can differ from the
app/auth origin; localhost fallback for `SKIP_ENV_VALIDATION` builds) and `siteConfig`
(name/description/url) — consumed by the root `layout.tsx`
metadata (`metadataBase`, title template, OpenGraph + Twitter cards) and the metadata
routes: `robots.ts` (allow-all + sitemap pointer), `sitemap.ts`, `manifest.ts`
(PWA manifest, slate `theme_color`), `opengraph-image.tsx` (a `next/og` `ImageResponse`
1200×630 card — no font file, no binary asset), `twitter-image.tsx` (re-exports the OG
image), and `icon.tsx` / `apple-icon.tsx` (generated favicon + Apple touch icon). The
`<link>`/`<meta>` tags for the manifest, icons, and OG/Twitter images are injected
automatically by their file conventions, so the layout does not repeat them. **The
sitemap lists only the real public surface** (`/`, `/login`, `/signup`,
`/forgot-password` — one `<url>` per locale with hreflang alternates, see
[I18N.md](I18N.md#seo-metadata-hreflang--sitemap)) — the demo/scaffold routes below are
throwaway, so it deliberately doesn't advertise them; add real routes to `sitemap.ts`
as they land.

### `packages/db` → `@repo/db`
Drizzle schema definitions, database client, and migration files. Imported by `apps/web` and any future apps. No business logic — pure data access.

### `packages/auth` → `@repo/auth`
Better Auth configuration, session type definitions, and auth utilities. The Next.js middleware lives in `apps/web` but imports session helpers from here. Imports `@repo/email` to send verification / password-reset / welcome emails from the Better Auth lifecycle callbacks (see [AUTH.md](AUTH.md)).

### `packages/email` → `@repo/email`
React Email templates plus the (lazy) Resend client and the send helpers. Imported server-side only. Templates are React components that render to HTML. Imports `@repo/db` for the suppression consult (#8): `send()` checks `isEmailSuppressed()` before every configured send (see [SERVICES.md](SERVICES.md)).

### `packages/jobs` → `@repo/jobs`
pg-boss background jobs (D7). Two halves: the app imports only the thin `enqueue()`
(server-only, gracefully no-ops when the DB is unreachable); the worker is a separate
long-lived process (`pnpm --filter @repo/jobs start`) that runs the handlers. Imports
`@repo/email` (the welcome-email handler); consumed by `@repo/auth`
(`afterEmailVerification` enqueues). Full walk-through in [SERVICES.md](SERVICES.md).

### `packages/observability` → `@repo/observability`
BetterStack dashboards-as-code (D11): typed monitor/heartbeat config + `check`/`sync`
scripts. **Dev/CI-only — never imported by the app** (zero build/bundle/CSP surface).
See [SERVICES.md](SERVICES.md).

### `packages/ui` → `@repo/ui`
Shared shadcn/ui components. shadcn runs in **monorepo mode** (a `components.json` in
both `apps/web` and `packages/ui`), so `pnpm dlx shadcn@latest add <name> --cwd apps/web`
writes shared primitives **straight into** `packages/ui/src/components/` — there is no
"add to the app then promote" step. Ships raw `.tsx` (no build), so it's listed in
`next.config.ts` `transpilePackages`. Consumed via subpath exports
(`@repo/ui/components/<name>`, `@repo/ui/lib/utils`, `@repo/ui/globals.css`); components
use the unified `radix-ui` package. See [UI.md](UI.md) for the CLI quirks.

### `packages/validators` → `@repo/validators`
Zod schemas that are shared between client and server (e.g., form schemas used in both React Hook Form and tRPC input validation). Keep these framework-agnostic.

### `tooling/*`
Build tooling only — no runtime code. These packages are `devDependencies` everywhere they're used.

## Demo / scaffold routes (delete these)

Each feature step shipped a small **public** demo page so its wiring is exercisable in
a browser without an auth UI. They are **scaffold, not product** — delete the route (and
its example Server Action / component, if unused elsewhere) when the real feature lands.
They're intentionally public (not behind the `(dashboard)` proxy gate) so both the
signed-in and signed-out branches of each action are reachable.

> **Removing an integration entirely** (not just swapping a demo for a real feature): each
> integration's [SERVICES.md](SERVICES.md) section ends with a **"Remove it"** checklist — the
> exact files, deps, env vars, CSP entries, and DB tables to delete for Stripe, Uploadthing,
> Meilisearch, PostHog, Sentry, background jobs (`@repo/jobs`), and `@repo/observability`. Email
> (`@repo/email`) and BetterStack logging (`@logtail/next`) are load-bearing façades — those
> entries explain how to swap/degrade rather than delete.

| Route | Step | Demonstrates |
| --- | --- | --- |
| `/state` | 8 | A shared Zustand store (`UiStoreDemo` mounted twice, in sync) |
| `/billing` (+ `/billing/success`) | 10 | Stripe hosted Checkout via `createCheckoutSession` |
| `/premium` | A2 | Subscription **gating** — `hasActiveSubscription(userId)` reads the local `subscriptions` table (no Stripe call); three states (signed-out → sign-in · unentitled → `/billing` · entitled → content) |
| `/uploads` | 11 | Uploadthing `UploadButton` (auth-gated `imageUploader`) |
| `/search` | 12 | Meilisearch read (tRPC `search.search`) + a "Reindex posts from database" write (`reindexPosts`) over the real `posts` index |
| `/observability` | 13 | Sentry capture · BetterStack log · PostHog event + server flag |
| `/admin` | 21 · D2 | RBAC guard pattern — **gated** (not public), in the `(dashboard)` shell: proxy cookie-redirect + `requireAdmin()` authoritative check (404 for non-admins) + a user list whose roles are changed via the `setUserRole` Server Action (`RoleControl`, optimistic `useOptimistic`), behind an admin-only nav link |
| `/posts` | 28 · D1 · D4 | The example domain entity end-to-end **and** the Cache Components / PPR showcase: a synchronous page renders the static card shell while `<PostStats>` (a `"use cache"` count — `cacheLife("minutes")`/`cacheTag("posts")`), the session-aware composer, and the cursor-paginated `post.list` feed (RSC-prefetched + hydrated, `useInfiniteQuery` + "Load more") each stream in behind their own `<Suspense>`. `createPost`/`updatePost`/`deletePost` index/de-index on write, do **optimistic** create/edit/delete + rollback, and `updateTag("posts")` to bust the cached count (read-your-own-writes) |
| `/notifications` | A22 | **Gated** (in the `(dashboard)` shell): the realtime SSE example — a per-user notifications feed pushed over `/api/notifications/stream` (Postgres LISTEN/NOTIFY → in-process bus → `EventSource` → the `notification.list` query cache + a toast). Delete the route + `server/realtime/*` + the stream route to remove it; the persisted `notifications` table + `notification.list` degrade to "refresh to see new". See [API.md](API.md#realtime--server-sent-events-sse-tier-4--a22) |

`/admin` is the one **gated** entry here (RBAC, Step 21; deepened in D2): the page
content is an example to adapt, but the *guard wiring* — `proxy.ts` optimistic cookie
redirect + the page's `requireAdmin()` authoritative role check — is the keeper. D2 moved
it under the `(dashboard)` shell, added the `setUserRole` write surface (`RoleControl` —
optimistic `useOptimistic`, with a self-demotion guard) and an admin-only nav link. See
[AUTH.md](AUTH.md#rbac-step-21).

`/posts` (Step 28, deepened in D1, reworked into a Partial-Prerender showcase in D4) is the
**copy-me template**, not throwaway like the others: it's the example domain entity (`posts`)
wired end-to-end — schema + migration (`@repo/db`) → cursor-paginated `post.list` tRPC query →
`createPost`/`updatePost`/`deletePost` Server Actions (indexing / de-indexing into Meilisearch
on write) → this page (`useInfiniteQuery` + "Load more", with **optimistic** create/edit/delete
and rollback) → the `/search` read → `db:seed`. Under Cache Components the page is **synchronous**
(a static shell) and pushes every request-data read — the session-aware composer (`ComposerCard`),
the DB-backed `Feed` (`connection()`), and the cached `<PostStats>` count — behind its own
`<Suspense>` so they stream into the PPR shell; copy that structure for cacheable reads in your
own entity (`"use cache"` + `cacheTag` busted by `updateTag` on write). Copy the pattern for your
own entity, then delete the demo. The pagination + optimistic-mutation patterns are documented in
[API.md](API.md#cursor-pagination-d1) and [STATE.md](STATE.md#optimistic-updates-d1). The `posts` files live in
`packages/db/src/schema/posts.ts` (+ its `post-revisions.ts` history companion — the
worked `db.transaction` example, A15), `apps/web/src/server/trpc/routers/post.ts`,
`apps/web/src/server/actions/post.ts`, and `apps/web/src/components/posts/`.

The root landing page (`/`, `app/[locale]/page.tsx`) is **not** scaffold — it's the real home
page and the target of the Playwright smoke test.

**The `(dashboard)` shell (C1) is real, not scaffold.** `app/[locale]/(dashboard)/dashboard/page.tsx`
(renders at `/dashboard`, proxy-gated) is the clone-and-ship protected surface — a thin shell
(nav + user menu + sign-out) to build your app inside, not a demo to delete. Add sibling
routes under `app/[locale]/(dashboard)/` to inherit its nav + authoritative session gate. **`/account`
(M3) is the worked example of exactly that** — a real, gated settings page (`app/[locale]/(dashboard)/account/page.tsx`)
that edits the display name (reusing the `updateUserName` Server Action + `UpdateNameForm`,
now under `components/account/`), changes the sign-in email (two-hop verified flow, M5→M7)
and the password via the Better Auth client for credential users (a social-only user has no
password card), lists active sessions with revoke (P2-1), **uploads/removes a profile photo**
(Band-1 Tier-4 — the Profile card's `AvatarCard` posts to the auth-gated `avatarUploader`
route → persists `user.image` → renders via the shared `Avatar` primitive on `/account` **and**
in the dashboard-header user menu; see [SERVICES.md](SERVICES.md#uploadthing-file-uploads)),
and carries the danger-zone account deletion (P2-2) — full walk-through in
[AUTH.md](AUTH.md#account-page-m3). It **replaced** the old throwaway `/profile` demo. The
`(auth)` forms render **OAuth social buttons** for any env-configured provider (M1 — see
[AUTH.md](AUTH.md#auth-ui-c1)). **Deferred depth (build when you need it):** richer dashboard widgets.

**Organizations UI (Tier 4 · Band 4) is real, not scaffold.** `/organization`
(`app/[locale]/(dashboard)/organization/page.tsx`, proxy-gated) manages the active org — members,
roles, invites, pending invitations, rename/delete/leave — and the header **workspace
switcher** (`components/organization/org-switcher.tsx`) creates/switches orgs from any
`(dashboard)` page. **`/accept-invitation/[id]`** (`app/[locale]/(auth)/accept-invitation/[id]/page.tsx`,
rendered at that path — the `(auth)` group is a layout boundary only) is a **public**
surface: it must work signed-out, so it is deliberately **not** under the `(dashboard)` gate
or the proxy matcher. Both are driven by Better Auth's reactive org hooks; full walk-through
in [AUTH.md](AUTH.md#organizations-ui-step-4).

## Where Tests Live

Unit/component tests are **co-located** with source as `*.test.ts(x)` and run by
**Vitest per package** (each test-bearing package owns a `vitest.config.ts` + a
`test` script; `turbo test` fans out across `@repo/validators`, `@repo/ui`,
`@repo/jobs`, `@repo/auth`, `@repo/email`, and `web` — the `apps/web` project stubs
`@/env` + `server-only` so app modules unit-test in plain `node`). `@repo/db` has only
DB-backed integration tests (`test:integration`, skipped by the default run).
`apps/web` also owns the **Playwright** E2E tests in `apps/web/e2e/*.spec.ts`.
Convention: Vitest owns `*.test.*`, Playwright owns `*.spec.*`. See
[TESTING.md](TESTING.md).

## Import Rules

- `apps/web` → can import from any `@repo/*` package
- `packages/*` → can import from `@repo/validators` and `@repo/ui`; never from `apps/web`
- `packages/db` → no other `@repo/*` imports (pure Drizzle + Postgres)
- `packages/auth` → may import from `@repo/db` (needs DB adapter), `@repo/email` (sends verification / reset emails from Better Auth callbacks), and `@repo/jobs` (enqueues the welcome email, D7). One-directional: `@repo/email`/`@repo/jobs` never import `@repo/auth`, so there's no cycle.
- `packages/email` → may import from `@repo/validators` (email data schemas) and `@repo/db` (the `email_suppressions` consult, #8; acyclic — `@repo/db` imports no `@repo/*` package)
- `packages/jobs` → may import `@repo/email` (job handlers send email); exposes only `enqueue()` to the app
- `packages/observability` → no `@repo/*` imports; never imported by anything (standalone scripts)
- `tooling/*` → no runtime imports; config files only

## Data Flow

```
Browser
  → Next.js App Router (apps/web/src/app/)
    → Server Components fetch via tRPC server caller or direct DB access
    → Client Components use TanStack Query → tRPC HTTP endpoint
    → Forms use Server Actions → validated with @repo/validators → @repo/db
  → API Routes (apps/web/src/app/api/)
    → /api/trpc/[trpc]  — tRPC handler
    → /api/auth/[...all] — Better Auth handler
    → /api/stripe/webhook — Stripe webhook handler
    → /api/resend/webhook — Resend webhook handler (bounces/complaints → suppressions, #8)
    → /api/uploadthing  — Uploadthing handler
```

## Path Aliases

`@repo/*` packages resolve through their `package.json` `exports` map (not a single
`index.ts` for every one). App-internal code uses `@/*`.

- `@/*` → `apps/web/src/*` (declared in `apps/web/tsconfig.json`; no `baseUrl` — see [CONVENTIONS.md](CONVENTIONS.md))
- `@repo/db` → `.` (`src/index.ts`), `./schema` (`src/schema/index.ts`)
- `@repo/auth` → `.` (`src/index.ts`, server-only), `./client` (`src/client.ts`)
- `@repo/validators` → `.` (`src/index.ts`)
- `@repo/ui` → **subpath-only** (no `.`): `./components/*`, `./lib/*`, `./hooks/*`, `./globals.css`
- `@repo/tailwind-config` → `./base` (`base.css`); `@repo/typescript-config` → `./base` `./nextjs` `./react-library`; `@repo/eslint-config` → `./next`
- `@repo/email` → `.` (`src/index.ts` → `getResend()` (lazy client) + `isEmailConfigured` + the `send*` helpers + the re-exported `WebhookEventPayload` type, **server-only**), `./templates/*` (`src/templates/*.tsx`). Ships raw `.tsx` (no build step) like `@repo/ui`, so it's in `next.config.ts` `transpilePackages`
