# Stack Reference

> When to load: tech choices, adding/upgrading dependencies, version questions, evaluating alternatives.

## Version Verification Policy

Versions below were verified against the **npm registry dist-tags** (authoritative), not blog posts — rows last verified 2026-07-22 (the recheck is recorded in [MAINTENANCE.md](../MAINTENANCE.md)'s watch history). Blog/SEO sources proved unreliable for version data. When adding or upgrading any dependency, confirm the current `latest` via `pnpm view <pkg> version` or `https://registry.npmjs.org/-/package/<pkg>/dist-tags` rather than trusting documentation or articles.

**Automated.** The manual "let a release age; verify provenance" discipline is now enforced by **Renovate** (`.github/renovate.json`, `minimumReleaseAge: "7 days"` + `rangeStrategy: "auto"` to preserve pins/carets) for updates and by a **`pnpm audit`** CI job + **CodeQL** for vulnerabilities. The same 7-day age gate is also enforced at the **install layer** by pnpm's own `minimumReleaseAge: 10080` (minutes) in `pnpm-workspace.yaml` (enabled 2026-07-08), which validates every lockfile entry on each install — so Renovate gates what gets *proposed* and pnpm gates the *existing lockfile*. Transitive advisories are remediated with scoped `overrides:` in `pnpm-workspace.yaml` where a compatible fixed version exists (the `auditConfig.ignoreGhsas` allowlist is for the truly unfixable — empty since 2026-07-15; removal conditions in [MAINTENANCE.md → Watch items](../MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done)). See [DEPLOYMENT.md → Dependency & security automation](DEPLOYMENT.md#dependency--security-automation-step-26). This automation supplements, not replaces, the manual `pnpm view` check when adding a brand-new dependency.

**Cross-package pin consistency.** A dependency used by more than one workspace package (e.g. `drizzle-orm`, `react-hook-form`, `lucide-react`) is pinned by hand in each `package.json`; the CI `verify` lane runs **`pnpm lint:deps`** (`manypkg check`) to fail if those ranges ever diverge, so keep them in lockstep when bumping (auto-align with `pnpm fix:deps`). See [DEPLOYMENT.md → CI/CD](DEPLOYMENT.md#cicd-github-actions).

**Dead code / unused deps.** The `verify` lane also runs **`pnpm knip`** (root `knip.jsonc`), which resolves the real import graph across all workspaces and fails on unused files, unused exports, and unused/phantom dependencies — the orphan classes `manypkg` can't see. Every `knip.jsonc` ignore carries its reason; intentional-but-unconsumed boilerplate API surface is tagged `@public` at the export site instead (see [CONVENTIONS.md → Exports](CONVENTIONS.md#exports)).

## Versions (rows last verified 2026-07-22)

**Exact pin** in the Notes below = `latest` failed the 7-day release-age gate at
verification time (the policy above) — a bump-when-aged pin, not a compatibility
ceiling.

| Package | Version | Notes |
| --- | --- | --- |
| node | 24 (Krypton) | Active LTS as of mid-2026; 22 is in Maintenance |
| next | ^16.2.11 | App Router only; Pages Router is legacy. 16.2.11 patched the 2026-07-22 advisory batch (9 GHSAs) |
| react / react-dom | ^19.2.7 | Required peer of Next.js 16 |
| babel-plugin-react-compiler | 1.0.0 | verified 2026-06-25; enables `reactCompiler: true` in `next.config.ts`. Exact-pinned (compiler iterates fast); React Compiler **1.0 stable**, targets React 19 natively so **no `react-compiler-runtime`** (that's only for React 17/18). Next gates the Babel pass behind an SWC analysis → Turbopack-compatible. See [DECISIONS.md](DECISIONS.md) |
| typescript | ^6.0.3 | **Stay on TS 6.** TS 7 GA'd (`7.0.2`, 2026-07-08) as the native Go compiler but **dropped the JS Compiler API** (`ts.createProgram`/`readConfigFile` etc.) — so stable `next build` and every library-API consumer can't use it until that API returns in **TS 7.1 (~Q4 2026)**. The `tsc` CLI works and is ~3.6× faster; a 2026-07-13 cutover attempt was reverted. **Movement:** Next canary ships experimental TS7 support since 2026-07-10 (`experimental.useTypeScriptCli`, vercel/next.js#95639) — **re-gate on that reaching a stable Next release**, not TS GA. See [BACKLOG.md](../BACKLOG.md) |
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
| zustand | ^5.0.14 | verified 2026-06-22; apps/web only; client UI state, server state stays in TanStack Query (see STATE.md) |
| react-hook-form | ^7.80.0 | verified 2026-06-22; dep of **both** @repo/ui (the shadcn `form`) and apps/web (`useForm`) |
| @hookform/resolvers | ^5.4.0 | verified 2026-06-22; apps/web only; peer rhf ^7.55.0, works with zod 4 |
| @t3-oss/env-nextjs | latest | verify at install |
| vitest | ^4.1.9 | verified 2026-06-23; `@repo/validators` (node) + `@repo/ui` (jsdom). **v4 uses the built-in oxc transformer** (the automatic JSX runtime works with no `@vitejs/plugin-react`); a leftover `esbuild.jsx` config is ignored with a warning |
| @vitest/coverage-v8 | ^4.1.9 | verified 2026-06-23; V8 coverage provider, must match `vitest` exactly (lockstep peer). Not in the default `test` task — run `pnpm --filter <pkg> exec vitest run --coverage` |
| @vitejs/plugin-react | — | **NOT installed.** Vitest 4's oxc transformer already does automatic JSX — add it only if a test needs Fast Refresh or the React Compiler |
| vite | 8.0.16 (override) | verified 2026-06-23; pulled **transitively** by vitest (dep range `^6\|\|^7\|\|^8`). Never imported directly, so it's pinned to an aged release via `pnpm-workspace.yaml` `overrides` — bump as newer 8.x ages out |
| jsdom | ^29.1.1 | verified 2026-06-23; DOM environment for `@repo/ui` component tests. Pure JS, no native build |
| @testing-library/react | ^16.3.2 | verified 2026-06-23; `render`/`screen` for component tests. **Requires `@testing-library/dom` as a peer** (below) |
| @testing-library/dom | ^10.4.1 | verified 2026-06-23; required peer of `@testing-library/react` 16 — installed explicitly for determinism |
| @testing-library/jest-dom | ^6.9.1 | verified 2026-06-23; DOM matchers. Registered via `packages/ui/src/test/setup.ts` (`import "@testing-library/jest-dom/vitest"`), which also augments the matcher types |
| @playwright/test | ^1.61.0 | verified 2026-06-23; E2E in `apps/web` (`e2e/*.spec.ts`); newer tags are beta/alpha pre-releases. **No npm postinstall** — browsers install via the `playwright install chromium` CLI, not a build script (no `allowBuilds` change) |
| resend | ^6.14.0 | verified 2026-06-22; `@repo/email` dep. Peer `@react-email/render` satisfied by the explicit dep below |
| @react-email/components | ^1.0.12 | verified 2026-06-22; template primitives. npm flags it "deprecated" across all recent versions (generic message, not a successor pointer) — it's the canonical package and renders fine (verified via `email export`) |
| @react-email/render | ^2.0.9 | verified 2026-06-22; `render()` → HTML, and the plain-text part every `send()` attaches (`{ plainText: true }`); required by `resend` (peer) and used for the render check |
| react-email | 6.6.3 | verified 2026-06-22; CLI/dev-preview only (devDep). **Exact pin** — `latest` tripped the release-age gate, so the prior stable is pinned; bump once it ages out |
| stripe | 22.2.2 | verified 2026-06-22; `apps/web` (server client `apps/web/src/lib/stripe.ts`) **and `@repo/jobs`** (the cancel-on-delete worker handler) — pinned identically in both (manypkg-enforced). **Exact pin.** SDK major v22 pins `apiVersion` `2026-05-27.dahlia` (from `stripe/cjs/apiVersion.js`) |
| @stripe/stripe-js / @stripe/react-stripe-js | 9.8.0 / 6.6.0 | verified latest 2026-06-22 but **NOT installed** — the hosted Checkout flow redirects server-side to `session.url`, needing no client SDK. Install for a future client-side Elements / embedded-checkout surface |
| @sentry/nextjs | 10.59.0 | verified 2026-06-23; `apps/web` only. **Exact pin.** v10 instrumentation pattern (`instrumentation.ts` + `instrumentation-client.ts` + `sentry.{server,edge}.config.ts`), wrapped via `withSentryConfig`. Pulls `@sentry/cli` (build script left `false` in allowBuilds — see toolchain gotchas). Next 16 `next build` uses Turbopack; `disableLogger` is deprecated/unsupported there and omitted |
| @logtail/next | ^0.3.1 | verified 2026-06-23; BetterStack logging, `apps/web` only (0.x caret = patch range). Peers `next >=15`/`react >=18` ✓. Exports `log` + `withBetterStack` (aliased `withLogtail`). **Reads `BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_URL`** (legacy `LOGTAIL_*` also work), **not** `BETTERSTACK_API_KEY`; `log` falls back to console when unset |
| posthog-js | 1.391.2 | verified 2026-06-23; client SDK in `apps/web` (the root-layout `PostHogProvider`). **Exact pin.** Pulls `core-js` (build script left `false` — postinstall is only a funding banner). `posthog-js/react` provides `PostHogProvider` |
| posthog-node | 5.38.2 | verified 2026-06-23; server SDK in `apps/web` (`lib/posthog.ts` singleton, feature-flag checks). **Exact pin.** `isFeatureEnabled(key, distinctId)` for server-side flags; dependency `@posthog/core` |
| uploadthing | ^7.7.4 | verified 2026-06-23; server SDK + `createRouteHandler` in `apps/web` |
| @uploadthing/react | ^7.3.3 | verified 2026-06-23; client helpers (`generateUploadButton`/`generateUploadDropzone`) in `apps/web`. Peers satisfied: `react ^19`, `next *` (Next 16), `uploadthing ^7.2.0` |
| meilisearch | ^0.58.0 | verified 2026-06-23; JS client in `apps/web` (server client `apps/web/src/lib/search.ts` + the search tRPC router + index action; 0.x caret → patch range). Dependency-free, no native build script. **Note:** the client class is `Meilisearch` (one capital), not the older `MeiliSearch`. Engine: meilisearch server `getmeili/meilisearch:v1.48.1` via docker-compose |
| @upstash/ratelimit / @upstash/redis | ^2.0.8 / ^1.38.0 | `apps/web` only — the distributed app-level rate-limit driver, lazily imported only when `UPSTASH_*` env is set |
| @manypkg/cli | 0.25.1 (exact) | root devDep (2026-07-08) — `pnpm lint:deps` cross-package pin-consistency check in the CI `verify` lane |
| qrcode.react | 4.2.0 (exact) | `apps/web` (2026-07-08) — the 2FA enrollment QR (inline SVG, no network/CSP cost) |
| sonner | ^2.0.7 | `@repo/ui` only (2026-07-08) — the `Toaster` primitive; `toast` re-exported from the same module so the app needs no second pin |
| @better-auth/passkey | 1.6.20 (exact) | `@repo/auth` (2026-07-09) — **pinned in lockstep with `better-auth` core** (the plugin reaches core internals; bump both together) |
| size-limit / @size-limit/file | 12.1.0 (exact) | `apps/web` devDeps (2026-07-10) — gates `.size-limit.json` on the emitted Turbopack chunks (see DEPLOYMENT.md → Performance budgets) |
| esbuild | 0.28.1 (exact) | `@repo/jobs` devDep (2026-07-10) — bundles `worker.ts` into the one-file worker image (`build.mjs`) |
| next-intl | 4.13.1 (exact) | `apps/web` (2026-07-11) — `[locale]` path routing + messages (see I18N.md) |
| knip | 6.24.0 (exact) | root devDep (2026-07-12) — dead-code / unused-dep gate (`pnpm knip`, CI `verify` lane; config `knip.jsonc`). **Exact pin** (publishes near-daily; the newest aged release is pinned — bump as newer releases age out) |

## Key Architecture Decisions

**Why Drizzle over Prisma:** Smaller bundle, no codegen step (works with Turbopack), edge-native, closer to SQL. Prisma 7 closed the performance gap but Drizzle remains the leaner default.

**Why Better Auth over Clerk/NextAuth:** Self-hosted (no vendor lock-in), no MAU cost, data stays in your Postgres, clean plugin architecture. NOTE: An earlier research claim that "Better Auth absorbed Auth.js / NextAuth is in maintenance mode" came from an unverified SEO source and has been retracted — it did not inform this decision. The choice rests only on the verified merits above. Auth.js/NextAuth remains a legitimate alternative.

**Why tRPC for queries + Server Actions for mutations:** Server Actions have the best progressive enhancement story for mutations (form submits work without JS). tRPC gives end-to-end type safety for complex data fetching without a separate schema language.

**Why Biome + ESLint hybrid:** Biome (v2) is far faster and covers formatting + most lint rules. ESLint is kept only because `@next/eslint-plugin-next` has no Biome equivalent.

**Why platform-agnostic Docker:** The boilerplate is used across multiple projects that may deploy to different targets (Vercel, Railway, Fly.io, self-hosted). A `Dockerfile` + `next start` is portable. Vercel-specific features are additive, not foundational.

**Why Node 24:** Active LTS in mid-2026 per Node's fixed release cadence; Node 22 has dropped to Maintenance. Note: from Node 27 onward, every major goes LTS annually (cadence change).
