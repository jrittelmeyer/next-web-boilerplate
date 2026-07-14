# Stack Reference

> When to load: tech choices, adding/upgrading dependencies, version questions, evaluating alternatives.

## Version Verification Policy

Versions below were verified against the **npm registry dist-tags** (authoritative), not blog posts, on 2026-06-17. Blog/SEO sources proved unreliable for version data. When adding or upgrading any dependency, confirm the current `latest` via `pnpm view <pkg> version` or `https://registry.npmjs.org/-/package/<pkg>/dist-tags` rather than trusting documentation or articles.

**Automated since Step 26.** The manual "let a release age; verify provenance" discipline is now enforced by **Renovate** (`.github/renovate.json`, `minimumReleaseAge: "7 days"` + `rangeStrategy: "auto"` to preserve pins/carets) for updates and by a **`pnpm audit`** CI job + **CodeQL** for vulnerabilities. The same 7-day age gate is also enforced at the **install layer** by pnpm's own `minimumReleaseAge: 10080` (minutes) in `pnpm-workspace.yaml` (A11, enabled 2026-07-08), which validates every lockfile entry on each install — so Renovate gates what gets *proposed* and pnpm gates the *existing lockfile*. Known unfixable transitive advisories are allowlisted in `pnpm-workspace.yaml` (`auditConfig.ignoreGhsas`). See [DEPLOYMENT.md → Dependency & security automation](DEPLOYMENT.md#dependency--security-automation-step-26). This automation supplements, not replaces, the manual `pnpm view` check when adding a brand-new dependency.

**Cross-package pin consistency (A10).** A dependency used by more than one workspace package (e.g. `drizzle-orm`, `react-hook-form`, `lucide-react`) is pinned by hand in each `package.json`; the CI `verify` lane runs **`pnpm lint:deps`** (`manypkg check`) to fail if those ranges ever diverge, so keep them in lockstep when bumping (auto-align with `pnpm fix:deps`). See [DEPLOYMENT.md → CI/CD](DEPLOYMENT.md#cicd-github-actions).

**Dead code / unused deps (A27).** The `verify` lane also runs **`pnpm knip`** (root `knip.jsonc`), which resolves the real import graph across all workspaces and fails on unused files, unused exports, and unused/phantom dependencies — the orphan classes `manypkg` can't see. Every `knip.jsonc` ignore carries its reason; intentional-but-unconsumed boilerplate API surface is tagged `@public` at the export site instead (see [CONVENTIONS.md → Exports](CONVENTIONS.md#exports)).

## Versions (verified 2026-06-17)

| Package | Version | Notes |
| --- | --- | --- |
| node | 24 (Krypton) | Active LTS as of mid-2026; 22 is in Maintenance |
| next | ^16.2.9 | App Router only; Pages Router is legacy |
| react / react-dom | ^19.2.7 | Required peer of Next.js 16 |
| babel-plugin-react-compiler | 1.0.0 | verified 2026-06-25 (D3); enables `reactCompiler: true` in `next.config.ts`. Exact-pinned (compiler iterates fast); React Compiler **1.0 stable**, targets React 19 natively so **no `react-compiler-runtime`** (that's only for React 17/18). Next gates the Babel pass behind an SWC analysis → Turbopack-compatible. See [DECISIONS.md](DECISIONS.md) |
| typescript | ^6.0.3 | **Stay on TS 6.** TS 7 GA'd (`7.0.2`, 2026-07-08) as the native Go compiler but **dropped the JS Compiler API** (`ts.createProgram`/`readConfigFile` etc.) — so `next build` and every library-API consumer can't use it until that API returns in **TS 7.1 (~Q4 2026)**. The `tsc` CLI works and is ~3.6× faster; cutover is gated on **Next.js TS7 support, not TS GA** (a 2026-07-13 attempt was reverted). See [BACKLOG.md](BACKLOG.md) |
| @biomejs/biome | ^2.5.0 | **v2 config differs from v1**: `assist.actions.source.organizeImports` (not top-level `organizeImports`); `files.includes` with negated globs (not `files.ignore`) |
| eslint | ^10.5.0 | Flat config only (eslintrc removed). Used solely for @next/eslint-plugin-next |
| @next/eslint-plugin-next | ^16.0.0 | Tracks Next.js major |
| turbo | ^2.9.18 | Remote cache is **opt-in/unwired** (local FS cache by default) — see [DEPLOYMENT.md](DEPLOYMENT.md#remote-caching-turborepo-opt-in) |
| pnpm | 11.7.0 | Pinned in packageManager field |
| tailwindcss | ^4.3.1 | v4: config in CSS, no tailwind.config.js |
| drizzle-orm | ^0.45.2 | |
| drizzle-kit | latest 0.x | CLI for migrations and Drizzle Studio — verify at install |
| better-auth | ^1.6.20 | also a direct dep of apps/web (route handler + proxy) |
| @trpc/server + @trpc/client | ^11.18.0 | verified latest 2026-06-22 |
| @trpc/tanstack-react-query | ^11.18.0 | tRPC v11's recommended TanStack integration (`useTRPC()` + `queryOptions`), replacing the older `@trpc/react-query` `createTRPCReact` adapter |
| @tanstack/react-query | ^5.101.0 | |
| superjson | ^2.2.6 | tRPC transformer (Date/Map over the wire); set on both initTRPC and the client link |
| zod | ^4.4.3 | **v4**: `z.email()` etc. replace `z.string().email()`; verify resolver/tRPC compat (both support v4) |
| zustand | ^5.0.14 | verified 2026-06-22 (Step 8); apps/web only; client UI state, server state stays in TanStack Query (see STATE.md) |
| react-hook-form | ^7.80.0 | verified 2026-06-22 (Step 7); dep of **both** @repo/ui (the shadcn `form`) and apps/web (`useForm`) |
| @hookform/resolvers | ^5.4.0 | verified 2026-06-22 (Step 7); apps/web only; peer rhf ^7.55.0, works with zod 4 |
| @t3-oss/env-nextjs | latest | verify at Step 2 |
| vitest | ^4.1.9 | verified 2026-06-23 (Step 14); `@repo/validators` (node) + `@repo/ui` (jsdom). 8 days old → normal caret. **v4 uses the built-in oxc transformer** (the automatic JSX runtime works with no `@vitejs/plugin-react`); a leftover `esbuild.jsx` config is ignored with a warning |
| @vitest/coverage-v8 | ^4.1.9 | verified 2026-06-23 (Step 14); V8 coverage provider, must match `vitest` exactly (lockstep peer). Not in the default `test` task — run `pnpm --filter <pkg> exec vitest run --coverage` |
| @vitejs/plugin-react | — | **NOT installed** (Step 14). `latest` `6.0.3` was published hours earlier, requires `vite ^8` only, and adds `babel-plugin-react-compiler`/`@rolldown/plugin-babel` peers. Vitest 4's oxc transformer already does automatic JSX, so the plugin is unnecessary — add it only if a test needs Fast Refresh or the React Compiler |
| vite | 8.0.16 (override) | verified 2026-06-23 (Step 14); pulled **transitively** by vitest (dep range `^6\|\|^7\|\|^8`), which otherwise resolves to the hours-old `8.1.0`. We never import vite directly, so it's pinned via `pnpm-workspace.yaml` `overrides` to an aged release (2026-06-01). Bump as newer 8.x ages out |
| jsdom | ^29.1.1 | verified 2026-06-23 (Step 14); DOM environment for `@repo/ui` component tests. `latest` `29.1.1` (2026-04-30, ~8 wk) → normal caret. Pure JS, no native build |
| @testing-library/react | ^16.3.2 | verified 2026-06-23 (Step 14); `render`/`screen` for component tests. Aged (2026-01) → caret. **Requires `@testing-library/dom` as a peer** (below) |
| @testing-library/dom | ^10.4.1 | verified 2026-06-23 (Step 14); required peer of `@testing-library/react` 16 — installed explicitly for determinism |
| @testing-library/jest-dom | ^6.9.1 | verified 2026-06-23 (Step 14); DOM matchers. Registered via `packages/ui/src/test/setup.ts` (`import "@testing-library/jest-dom/vitest"`), which also augments the matcher types |
| @playwright/test | ^1.61.0 | verified 2026-06-23 (Step 14); E2E in `apps/web` (`e2e/*.spec.ts`). `latest` `1.61.0` (8 days) → caret; newer tags are beta/alpha pre-releases. **No npm postinstall** — browsers install via the `playwright install chromium` CLI, not a build script (no `allowBuilds` change) |
| resend | ^6.14.0 | verified 2026-06-22 (Step 9); `@repo/email` dep. Peer `@react-email/render` satisfied by the explicit dep below |
| @react-email/components | ^1.0.12 | verified 2026-06-22 (Step 9); template primitives. npm flags it "deprecated" across all recent versions (generic message, not a successor pointer) — it's the canonical package and renders fine (verified via `email export`) |
| @react-email/render | ^2.0.9 | verified 2026-06-22 (Step 9); `render()` → HTML, and (P1-3) the plain-text part every `send()` attaches (`{ plainText: true }`); required by `resend` (peer) and used for the render check |
| react-email | 6.6.3 | verified 2026-06-22 (Step 9); CLI/dev-preview only (devDep). **Exact pin**: latest `6.6.4` was published hours earlier and tripped pnpm's `minimumReleaseAge` supply-chain gate, so the prior stable is used (a devDep CLI, never shipped). Bump once it ages out |
| stripe | 22.2.2 | verified 2026-06-22 (Step 10); `apps/web` (server client `apps/web/src/lib/stripe.ts`) **and `@repo/jobs`** (A13 cancel-on-delete worker handler) — pinned identically in both (manypkg-enforced). **Exact pin**: `latest` `22.2.3` was published hours earlier (same risk class as the Step-9 `react-email` trip); `22.2.2` (4 days old) cleared pnpm's `minimumReleaseAge` gate. `^`-ranges resolve to newest, so the conservative pin is exact — bump once `22.2.3`+ ages out. SDK major v22 pins `apiVersion` `2026-05-27.dahlia` (from `stripe/cjs/apiVersion.js`) |
| @stripe/stripe-js / @stripe/react-stripe-js | 9.8.0 / 6.6.0 | verified latest 2026-06-22 (Step 10) but **NOT installed** — the hosted Checkout flow redirects server-side to `session.url`, needing no client SDK. Install for a future client-side Elements / embedded-checkout surface |
| @sentry/nextjs | 10.59.0 | verified 2026-06-23 (Step 13); `apps/web` only. **Exact pin**: `latest` `10.60.0` was published hours earlier (same risk class as the Step-9/10 trips); `10.59.0` (4 days old) cleared pnpm's `minimumReleaseAge` gate. `^` resolves to newest → re-triggers the gate, so the pin is exact. v10 instrumentation pattern (`instrumentation.ts` + `instrumentation-client.ts` + `sentry.{server,edge}.config.ts`), wrapped via `withSentryConfig`. Pulls `@sentry/cli` (build script left `false` in allowBuilds — see toolchain gotchas). Next 16 `next build` uses Turbopack; `disableLogger` is deprecated/unsupported there and omitted |
| @logtail/next | ^0.3.1 | verified 2026-06-23 (Step 13); BetterStack logging, `apps/web` only. `latest` `0.3.1` (Jan 2026) is well clear of the age gate → normal `^` (0.x caret = patch range). Peers `next >=15`/`react >=18` ✓. Exports `log` + `withBetterStack` (aliased `withLogtail`). **Reads `BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_URL`** (legacy `LOGTAIL_*` also work), **not** `BETTERSTACK_API_KEY`; `log` falls back to console when unset |
| posthog-js | 1.391.2 | verified 2026-06-23 (Step 13); client SDK in `apps/web` (the root-layout `PostHogProvider`). **Exact pin**: `latest` `1.392.0` was published a day earlier; `1.391.2` (4 days) cleared the age gate. Pulls `core-js` (build script left `false` — postinstall is only a funding banner). `posthog-js/react` provides `PostHogProvider` |
| posthog-node | 5.38.2 | verified 2026-06-23 (Step 13); server SDK in `apps/web` (`lib/posthog.ts` singleton, feature-flag checks). **Exact pin** for determinism (`5.38.2` is 4 days old, cleared the gate). `isFeatureEnabled(key, distinctId)` for server-side flags; dependency `@posthog/core` |
| uploadthing | ^7.7.4 | verified 2026-06-23 (Step 11); server SDK + `createRouteHandler` in `apps/web`. `latest` `7.7.4` (Aug 2025) is well clear of pnpm's `minimumReleaseAge` gate, so a normal `^` range is used (exact pins were the exception for hours-old releases) |
| @uploadthing/react | ^7.3.3 | verified 2026-06-23 (Step 11); client helpers (`generateUploadButton`/`generateUploadDropzone`) in `apps/web`. Peers satisfied: `react ^19`, `next *` (Next 16), `uploadthing ^7.2.0` |
| meilisearch | ^0.58.0 | verified 2026-06-23 (Step 12); JS client in `apps/web` (server client `apps/web/src/lib/search.ts` + the search tRPC router + index action). `latest` `0.58.0` (published 2026-04-29) is well clear of pnpm's `minimumReleaseAge` gate, so a normal `^` range is used (0.x caret → patch range). Dependency-free, no native build script. **Note:** the client class is `Meilisearch` (one capital), not the older `MeiliSearch`. Engine: meilisearch server `getmeili/meilisearch:v1.48.1` via docker-compose |
| @upstash/ratelimit / @upstash/redis | ^2.0.8 / ^1.38.0 | Step 20; `apps/web` only — the distributed app-level rate-limit driver, lazily imported only when `UPSTASH_*` env is set |
| @manypkg/cli | 0.25.1 (exact) | A10 (2026-07-08); root devDep — `pnpm lint:deps` cross-package pin-consistency check in the CI `verify` lane |
| qrcode.react | 4.2.0 (exact) | 2FA (2026-07-08); `apps/web` — the enrollment QR (inline SVG, no network/CSP cost) |
| sonner | ^2.0.7 | A1 (2026-07-08); `@repo/ui` only — the `Toaster` primitive; `toast` re-exported from the same module so the app needs no second pin |
| @better-auth/passkey | 1.6.20 (exact) | Passkeys B3 (2026-07-09); `@repo/auth` — **pinned in lockstep with `better-auth` core** (the plugin reaches core internals; bump both together) |
| size-limit / @size-limit/file | 12.1.0 (exact) | Perf budget B3 (2026-07-10); `apps/web` devDeps — gates `.size-limit.json` on the emitted Turbopack chunks (see DEPLOYMENT.md → Performance budgets) |
| esbuild | 0.28.1 (exact) | Slim worker B3 (2026-07-10); `@repo/jobs` devDep — bundles `worker.ts` into the one-file worker image (`build.mjs`) |
| next-intl | 4.13.1 (exact) | i18n B4 (2026-07-11); `apps/web` — `[locale]` path routing + messages (see I18N.md) |
| knip | 6.24.0 (exact) | A27 (2026-07-12); root devDep — dead-code / unused-dep gate (`pnpm knip`, CI `verify` lane; config `knip.jsonc`). **Exact pin**: knip publishes near-daily — `latest` `6.26.0` was 2 days old and `6.25.0` 5 days (both fail the 7-day age gate), so the newest aged release is pinned; bump as newer releases age out |

## Key Architecture Decisions

**Why Drizzle over Prisma:** Smaller bundle, no codegen step (works with Turbopack), edge-native, closer to SQL. Prisma 7 closed the performance gap but Drizzle remains the leaner default.

**Why Better Auth over Clerk/NextAuth:** Self-hosted (no vendor lock-in), no MAU cost, data stays in your Postgres, clean plugin architecture. NOTE: An earlier research claim that "Better Auth absorbed Auth.js / NextAuth is in maintenance mode" came from an unverified SEO source and has been retracted — it did not inform this decision. The choice rests only on the verified merits above. Auth.js/NextAuth remains a legitimate alternative.

**Why tRPC for queries + Server Actions for mutations:** Server Actions have the best progressive enhancement story for mutations (form submits work without JS). tRPC gives end-to-end type safety for complex data fetching without a separate schema language.

**Why Biome + ESLint hybrid:** Biome (v2) is far faster and covers formatting + most lint rules. ESLint is kept only because `@next/eslint-plugin-next` has no Biome equivalent.

**Why platform-agnostic Docker:** The boilerplate is used across multiple projects that may deploy to different targets (Vercel, Railway, Fly.io, self-hosted). A `Dockerfile` + `next start` is portable. Vercel-specific features are additive, not foundational.

**Why Node 24:** Active LTS in mid-2026 per Node's fixed release cadence; Node 22 has dropped to Maintenance. Note: from Node 27 onward, every major goes LTS annually (cadence change).
