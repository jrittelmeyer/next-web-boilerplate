# Decisions

> When to load: you need the *why* behind an architectural choice — driver, env,
> auth-schema ownership, the tRPC/Server-Action split, Tailwind/shadcn wiring, or a
> dependency-pinning rationale. This is the consolidated decision log; the
> step-by-step history that produced it is in
> [../archive/PHASE_HISTORY.md](../archive/PHASE_HISTORY.md). Topic-specific detail
> also lives in the matching context doc (ARCHITECTURE / DATABASE / AUTH / API / UI /
> STACK) — this file is the cross-cutting "locked decisions" record.

## Locked decisions

- **Postgres driver:** node-postgres (`pg` + `Pool`), adapter `drizzle-orm/node-postgres`.
- **Single env source of truth:** the monorepo-root `.env`. The web app loads it via
  `dotenv-cli` (`dotenv -e ../../.env -- next ...` in its scripts); `drizzle.config.ts`
  loads it via `process.cwd()` + `../../.env`. Do not introduce app-local `.env` files.
- **Better Auth rationale:** chosen on self-hosting/no-lock-in/plugins. The earlier
  "absorbed Auth.js / NextAuth dead" claim was unverified SEO and was retracted.
- **Auth schema centralized in `@repo/db`** (`schema/auth.ts`), not `@repo/auth`, so
  there's one migration history. `@repo/auth` imports the tables and passes them to
  `drizzleAdapter`. Tables use Better Auth's singular/camelCase defaults (documented
  exception to snake_case-plural); SQL columns stay snake_case.
- **Auth schema is hand-maintained**, not CLI-generated: `@better-auth/cli` (1.4.x)
  lags `better-auth` core (1.6.x). The hand-written schema is validated by the live
  auth flow exercising every table.
- **OAuth providers are env-gated:** GitHub + Google are wired in `auth.ts` but each
  registers only when its `*_CLIENT_ID`/`*_CLIENT_SECRET` pair is present, so the
  boilerplate runs on email/password alone.
- **Next 16 renamed `middleware` → `proxy`:** the gate lives in `apps/web/src/proxy.ts`
  (function `proxy`, same `config.matcher`). It's an optimistic cookie-only redirect;
  real authz is server-side via `auth.api.getSession`.
- **tRPC client = the new TanStack integration** (`@trpc/tanstack-react-query`,
  `useTRPC()` + `queryOptions`), **not** the older `@trpc/react-query` `createTRPCReact`
  adapter. Chosen as tRPC v11's recommended path for App Router (cleaner RSC
  prefetch/hydration). API.md was updated to match; STACK.md lists the package.
- **superjson is the tRPC transformer**, set in two places that must agree:
  `initTRPC...create({ transformer })` (`server/trpc/trpc.ts`) and the client
  `httpBatchLink({ transformer })` (`lib/trpc/client.tsx`). The live `user.health`
  check confirmed `Date` round-trips (`meta.values.time: ["Date"]`).
- **tRPC context** (`createTRPCContext` in `server/trpc/trpc.ts`) takes a `Headers`
  object so both call sites resolve the session identically: the fetch route handler
  passes `req.headers`; the RSC proxy (`lib/trpc/server.tsx`) passes `await headers()`.
- **Division of labor is enforced by convention, not types:** reads = tRPC
  (`publicProcedure`/`protectedProcedure`); writes = Server Actions
  (`server/actions/*`, return `{ error } | { data }`). No `mutation` procedures.
- **`@repo/validators` created at Step 5** (minimal: `updateNameSchema`) because the
  Server Action example needs a shared schema. Framework-agnostic (zod only); will
  grow with Step 7 (Forms).
- **`apps/web` now depends on `drizzle-orm` directly** (pinned `^0.45.2`, matching
  `@repo/db`) because tRPC procedures / Server Actions build queries with `eq` inline,
  per the API.md pattern. `@repo/db` re-exports the schema + client, not Drizzle operators.
- **Design tokens live in `tooling/tailwind/base.css`** (was a broken `@repo/tailwind-config/base`
  export — file didn't exist until Step 6). It owns the full shadcn **slate** theme: the
  `@custom-variant dark (&:is(.dark *))` (class-based dark mode), `@theme`/`@theme inline`
  mappings, `:root`/`.dark` CSS variables, the base layer, and the `tw-animate-css` import
  (so the design layer is self-contained; `tw-animate-css` is a dep of `@repo/tailwind-config`).
  `apps/web/globals.css` = `@import "tailwindcss"` + `@import "@repo/tailwind-config/base"`.
- **Tailwind v4 only auto-scans the importing app's own sources**, so `apps/web/globals.css`
  adds `@source "../../../../packages/ui/src/**/*.{ts,tsx}";` — without it, class names used
  only inside `@repo/ui` components produce no utilities. Verified live: `bg-primary`/
  `text-muted-foreground` appear in the compiled CSS.
- **`@repo/ui` ships raw `.tsx`** (no build step), so it's in `next.config.ts`
  `transpilePackages` alongside `@repo/db`/`@repo/auth`. `exports` map: `./components/*`,
  `./lib/*`, `./hooks/*`, `./globals.css`. Components self-import the util via the package
  name (`@repo/ui/lib/utils`), resolved by the exports map + a `paths` fallback in its tsconfig.
- **shadcn is configured for monorepo mode** (two `components.json`: `apps/web` aliases
  `ui`/`utils` → `@repo/ui`, while `components`/`hooks`/`lib` stay `@/`; `packages/ui` aliases
  everything to `@repo/ui`). Run `pnpm dlx shadcn@latest add <name> --cwd apps/web --yes` —
  shared primitives land in `packages/ui/src/components/`. Style `new-york`, base color `slate`,
  icon lib `lucide`. Components use the unified **`radix-ui`** package (not `@radix-ui/react-*`).
- **shadcn CLI quirk:** in monorepo mode it writes component files to `@repo/ui` but installs
  their npm deps into the `--cwd` project (`apps/web`). Move them — `radix-ui` belongs in
  `packages/ui` (where the components import it), not `apps/web`. Also: CLI output uses
  semicolon-free/no-trailing-comma style; run `biome check --write` to match repo formatting.
- **Step 7 form deps (verified on npm):** `react-hook-form` `^7.80.0` is a dep of **both**
  `@repo/ui` (the shadcn `form` component imports `Controller`/`FormProvider`/`useFormContext`)
  **and `apps/web`** (the example form calls `useForm`). `@hookform/resolvers` `^5.4.0` lives in
  `apps/web` only (where `zodResolver` is called); it satisfies its `react-hook-form ^7.55.0` peer
  and works with the repo's `zod ^4`. Per the Step-6 quirk, the CLI's `radix-ui` install was
  removed from `apps/web` (already in `@repo/ui`).
- **shadcn `form` add hit an overwrite prompt:** `form`'s registry deps include `button`+`label`
  (already present), and `--yes` does **not** auto-answer the resulting "overwrite?" prompt (it
  hangs). Workaround used: delete the two existing files, re-run the add (CLI writes all three
  cleanly), then `git checkout` to restore the committed `button`/`label`, keeping only the new
  `form.tsx`; then `biome check --write packages/ui`.
- **Form demo lived at a public `/profile` route** (Step 7→C1), intentionally **not** under the
  `(dashboard)` proxy gate, so both Server Action branches were exercisable in a browser: success
  when signed in, and the typed `Unauthorized` when not. The mutation stays guarded server-side in
  `updateUserName`. **Superseded by M3:** now that the `(auth)` UI + `(dashboard)` shell exist, the
  real, gated `/account` page hosts this form and `/profile` was deleted. The signed-out
  `Unauthorized` branch is still covered by the `updateUserName` unit test, not a public route.
- **RHF form ↔ FormData Server Action seam:** `UpdateNameForm` validates client-side with
  `zodResolver(updateNameSchema)`, then builds a `FormData` in `onSubmit` to call the Step-5
  `updateUserName(formData)` and branches on `{ error } | { data }`. The shared schema/type are
  `updateNameSchema`/`UpdateNameInput` (the UI.md "Form Pattern" snippet was reconciled from its
  old `nameSchema`/`NameInput` sketch).
- **State split (Step 8) — the read-model boundary:** server/async state lives in **TanStack
  Query** (already wired through `TRPCReactProvider`); only **ephemeral client/UI state** lives in
  **Zustand**. Never copy server data into a store (two sources of truth that drift). Documented
  in new `docs/context/STATE.md`; the litmus test is "if two tabs disagreed about this value, is
  that a bug?" → yes = server state, no = client state.
- **Zustand has no provider** — stores are plain hooks (`apps/web/src/stores/*-store.ts`, one per
  file, `use<Name>Store`). Nothing was added to `layout.tsx`; the only provider remains
  `TRPCReactProvider`. Example store `useUiStore` holds `sidebarOpen` — deliberately generic
  scaffold, not app logic.
- **Middleware decision:** `devtools` is wired but **dev-only** (`enabled: NODE_ENV ===
  "development"`), with action labels as the 3rd `set` arg; it ships in `zustand/middleware` (no
  new dep). `persist` is **intentionally NOT wired** — `localStorage` rehydration causes an SSR
  hydration mismatch — and is instead documented as an opt-in `skipHydration` recipe in STATE.md.
  `immer` not installed (optional peer); spread-`set` is enough for the scaffold.
- **`create<UiState>()(...)` is curried on purpose** — the empty `()` after the type arg is
  required for middleware to infer state under `strict` (Zustand+TS quirk, noted in STATE.md).
- **Email (Step 9) — `@repo/email` ships raw `.tsx`** (no build step), like `@repo/ui`: in
  `next.config.ts` `transpilePackages`; exports `.` (the server-only Resend client via
  `import "server-only"` in `client.ts`) + `./templates/*`. Templates stay pure JSX (no
  `server-only`) so the preview/render tooling can import them, and carry a default export for
  the `email` CLI. Deps: `resend`, `@react-email/components`, `@react-email/render` (the last
  also satisfies resend's `@react-email/render: *` peer).
- **Resend client constructs eagerly but lazily-safe** — `new Resend(process.env.RESEND_API_KEY)`
  only warns (doesn't throw) on a missing key; failures surface on `.send()`. Same posture as the
  `@repo/db` pool, so importing `@repo/email` for types/templates is cheap and key-free.
- **Email env is optional, not required** (`RESEND_API_KEY`, `EMAIL_FROM` both `.optional()` in
  `env.ts`) — the boilerplate must build/run without an email provider, mirroring the env-gated
  OAuth providers. Packages read `process.env.*`; validation stays at the app boundary.
- **`@repo/email` tsconfig sets `types: ["node","react","react-dom"]`** — the `react-library`
  preset includes none, and `client.ts` uses `process` while templates use JSX, so both are
  declared explicitly (validators only needed `["node"]`; ui needed none).
- **`react-email` is exact-pinned `6.6.3`** (not `^`): the `latest` `6.6.4` was published hours
  before Step 9 and tripped pnpm's `minimumReleaseAge` supply-chain gate (it auto-added a
  `minimumReleaseAgeExclude`, which was reverted). It's a devDep CLI (never shipped), so the prior
  stable is used; bump once `6.6.4`+ ages out. The three _runtime_ email deps all passed the gate.
- **Search (Step 12) — read/write split + app-local client.** The Meilisearch client is an
  app-local server-only lazy guarded singleton (`apps/web/src/lib/search.ts`), **not** in `@repo/db`
  (kept pure) — same posture as `lib/stripe.ts`. Reads go through a **public tRPC query**
  (`searchRouter.search`, returns `{ configured, hits }`, degrades to empty hits; made
  `rateLimitedProcedure` in Tier-0 A2); writes (indexing) go through an **auth-gated Server
  Action** using `addDocuments().waitTask()`. Client class is `Meilisearch` (not `MeiliSearch`).
  **Superseded at Step 28:** the original Step-12 example indexed a hardcoded `EXAMPLE_DOCUMENTS`
  constant via `indexExampleDocuments` (no `@repo/db` change / no migration then); the real
  `posts` entity now indexes its own rows on DB write — `createPost`/`deletePost` index/de-index
  and `reindexPosts` bulk-rebuilds (`server/actions/post.ts`). See [SERVICES.md](SERVICES.md).
- **Observability (Step 13) — three SaaS integrations, app-local, all env-optional.** **Sentry**
  uses the v10 instrumentation pattern (`src/instrumentation.ts` + `instrumentation-client.ts` +
  `sentry.{server,edge}.config.ts`, `withSentryConfig` in `next.config.ts`); init is a no-op
  without a DSN (no guarded singleton). **BetterStack** = `@logtail/next` `log` used directly in a
  Server Action; reads `BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_URL` (NOT
  `BETTERSTACK_API_KEY`), console fallback when unset. **PostHog** = `lib/posthog.ts` server-only
  lazy guarded singleton (flags) + client `PostHogProvider` in the root layout (2nd client provider,
  children passthrough → RSC boundary unchanged) + `/ingest` same-origin proxy rewrite. Pins are
  exact for sentry/posthog (latests were hours/days old → age gate); `@logtail/next` is a caret.
  `allowBuilds` `@sentry/cli: false` + `core-js: false`. Demo at public `/observability`.
- **Stripe persistence (Phase 3 · C4) — `stripeCustomerId` stays on `subscriptions`, the
  `user` table is untouched.** The webhook handler writes a new `subscriptions` table
  (`@repo/db`, FK → `user` cascade); the user↔customer link is carried by that row
  (`userId` + `stripeCustomerId`) and written exclusively by the webhook, so the
  Better-Auth-owned `user` schema gets **no** `additionalFields` entry (consistent with the
  `role`-column posture: don't widen the auth table for fields no auth API should write). The
  `checkout.session.completed` event owns the **insert** (it alone carries `userId`, via the
  Checkout Session `metadata` that `createCheckoutSession` stamps on — so `billing.ts` needed
  no change); `customer.subscription.updated`/`deleted` **update by subscription id** only.
  `subscriptions.status` is plain `text` (no `stripe` import in `@repo/db`); `price` +
  `current_period_end` read from `sub.items.data[0]` (the pinned `2026-05-27.dahlia` API
  version moved them off the top-level subscription onto the item).
- **React Compiler is ON by default (Phase 3 · D3)** via top-level `reactCompiler: true`
  in `next.config.ts` — chosen as a modern default for a Next 16 / React 19 boilerplate so
  the auto-memoization story is the out-of-the-box one (manual `useMemo`/`useCallback`
  becomes the exception, not the rule). It's a **build-time transform with no runtime
  surface**: no env gate (nothing to degrade — it ships in every build), no new origins, no
  CSP change. **Turbopack-compatible**: the compiler is the `babel-plugin-react-compiler`
  pass (devDep, **exact-pinned `1.0.0`** since it iterates fast), but Next runs it behind an
  SWC analysis that only touches JSX/Hook files, so dev + build stay on Turbopack at a small,
  localized cost (enabling it busts the `web:build` Turbo cache once). React 19 needs **no
  `react-compiler-runtime`** (that shim is React 17/18 only). **No `eslint-plugin-react-hooks`
  added** — that would carry the compiler's diagnostic rule but contradicts the locked
  "ESLint = `@next/eslint-plugin-next` only" boundary, and Biome's `recommended` preset
  already lints hooks (`useExhaustiveDependencies`, `useHookAtTopLevel`); the compiler also
  logs its own bail-outs at build time. Full automatic mode (not `compilationMode:
  "annotation"`); the per-component escape hatch is the `"use no memo"` directive.

- **Cache Components is ON by default (Phase 3 · D4)** via top-level `cacheComponents: true`
  in `next.config.ts` — the modern Next 16 rendering model, chosen so a Next 16 boilerplate
  actually demonstrates it: data/IO is **dynamic by default**, you opt INTO caching with the
  `"use cache"` directive (`cacheLife`/`cacheTag`), and every route is **Partial-Prerendered**
  (a static shell + server-streamed dynamic holes). It composes here for two reasons:
  `app/loading.tsx` already gives every route the Suspense boundary cacheComponents needs as a
  prerender fallback, and we keep `next build` **green with the DB down** by deferring request
  data behind Suspense (`connection()` / `headers()` / `searchParams`) and by giving the one
  cached DB read (`components/posts/post-stats.tsx`) a try/catch that caches a `null` sentinel
  at build and self-heals at runtime. The showcase is **/posts**: a synchronous page renders
  the static card shell while `<PostStats>` (a `"use cache"` count — `cacheLife("minutes")` +
  `cacheTag("posts")`), the session-aware composer, and the cursor-paginated feed each stream
  in behind their own boundary. The post write actions call **`updateTag("posts")`** (the
  Server-Action-native tag API) for **read-your-own-writes** — the author sees the new count in
  the same response. **Tradeoff:** cacheComponents **bans the route-segment config API**
  (`export const dynamic`/`runtime`), so the Stripe webhook + `/api/health` no longer pin
  `runtime = "nodejs"` — they rely on Next 16's **Node-by-default** route runtime (never set a
  global edge default, or the webhook loses Node crypto), and `/api/health` uses
  `await connection()` in place of `dynamic = "force-dynamic"`. No env gate, no new CSP origins
  (same as D3). The `experimental.cacheComponents` alias is deprecated; the flag is top-level.

- **`next/after` for serverless log flush (Phase 3 · D4).** The tRPC request-telemetry
  middleware (`server/trpc/trpc.ts`) and the observability demo action schedule `log.flush()`
  via `after(() => log.flush())` instead of awaiting it inline: the flush runs *after* the
  response is sent, so a short-lived (serverless) runtime can't freeze before BetterStack's
  batched logs ship — without adding flush latency to the response. Runs for **every** tRPC
  request (success + error); `log` falls back to console when BetterStack env is unset, so it's
  a no-op cost there. `after` is Next's portable equivalent of a platform `waitUntil`.

- **Background jobs = pg-boss on the existing Postgres (Phase 3 · D7).** Chosen over
  Redis-backed (BullMQ) or hosted (QStash/Inngest) queues specifically to add **no new infra
  service** — pg-boss reuses `DATABASE_URL`. Cost is one extra process (the worker). Pinned
  **exact** (`pg-boss@12.20.0`) because it publishes very frequently (multiple releases/week),
  so the floating-range + 7-day-age policy would otherwise churn; bump deliberately.
  - **New `@repo/jobs` package, not a script in `apps/web`:** keeps the worker's deps
    (pg-boss, `@repo/email`) out of the Next build, and lets the producer (web) import only a
    thin `enqueue()` while the consumer (worker) lives in the same package as the job
    contracts. The web app imports `@repo/jobs` (via `@repo/auth`) only on the server.
  - **Enqueue/worker split + graceful degradation:** `enqueue()` is an enqueue-only client
    (`supervise:false` → no polling/maintenance in the request process) wrapped so any failure
    (DB down, `DATABASE_URL` unset) logs and no-ops — it must never break the triggering flow.
    The worker (`supervise:true`) owns the maintenance loop. If the worker is down, jobs queue
    in `pgboss` and drain later. The app builds/runs with the worker never started.
  - **pg-boss owns its `pgboss` schema** (created/migrated on `start()`); Drizzle does NOT
    manage it — see [DATABASE.md](DATABASE.md). No migration conflict.
  - **Worker runs TS via the `tsx` CLI with a dedicated `tsconfig.worker.json`.** Two Node-vs-
    Next-bundler hazards had to be neutralized because the worker runs `@repo/email` (a
    server-only, JSX package) as plain Node: (1) `server-only`'s default export throws outside
    a React-Server bundler, so `tsconfig` `paths` maps it to an empty stub (`src/server-only.ts`)
    — correct, since the marker only guards *client* bundling and a worker is server-side; (2)
    tsx applies a tsconfig's `jsx` only to in-scope files, so `@repo/email`'s sibling `.tsx`
    transpiled with the **classic** runtime ("React is not defined") — `tsconfig.worker.json`
    pulls `../email/src` into scope so it gets the **automatic** runtime. The `tsx` CLI (not
    `node --import tsx`) is required: the bare loader applied `paths` but not the JSX transform.
  - **Example job — `welcome-email`:** moved `@repo/auth`'s `afterEmailVerification` from an
    inline send to `enqueue(JOBS.welcomeEmail, …)`; the worker calls `@repo/email`. Handler
    throws on a real provider error (pg-boss retries) but completes on the unconfigured no-op.
- **Observability dashboards-as-code = BetterStack, via a Node sync script (Phase 3).**
  Target is **BetterStack**, not Grafana: it already carries this repo's logs via
  `@logtail/next`, and its Uptime API gives HTTP *monitors* (→ `/api/health`) + *heartbeats*
  (→ the pg-boss worker) with no data-source to stand up. Grafana would need a Prometheus/
  metrics pipeline the app doesn't emit = new runtime surface, which the locked scope forbids.
  - **A Node sync script (`@repo/observability`), not Terraform:** stays in the existing
    pnpm/tsx toolchain (no new binary or state model), and the "no-op when `BETTER_STACK_API_TOKEN`
    unset" posture matches `enqueue()`/`getStripe()`/etc. exactly; Terraform's model doesn't
    degrade that way and is heavier for a personal starter. `sync` upserts idempotently
    (match by name → PATCH else POST). Config is **typed TS validated by Zod**, not YAML — so
    there's **no parser dependency** (and `zod`/`tsx`/`typescript` were already in the tree:
    **zero new deps**). `check` runs the Zod parse credential-free in CI's verify lane.
  - **Dev/CI-only + trivially deletable:** a standalone private package never imported by the
    app (zero build/bundle/CSP surface). The **only** runtime touch is the worker's opt-in,
    env-gated, fire-and-forget heartbeat ping (`packages/jobs/src/heartbeat.ts`) — worker-only,
    no-op when `BETTER_STACK_HEARTBEAT_URL` is unset. Removal = 4 steps in its README.

- **CSP: static `'unsafe-inline'` default; nonce as a first-class BUILD-TIME mode, not the
  default (Phase 3 · M4 recipe → path-to-100 #10 mode, 2026-07-17).** The default ships a
  **static CSP** with `script-src 'self' 'unsafe-inline'`; the gold-standard nonce CSP
  (`'nonce-…' 'strict-dynamic'`) is now the env-gated **`CSP_MODE=nonce`** — one codebase,
  both modes always compiled/linted, one shared directive list (`src/lib/csp.ts`) so the two
  emitters can't drift. This superseded M4's inert `.example` recipe (deleted): a supported
  mode with a CI lane can't rot the way a not-compiled recipe file can.
  - **Why nonce isn't the default — the `cacheComponents` conflict.** A per-request nonce must
    live in the **document shell's** inline scripts (next-themes' pre-paint script + Next's
    bootstrap), so the shell must render **per-request**. That is the opposite of Cache
    Components' static-shell model (D4): reading the nonce via `headers()` in the layout
    **fails the production build** under `cacheComponents: true` (`/_not-found: Uncached data
    accessed outside of <Suspense>`). Making nonce the default would force every page dynamic
    for all consumers to serve the security-mature minority; the mode switch serves both.
  - **Why build-time (not runtime):** the mode toggles `cacheComponents` — unavoidably a build
    decision — so `next.config.ts` bakes the resolved mode into every bundle (`env: { CSP_MODE }`),
    giving it `NEXT_PUBLIC_*` semantics: a runtime override is a verified no-op (a static build
    started with `CSP_MODE=nonce` serves byte-identical headers), never a half-flipped server
    (e.g. double CSP headers, which browsers enforce as the intersection).
  - **Nonce mode does NOT unwind D4's `"use cache"` showcase** (the M4 recipe did):
    `experimental.useCache: true` keeps the directive compiling and caching under
    `cacheComponents: false` — source-verified in the installed Next 16.2.9 (`useCache`
    *defaults from* `cacheComponents`; an explicit `true` survives it off) and live-verified
    (post create → `updateTag("posts")` busts the cached count in nonce mode). What nonce mode
    gives up is the static/PPR posture only.
  - **Verified end-to-end** (recipe 2026-06-27 · i18n rework 2026-07-12 · as a mode
    **2026-07-17**, incl. the `e2e/csp-nonce.spec.ts` matrix in the variable-gated `csp-nonce`
    CI lane): per-request rotating nonce on both locales, no script `'unsafe-inline'`, every
    `<script>` stamped, primary journeys with zero console CSP violations; the default build's
    headers stay **byte-identical** to pre-#10. Details: [SECURITY.md](SECURITY.md) → CSP strategy.
  - **Alternatives considered.** **(B) Keep the recipe-file posture:** rejected once re-litigated
    — an inert `.example` drifts silently (it had already needed one full rework for i18n) and
    its promise ("verified") decays without CI. **(C) Engineer coexistence** (keep
    cacheComponents by isolating the nonce read behind a `<Suspense>` boundary): **still
    deferred** — it likely reintroduces a theme flash (next-themes' anti-FOUC script would
    stream instead of being in the initial paint) and is unverified; revisit only if a fork
    needs both nonce CSP *and* the static-shell posture.

- **Organizations / multi-tenancy = Better Auth's built-in `organization()` plugin
  (Tier 4 · Band 4).** Teams + per-org membership + per-org roles, chosen as the plugin
  path (no new dependency — it ships inside `better-auth`) over a hand-rolled tenancy model.
  Four decisions were locked up front:
  - **Schema ownership follows the core-auth convention (no CLI).** The plugin's
    `organization`/`member`/`invitation` tables are **hand-maintained in `@repo/db`**
    (`schema/organization.ts`) and passed to the `drizzleAdapter` `schema` map — the SAME
    ownership rule as the core auth tables (one migration history; `@better-auth/cli` is not
    used, it lags core). Shapes were reconciled against the **installed** `better-auth`
    version's plugin model (read from `node_modules`, not a blog), then `db:generate` emitted
    the migration. Singular table names + camelCase keys (the documented exception);
    `updated_at` added per the repo "every table" rule (DEFAULT-covered, so plugin inserts
    never set it). `session.active_organization_id` (nullable, `input:false`) is added to
    `schema/auth.ts`.
  - **Two orthogonal role layers — they coexist.** The global `user.role` (`user`/`admin`) stays
    the **platform** role gating `/admin`; the org plugin's `member.role` (`owner`/`admin`/`member`)
    is the **membership** role gating org operations. They never collide. (The `admin()` plugin was
    since adopted to *augment* the platform layer — ban + impersonation — but the hand-rolled global
    RBAC stays the authoritative role gate; see the Admin-plugin decision below.) Org-role checks
    read the `member` row **fresh from the DB** (via the plugin's server API) — the same
    authoritative posture as `lib/rbac.ts`, not the cookie-cached session.
  - **Existing per-user data — `posts` gets scoped, `uploads`/`subscriptions` do not.** `posts`
    becomes the org-scoped worked example via a **nullable** `organization_id` (**NULL =
    personal workspace** ⇒ zero-org clones behave exactly as before, no backfill, no auto
    "personal org"). `uploads` stay per-user (avatars/personal files aren't tenant data);
    `subscriptions` stay per-user for now — **per-org billing is a future org-aware upgrade**,
    documented, not built (distinct from the Stripe live-verify, which is complete).
  - **Scope for v1: teams OFF, dynamic runtime roles OFF.** Static `owner/admin/member` only;
    the plugin's `teams`/`dynamicAccessControl` features (extra `team`/`team_member`/
    `organization_role` tables + `active_team_id`) are documented one-flag upgrades, not shipped —
    keeping the org-scoped-`posts` example and the invitation UI clean. Invitations degrade
    gracefully with email unset (the invitation row is still created; the UI surfaces a copyable
    accept link), mirroring the sign-up-verification-link posture.

- **Two-factor auth = Better Auth's built-in `twoFactor()` plugin, TOTP + backup codes
  (Tier 4 · Band 2).** Authenticator-app 2FA over the plugin path (no new runtime dep beyond
  `qrcode.react` for the enroll QR), not a hand-rolled OTP scheme. Decisions locked up front:
  - **Schema ownership follows the core-auth convention (no CLI).** The `two_factor` table +
    `user.twoFactorEnabled` flag are **hand-maintained in `@repo/db`** and passed to the
    `drizzleAdapter` `schema` map — same rule as the auth/org tables; shape reconciled against
    the **installed** `better-auth` dist (read from `node_modules`, not a blog), then
    `db:generate` emitted migration 0009.
  - **Password-gated state changes.** `enable` / `disable` / `generateBackupCodes` all require
    the account password, so a stolen session cookie alone can't turn 2FA on/off or rotate
    recovery codes — the same authoritative posture as the account danger-zone actions.
  - **Enrollment activates on the SECOND step, not the first.** `enable()` returns the secret +
    backup codes but writes a `verified:false` row and leaves `twoFactorEnabled:false`; the
    first valid `verifyTotp()` is what flips it on. So an abandoned enroll leaves the user
    **un-enrolled** — no lockout risk — and there's nothing to "clean up".
  - **OAuth-only accounts can't enroll.** 2FA guards *password* sign-in; a social-only user
    (no credential) sees a "set a password first" pointer, mirroring the password card. No
    attempt to bolt 2FA onto the OAuth path.
  - **INLINE, not modal — a deliberate UX call (the original blocker is now fixed).** Both the
    `/account` enroll card and the sign-in challenge are inline reveals, consistent with the
    page's other cards. This was *originally* forced by a `Dialog` bug — tall content dropped off
    the top of the viewport, unreachable. The earlier note blamed the `tw-animate-css` enter
    animation "overriding the translate transform," but **reproduction (2026-07-09) proved that
    wrong**: Tailwind v4 centers `DialogContent` via the standalone `translate` CSS property,
    which the zoom animation's separate `transform` never touches — the real fault was simply
    that `DialogContent` had **no height cap**. Fixed by adding `max-h-[calc(100dvh-2rem)]
    overflow-y-auto` (see [UI.md](UI.md) → Dialog + the `TallContent` story in
    `dialog.stories.tsx`); tall modals now scroll inside and stay centered. The 2FA/org surfaces
    stay inline by **choice**, not necessity.
  - **Sign-in challenge is handled by the app, not the client plugin's redirect.** `signIn.email`
    returns `{ twoFactorRedirect: true }` (no session) when 2FA is on; we set neither
    `twoFactorPage` nor `onTwoFactorRedirect`, so the login form inspects the flag and renders
    the code step in-place — the whole flow stays on one page (no full reload). "Trust this
    device" opts into a 30-day skip-the-challenge cookie (`trustDevice`), off by default.
  - **Backup codes shown once.** They're surfaced only at enroll (and on regenerate), with a
    copy affordance and a "save these now" note — the standard recovery-code posture.

- **Passkeys / WebAuthn = Better Auth's `passkey()` plugin (Tier 4 · Band 3).** Platform
  biometrics / roaming security keys over the plugin path, not a hand-rolled WebAuthn ceremony.
  Decisions locked up front:
  - **Separate package, exact-pinned in lockstep with core.** The plugin ships as its own
    `@better-auth/passkey` package (not part of `better-auth`), pinned to the **same exact
    version** as the core lib and bumped together — the plugin reaches into core internals, so a
    version skew is a real break. Client/server APIs were reconciled against the **installed**
    dist (read from `node_modules`), not a blog.
  - **Additive credential, not the sole one (v1).** Passkeys **supplement** password + OAuth; the
    `/account` card is shown to every signed-in user and is **not password-gated** (the session
    already authorizes enrolling, and removal can never lock an account out because another
    sign-in method remains). Fully-passwordless (passkey-only) is a deliberate non-goal here.
  - **rpID / rpName / origin derived from `BETTER_AUTH_URL`** (`passkeyRelyingParty()` in
    `config.ts`) — **no new env var**, so passkeys keep the "runs with env unset" contract
    (localhost fallback). WebAuthn is a **same-origin** browser API, so there's **no new CSP
    origin** either. `rpID` is the bare hostname (must stay stable across deploys); `origin` is
    pinned to `BETTER_AUTH_URL` and must match where the app is served (why a `:3100` prod-verify
    overrides `BETTER_AUTH_URL`).
  - **Schema ownership follows the core-auth convention (no CLI).** The `passkey` table is
    **hand-maintained in `@repo/db`** and passed to the `drizzleAdapter` `schema` map (aliased
    `passkeyTable` to avoid clashing with the plugin's `passkey` model name); shape reconciled
    against the installed dist, then `db:generate` emitted migration 0012 — same rule as the
    auth/2FA/org tables.
  - **Sign-in takes no email.** Passkeys are discoverable/resident credentials, so the login
    button calls `signIn.passkey()` with no identifier; the browser `get()` prompt selects the
    credential and `verify-authentication` establishes the session. A cancelled prompt
    (`AUTH_CANCELLED`) is swallowed. v1 is an explicit button; conditional-UI/autofill is a
    documented one-line upgrade.

- **Admin plugin = Better Auth's built-in `admin()` plugin, adopted to AUGMENT the RBAC, not
  replace it (Tier 4 · Band 4).** The heavier RBAC upgrade path, taken for the two capabilities it
  uniquely adds — user **ban** + **impersonation** — while the hand-rolled `lib/rbac.ts`
  (`requireAdmin`/`adminProcedure`) + the audited `setUserRole` action stay the **authoritative**
  gate and role-setter. Decisions locked up front:
  - **Augment, not replace — because every `/admin/*` endpoint reads the SESSION role, not the DB.**
    The plugin authorizes off `getSessionFromCtx` (the cookie-cached session role, ≤5 min stale via
    the Step-19 cache), whereas the repo's boundary reads the role **fresh from Postgres** on every
    check. Handing the whole gate to the plugin would regress that (a demotion would take up to 5
    min to bite; a *just-promoted* admin would be wrongly refused). So the fresh path stays the
    boundary and the plugin rides on top for the session-cookie mechanics only it can do.
    `adminRoles: ["admin"]` matches `ROLES` exactly → the plugin's default AC (`admin`/`user`) fits
    with no custom `ac`. Shapes reconciled against the installed dist; `db:generate` emitted
    migration 0014 (four columns, no new table).
  - **Ban writes DIRECTLY to the DB, fresh-gated — NOT through `auth.api.banUser`.** The plugin's
    ban endpoint re-checks the stale session role, so it would **forbid a just-promoted admin**
    (verified — a promote-then-ban E2E failed exactly that way). `banUser`/`unbanUser`
    (`server/actions/admin.ts`) instead gate with the fresh `requireAdmin()` and write the ban
    columns + revoke the target's sessions themselves. The plugin's own `session.create.before`
    hook still enforces the ban at sign-in (reads `banned` fresh, blocks + auto-lifts
    `banExpires`), so a direct write is the endpoint minus the stale re-check.
  - **Impersonation MUST use the plugin (a session-cookie swap) — so it carries the ≤5-min window
    as a documented residual.** Only the plugin can swap the session cookie, so `impersonateUser`
    can't avoid the endpoint's session-role check: a just-promoted admin must **re-sign-in first**.
    It's still wrapped in a fresh-gated, audited Server Action (this transport was chosen over the
    client method: the fresh gate blocks a just-*demoted* admin the plugin alone would trust ≤5 min,
    and it produces the audit rows the raw endpoint doesn't). `nextCookies()` flushes the swap; the
    UI full-navigates to load it. `stopImpersonating` is deliberately **not** admin-gated (during
    impersonation the caller session *is* the target, not an admin).
  - **`allowImpersonatingAdmins` stays false; scope is ban + impersonation only.** An admin can't
    impersonate another admin. create-user / set-password / set-email / remove-user /
    admin-session management + a custom access-control policy are documented, unused extensions —
    kept off so the augment surface stays minimal.

- **Internationalization = `next-intl` with `[locale]` path routing (Tier 4 · Band 4).** i18n over
  the App-Router-native library, `en` + `es`, with the locale in the URL. Decisions locked up front
  (the how is in [I18N.md](I18N.md)):
  - **`next-intl` over the alternatives.** Chosen over Next's own (removed) built-in i18n routing
    (App Router dropped it — it was a Pages-Router feature) and over `next-i18next` (built for the
    Pages Router / `getServerSideProps`, not RSC). `next-intl` is designed for the App Router: a
    `[locale]` segment, server + client message access (`getTranslations`/`useTranslations`), ICU
    formatting, and a Next plugin. No new runtime service, no new env, no CSP change — the message
    catalogs are code-split JSON in the bundle.
  - **Mode A: the locale lives in the URL (`app/[locale]/…`), not a cookie or a domain.** A URL
    segment is the only strategy that stays **statically prerenderable** under this repo's
    `cacheComponents`/PPR posture — `generateStaticParams` prerenders each locale and
    `setRequestLocale` keeps the render path static. A cookie- or `Accept-Language`-based locale
    reads request state in the layout, which forces **every route dynamic** (and can't be cached or
    CDN-served per-locale). It also gives real per-locale URLs for SEO (hreflang, distinct sitemap
    entries) for free. Domain/sub-path-per-locale was rejected as heavier infra for a starter.
  - **`localePrefix: "as-needed"` — the default locale stays unprefixed.** `/`, `/login`,
    `/dashboard` are byte-identical to the pre-i18n URLs (only non-default locales get a prefix:
    `/es`, `/es/login`). This preserves existing bookmarks/links and, critically, means the existing
    E2E suite + the proxy matcher keep working against the unchanged default URLs. The cost —
    `/en/*` 307-redirects to the unprefixed form — is invisible to users.
  - **Coverage is partial (primary journey), by design.** The landing page, the `(auth)` forms +
    shell, and the `(dashboard)` shell are translated; the throwaway demo/scaffold routes,
    `/account`, `/admin`, and `/organization` stay English. next-intl makes this safe — a page that
    never calls a translation hook just renders its literal string (no missing-key error) — so a
    boilerplate can demonstrate the full i18n pattern end-to-end without the churn of translating
    every scaffold surface. Extend by wiring more namespaces on real need.
  - **`en` message values are kept byte-identical to the extracted literals.** The E2E suite runs
    against the default (unprefixed, `en`) locale, so its text/role selectors match the message
    value — extracting a string must not change it (down to the `…` ellipsis / curly `'`). This
    keeps i18n a **non-breaking refactor** of the existing copy rather than a rewrite, and is the
    rule that let the feature land incrementally over six steps without a red E2E lane.
- **CAPTCHA = Better Auth's built-in `captcha()` plugin, Cloudflare Turnstile, opt-in (Tier 4 ·
  Band 2, A12).** Bot-protection on `/sign-up/email` · `/sign-in/email` · `/request-password-reset`
  (the plugin defaults) — distributed signup/credential-stuffing bots that IP rate limits can't stop.
  - **Turnstile over reCAPTCHA/hCaptcha.** Privacy-friendlier, no Google dependency, and — decisive
    for this repo — Cloudflare publishes **dummy test keys** (always-pass / always-fail site+secret
    pairs) that make the whole flow verifiable end-to-end locally with no account, which is exactly
    the "weak local verification" concern that had A12 parked. The plugin supports reCAPTCHA / hCaptcha
    / captchafox too; swap the `provider` in `captchaOptions()`.
  - **Conditional registration is mandatory, not stylistic.** The plugin is spread into `plugins`
    only when `TURNSTILE_SECRET_KEY` is set (`captchaOptions()` → `undefined` otherwise). Registered
    with an empty secret, its `onRequest` throws `MISSING_SECRET_KEY` (→ 500) on the protected
    endpoints — so leaving it OUT is what preserves the "runs with env unset" contract (same posture
    as `socialProviders`).
  - **Placed last before `nextCookies()`.** A conditional spread degrades every plugin *after* it from
    a fixed tuple position to a loose array element, erasing the `twoFactor`/`admin`/`organization`
    `$Infer` augmentations on `Session`/`User` (caught by `tsc`). Positioning it after all
    inference-contributing plugins preserves their tuple types, and the empty-spread case still leaves
    `nextCookies()` genuinely last at runtime.
  - **Hand-rolled widget, no new dependency.** The plugin ships with `better-auth`; the client widget
    (`captcha-widget.tsx`) is a small `forwardRef` wrapper over Cloudflare's `api.js` (explicit render
    with a `reset()` handle), chosen over a wrapper lib (e.g. `@marsidev/react-turnstile`) to avoid a dependency
    for a modest surface. The token rides the **`x-captcha-response`** header (`fetchOptions.headers`)
    that the plugin verifies server-side. **No new user-facing copy** → `en`/`es` messages untouched.
- **Realtime = SSE fed by Postgres LISTEN/NOTIFY, not a hosted service (Tier 4 · A22).** The
  realtime notifications example ships as a route-handler **Server-Sent Events** stream driven by
  Postgres **LISTEN/NOTIFY** — chosen to add **no new infra** (reuses `DATABASE_URL`, the pg-boss
  posture) and to be **correct across instances** (a `NOTIFY` from any instance reaches every
  instance's listener), matching the DB-backed rate-limit-storage decision. No new dependency
  (`pg` + native browser `EventSource`), no new env, no CSP change (same-origin).
  - **One dedicated LISTEN connection per instance + an in-process registry**, not a connection per
    connected browser. `@repo/db`'s `createPgListener` owns the raw long-lived `pg.Client` (a LISTEN
    connection can't come from the Drizzle pool — it must stay checked out); the app bus
    (`server/realtime/notification-bus.ts`) fans out to open streams via a `Map<userId, Set<handler>>`,
    a `globalThis` singleton (HMR-safe) that reconnects on a timer when the connection drops.
  - **One global channel + payload `userId` filter, not a channel per user.** Keeps the listener
    count at one and avoids **dynamic SQL identifiers** in `LISTEN` (a channel can't be a bind
    param). Cost: every instance's listener wakes for every notification and filters — negligible
    at this scale. Per-user hashed channels are the documented scale-up; Redis pub/sub is the
    higher-throughput swap behind the same `notify()` seam.
  - **SSE feeds the TanStack Query cache, not a parallel store.** The client `EventSource` prepends
    pushed rows into the `notification.list` query via `setQueryData` (the optimistic-posts pattern),
    so realtime data reads through the app's existing state surface — see [STATE.md](STATE.md).
  - **Persisted-first, so it degrades.** Every notification is a `notifications` row; the SSE push is
    an enhancement. The server doesn't replay the reconnect gap, so the client **backfills on
    re-open** — `EventSource.onopen` after a drop invalidates `notification.list` (A23) — turning a
    dropped connection into a self-healing refetch rather than a stale feed. **Serverless caveat**
    (function duration caps the stream; txn-mode poolers break `LISTEN`) is documented with fallbacks
    in [DEPLOYMENT.md](DEPLOYMENT.md#realtime-sse--serverless-caveat-tier-4--a22) — this is why A22
    sat in Band 4 (pivot-only) until picked. New user-facing copy → `en`/`es`
    `Notifications` namespace (the notification body itself is data, not chrome, so it isn't localized).
- **Dead-code detection = knip, gating, in the `verify` lane (Tier 4 · A27).** `pnpm knip` (root
  `knip.jsonc`; `knip@6.24.0` exact-pinned — a near-daily publisher under the 7-day age gate) fails
  CI on unused files / unused exports / unused-or-phantom dependencies — the import-graph orphans
  `manypkg`'s package.json-consistency check (A10) can't see. It **gates rather than reports**
  (the manypkg/Trivy/coverage posture — a report-only lane rots) and sits as a step in `verify`
  (static analysis, no build/DB; a dedicated job would buy no isolation and cost a full install).
  Intentional-but-unconsumed boilerplate API surface is tagged **`@public` at the export site**
  (self-documenting, reviewed like code) rather than listed in config; `knip.jsonc` ignores are the
  last resort and each carries its reason (the `auditConfig.ignoreGhsas` convention). Adoption
  caught two real defects on day one: `server-only` was a **phantom dependency** of `apps/web`
  (imported in 14 files, declared only by workspace siblings) — now declared — and
  `@next/eslint-plugin-next` was a redundant `apps/web` devDep (`@repo/eslint-config` declares it
  as its own dependency) — now removed.
- **`typedRoutes` evaluated and NOT adopted (Tier 4 · A31, 2026-07-12).** The stable top-level
  `typedRoutes: true` flag (Next 16.2.9; `experimental.typedRoutes` is deprecated) was prototyped
  end-to-end — `next typegen` → `.next/types/link.d.ts` → `tsc` → a full green build with the
  required casts — and rejected because the `[locale]` path architecture inverts its value:
  - **The generated route union can't represent this app's runtime URL space.** Every page lives
    under `app/[locale]/`, so the union is `` `/${slug}/login` ``-shaped dynamic patterns plus five
    static route handlers. Under `localePrefix: "as-needed"`, the **default-locale URLs the app
    actually navigates to have no locale segment** — so checking is simultaneously **vacuous** for
    single-segment paths (`redirect("/login")` type-checks by matching `/[locale]` with
    locale=`"login"`; the typo `/dashbord` passes the same way) and **wrong** for the rest
    (runtime-valid `/` and unprefixed multi-segment paths like `/admin/audit` are type errors).
    Verified by probe: the only genuinely caught class is a locale-*prefixed* multi-segment typo
    (`/es/dashbord`) — a URL shape this app never hand-writes.
  - **The app's real link surface is out of `typedRoutes`' reach.** ~All links/redirects flow
    through `@/i18n/navigation` ([I18N.md](I18N.md)), and next-intl's `createNavigation` types are
    **flattened into its published `.d.ts` at its own build time** — with no `pathnames` map,
    `href` is literally `string | UrlObject`, immune to the `next/link`/`next/navigation` module
    augmentation. Only the ten deliberate `next/navigation`/`next/link` exception call sites would
    be typed, and adoption's net diff there is **six `as Route` casts on runtime-correct code**
    (4× `router.push(redirectTo)`, 2× `href="/"`) — suppressing checks, not adding them. If typed
    hrefs are ever wanted here, the right tool is **next-intl's `pathnames` routing map** (checks
    the i18n layer itself), not `typedRoutes`.
  - **The flag is also a silent no-op under this repo's tsconfig.** TS include globs skip
    dot-directories, so the scaffold's explicit `.next/types/**/*.ts` include is what admits the
    generated types — and `apps/web/tsconfig.json`'s `exclude: [".next"]` filters it back out
    (exclude wins over include). Enabling for real would require dropping that exclude **and**
    adding a `next typegen` step before CI's `type-check` (the verify lane type-checks a clean
    checkout, before any build). Side finding, deliberately left as-is: the same exclude keeps
    Next's generated `validator.ts` (route-export conformance) out of `tsc`'s program; it passed
    cleanly when admitted during the prototype, but wiring it in would make `type-check` results
    depend on `.next` staleness — not worth the churn for a check the build already performs.
  - **No tooling fallout** (the one point in favor): with the flag on plus the casts, Turbopack,
    React Compiler, `cacheComponents`/PPR, the next-intl plugin, and the Sentry wrapper all built
    green, and next-intl internals + the vitest navigation stubs type-checked untouched. The
    rejection is architectural fit, not breakage — revisit only if the app ever drops locale path
    routing or adopts a `pathnames` map (which supersedes it anyway).
