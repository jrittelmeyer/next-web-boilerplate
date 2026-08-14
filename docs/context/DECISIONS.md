# Decisions

> When to load: you need the *why* behind an architectural choice — driver, env,
> auth-schema ownership, the tRPC/Server-Action split, Tailwind/shadcn wiring, or a
> dependency-pinning rationale. This is the consolidated decision log; the
> step-by-step history that produced it is in
> [../archive/PHASE_HISTORY.md](../archive/PHASE_HISTORY.md). Topic-specific detail
> also lives in the matching context doc (ARCHITECTURE / DATABASE / AUTH / API / UI /
> STACK) — this file is the cross-cutting "locked decisions" record.

## Locked decisions

### Foundations & framework defaults

- **Single env source of truth:** the monorepo-root `.env`. The web app loads it via
  `dotenv-cli` (`dotenv -e ../../.env -- next ...` in its scripts); `drizzle.config.ts`
  loads it via `process.cwd()` + `../../.env`. Do not introduce app-local `.env` files.
- **React Compiler is ON by default (Phase 3 · D3)** via top-level `reactCompiler: true`
  in `next.config.ts` — the modern default for a Next 16 / React 19 boilerplate:
  auto-memoization is the out-of-the-box story and manual `useMemo`/`useCallback` the
  exception. A build-time transform with no runtime surface (no env gate, no new origins,
  no CSP change) that keeps dev + build on Turbopack: the `babel-plugin-react-compiler`
  pass (devDep, **exact-pinned** — it iterates fast) runs behind an SWC analysis touching
  only JSX/Hook files. No `eslint-plugin-react-hooks` — it would contradict the locked
  "ESLint = `@next/eslint-plugin-next` only" boundary, and Biome already lints hooks. Full
  automatic mode; the per-component escape hatch is the `"use no memo"` directive.
- **Cache Components is ON by default (Phase 3 · D4)** via top-level `cacheComponents: true`
  in `next.config.ts` — the modern Next 16 rendering model: data/IO is **dynamic by
  default**, you opt INTO caching with `"use cache"` (`cacheLife`/`cacheTag`), and every
  route is **Partial-Prerendered** (a static shell + server-streamed dynamic holes). It
  composes here because `app/loading.tsx` gives every route the Suspense boundary a
  prerender fallback needs, and `next build` stays **green with the DB down** (request data
  deferred behind Suspense; the one cached DB read caches a `null` sentinel at build and
  self-heals at runtime). Showcase: **/posts** — a `"use cache"` count plus streamed feed;
  the write actions call **`updateTag("posts")`** for read-your-own-writes. **Tradeoff:**
  the route-segment config API (`export const dynamic`/`runtime`) is banned, so the Stripe
  webhook + `/api/health` rely on Next 16's **Node-by-default** route runtime (never set a
  global edge default, or the webhook loses Node crypto), and `/api/health` uses
  `await connection()`. The flag is top-level (the `experimental.` alias is deprecated).
- **`typedRoutes` evaluated and NOT adopted (Tier 4 · A31, 2026-07-12).** Prototyped
  end-to-end (`next typegen` → `tsc` → a green build with the required casts) and rejected
  on architectural fit, not breakage: the `[locale]` tree makes the generated route union
  vacuous-or-wrong for the unprefixed default-locale URLs the app actually navigates, and
  ~all links flow through `@/i18n/navigation`, whose published next-intl types are out of
  `typedRoutes`' reach — adoption's net diff was six `as Route` casts on runtime-correct
  code. If typed hrefs are ever wanted, the right tool is next-intl's `pathnames` routing
  map (which supersedes the flag); revisit only if locale path routing is dropped.
  Prototype record: [../archive/PHASE_HISTORY.md](../archive/PHASE_HISTORY.md).

### Database & data

- **Postgres driver:** node-postgres (`pg` + `Pool`), adapter `drizzle-orm/node-postgres`.
- **`apps/web` depends on `drizzle-orm` directly** (pinned `^0.45.2`, matching `@repo/db`)
  because tRPC procedures / Server Actions build queries with `eq` inline, per the API.md
  pattern. `@repo/db` re-exports the schema + client, not Drizzle operators.
- **Stripe persistence (Phase 3 · C4) — `stripeCustomerId` stays on `subscriptions`, the
  `user` table is untouched.** The user↔customer link is carried by the `subscriptions` row
  (`userId` + `stripeCustomerId`, FK → `user` cascade) and written exclusively by the
  webhook, so the Better-Auth-owned `user` schema gets **no** `additionalFields` entry (the
  `role`-column posture: don't widen the auth table for fields no auth API should write).
  `checkout.session.completed` owns the **insert** (it alone carries `userId`, via the
  Checkout Session `metadata` that `createCheckoutSession` stamps on); `updated`/`deleted`
  events **update by subscription id** only. `subscriptions.status` is plain `text` (no
  `stripe` import in `@repo/db`); `price` + `current_period_end` read from
  `sub.items.data[0]` (the pinned `2026-05-27.dahlia` API version moved them onto the
  item). Detail: [services/stripe.md](services/stripe.md).

### Calendar

Full mechanics: [calendar/model.md](calendar/model.md) · [api.md](calendar/api.md) ·
[acl.md](calendar/acl.md). Each of these was measured against PG 18 before `0020` was
written; the probe results are what changed three of them.

- **Civil time is the source of truth; instants are a derived cache.** `start_wall` +
  `start_tzid` is what the user meant; `start_at` exists only so a window query can use a
  btree. Storing the instant as truth is what makes a recurring 09:00 meeting drift an
  hour when the clocks change.
- **Postgres never performs the conversion — but not for the reason first written down.**
  The two-argument `timezone(text, timestamp)` behind `AT TIME ZONE <non-constant>` is
  marked **`IMMUTABLE`** on PG 18 (only the one-arg session-`TimeZone` form is `STABLE`),
  so it is perfectly legal in a generated column or a CHECK. We decline anyway: its
  fall-back-overlap resolution is `later` where ours is `compatible` (measured to differ
  by 30/60/**120** minutes), its tzdata is a separate copy from Node's ICU, and CHECKs
  re-run on **every UPDATE** — so a skew would make rows un-editable, including the UPDATE
  that soft-deletes them. ⚠️ A CHECK *building* proves nothing about volatility; Postgres
  does not enforce it there. Generated columns do, and are the valid discriminator.
- **The derived-instant guard is stored offsets + pure arithmetic, not a trigger.**
  `start_offset_minutes` / `end_offset_minutes` (`smallint NOT NULL`, **no default**) plus
  `CHECK (start_at = (start_wall - make_interval(mins => start_offset_minutes)) AT TIME
  ZONE 'UTC')`. This supersedes an approved `STABLE` trigger with a ±3600 s tolerance,
  which **rejected correct data** (an `Antarctica/Troll` overlap is 7200 s). The stored
  offset is also the only variant that pins *which branch* of a fall-back overlap was
  taken, and `NOT NULL` with no default is what makes a bypass writer fail loudly. The
  residual — a writer that lies consistently in both columns — is covered by *detection*
  in the integration suite, never by DDL.
- **`end_at - start_at <= interval '366 days'`, by subtraction.** `timestamptz_mi` is
  immutable; `timestamptz_pl_interval` is only `STABLE`. A correctness choice, not a
  legality one — and it makes the bound *elapsed* time, so the window query needs **367**
  days of slack.
- **The read surface is split, and the split is enforced.** `calendar_event_masters` for
  list/count/detail; the **window query reads the raw table** with `rrule IS NULL AND
  deleted_at IS NULL` spelled out. Measured: through the view the planner cannot prove the
  partial index applicable (`Seq Scan`), and the view hides the override rows a range scan
  must include — fast *and*, from Phase 2, silently wrong. An `EXPLAIN` assertion pins it.
  Phase 2 adds a third query to the same procedure, the **override-suppression scan**, and
  with it migration `0021`: `(recurrence_parent_id, recurrence_id) WHERE
  recurrence_parent_id IS NOT NULL`, **131× fewer index buffers and smaller than the index
  it replaces** (96 kB vs 176 kB). A plain btree stores NULL keys, so the non-partial
  variant is 55% *larger*, not the same size — measure index shapes, never infer them.
- **Recurrence is stored as a rule plus modifier rows, never as expanded events.** An
  `RRULE` string on the master, one `calendar_recurrence_dates` row per `EXDATE`/`RDATE`,
  and a full `calendar_events` row per per-occurrence override. Rows rather than a jsonb
  array because "skip this occurrence" as an array element is read-modify-write, so two
  users skipping two occurrences in the same second silently resurrect one; as a row it is
  `ON CONFLICT DO NOTHING`. Expansion happens **in the app, per window**, so an unbounded
  series never materialises.
- **The `RRULE` grammar has exactly one owner: `packages/calendar/src/rrule.ts`.**
  `@repo/validators/calendar` constrains only the string's *shape* — the same split
  `localDateTimeSchema` and `parseLocalDateTime` already use. Two RFC 5545 parsers in two
  packages would be two answers. Ours is deliberately stricter than the obvious reference
  implementation: measured, `rrule@2.8.1` accepts a rule with no `FREQ`, `COUNT` and
  `UNTIL` together, `INTERVAL=0`, and `COUNT=-1` (416,011 occurrences).
- **The differential oracle is a checked-in fixture, not a live dependency.**
  `rrule@2.8.1` runs **once**, at build time, into `src/__fixtures__/rrule-corpus.json`;
  the permanent test diffs our engine against that file and CI never executes a
  2.7-year-stale package. Two anti-tamper gates, because a red differential has exactly one
  one-line "fix" — rerun the generator — which converts the oracle into a mirror of the
  engine: the fixture was **committed before `expand.ts` was written**, and its SHA-256 is
  **pinned in the test**, so regenerating is a visible two-file diff a reviewer must
  approve.
- **`id` is always the series master's; an occurrence is named by `(id, recurrenceId)`.**
  The grid renders virtual occurrences and materialised overrides as identical chips and
  both ids are `uuid`, so an override's own id never leaves the server. A write whose
  target is an override is refused *whether or not it carries a scope* — the unscoped half
  is what stops an override being soft-deleted while its master is live, which is the one
  state the suppression query deliberately refuses to paper over.
- **Events soft-delete; calendars hard-delete.** A Phase-6 feed subscriber has to learn
  that a deletion *happened*, which a removed row cannot announce. A soft-deleted
  *calendar*, by contrast, would leave its events reachable by id and invisible in every
  list. Consequence, locked by `0020`: the UID unique spans soft-deleted rows, so the
  Phase-6 ICS upsert **resurrects** a deleted event and must say so in its import report.
- **All-day ends are exclusive** (RFC 5545 `DTEND` for `DATE` values), and all-day events
  are placed on the grid by their **wall dates**, in no zone at all. Placing them by
  instant is the bug that slides them a day for half the planet.
- **No `"public"` event visibility.** `proxy.ts` gates `PROTECTED_PREFIXES` with
  `startsWith` and `/calendar` is one, so no URL under it can serve a signed-out visitor. A
  visibility value no route can honour would be a lie in the schema; it lands with a public
  route or not at all. Phase 6's RSVP page therefore lives at `/rsvp/[token]`.
- **No platform-admin override anywhere in the calendar.** Deliberate, and stated in the
  schema, the ACL module and [acl.md](calendar/acl.md) — because every sibling authority
  module *has* one, so silence would read as an oversight. An admin who can read every
  user's meeting titles is a privacy incident with a UI.
- **An attendee's identity is their email; `user_id` is a nullable resolution of it.**
  An invitation names an address, and whether that address has an account here is a
  separate and changeable fact. This is what makes Phase 4's external attendee purely
  additive and a deleted user degrade into one rather than vanish from a guest list.
- **Attendees hang off the series master: overrides inherit, they never copy.** The
  alternative was considered and reversed. Copies would be unreadable in Phase 3
  (nothing reads attendees by an override id), would diverge immediately because RSVP is
  series-level, could not detect first materialisation, and would destroy the one thing an
  attendee row on an override is *for* in Phase 6 — a deliberate per-occurrence response.
  `splitSeries` is the sole exception, because the master it creates is addressable.
- **There is a second authority, and it deliberately exposes no role.**
  `getEventAccess` answers *event*-scoped questions (may this person read it, may they
  RSVP) on top of `getCalendarRole`. There is no `canWriteEvent` and a test asserts the
  module exports none: *attendance never grants write* has to be structural, because a
  caller holding an event id will reach for the event-shaped function.
- **RSVP is series-level in Phase 3, and that is a security decision, not a scope cut.**
  Per-occurrence RSVP would require an attendee — who has no write access to the
  organizer's calendar — to trigger an `INSERT` into `calendar_events` to materialise the
  override the response hangs off. The parent program called it free; it is a
  privilege-escalation shape.
- **An invitation is claimed by *verified* email, not by a signup hook.** Without the
  claim path, inviting someone who registers an hour later leaves their invitations list
  empty forever. The first successful claim stamps `user_id` in the same transaction,
  so an already-accepted invitation does not silently vanish when they change address.
- **A notification is two slots, not one:** `type` selects the sentence and
  (`body`, `title`) fill it, with `title IS NULL` meaning `body` is already complete.
  One slot cannot express "Alice declined Standup" — two variables *and* a status — and
  there is no stored user locale, so the sentence has to be picked at render time.
- **Through Phase 3 an invitation is a list at `/calendar/invites`, never a row on the
  invitee's month grid.** Putting it on the grid means a fourth `calendar.range` query,
  its own recurrence expansion and a share of `MAX_RANGE_ROWS` — roughly doubling the
  phase's risk on its hottest path. Phase 6 owes the fold — as a change of its **own**,
  not as a by-product of widening that query for sharing: sharing changes which calendar
  ids feed the existing queries, while the fold adds a fourth from a different source.
  Stated outright in `PROJECT_STATUS.md` and [api.md](calendar/api.md) rather than left
  as an apparent gap.
- **A reminder delivery is deduped by the occurrence's INSTANT, never its `recurrence_id`
  (Phase 5).** The alternative is not merely lossy, it does not function:
  `calendar_events.recurrence_id` is NULL on every non-override row, so a unique over it
  would be all-NULLs-distinct for ordinary events and every tick inside the grace window
  would re-send. It fails a second way where it is non-NULL — a `recurrence_id` survives a
  reschedule, so moving a meeting after its reminder fired would send nothing at the new
  time. An instant moves when the occurrence moves. Accepted cost: changing a reminder's
  *offset* after delivery does not re-fire for that occurrence. See
  [reminders.md](calendar/reminders.md).
- **The reminder sweeper's schedule registers unconditionally, and its clock is Postgres's
  (Phase 5).** "Register only when reminders exist" has no mechanism behind it — the single
  `boss.schedule` call runs once at boot with no re-registration path, so the first reminder
  a deployment ever created would never fire until a worker restart, silently. An `EXISTS`
  early-exit buys the same "costs nothing when unused" without the hole; the ~288
  `pgboss.job` rows/day are accepted, not avoided. One `SELECT now()` per tick supplies every
  bound so multiple workers agree and no host/container clock skew can shift the window.
- **`@repo/email` renders EVENT-ZONE time; reader-relative rendering is unimplemented for
  email (Phase 5).** `formatEventWhen` moved out of `apps/web` when the reminder sweeper
  became a second caller that cannot reach it. The rule narrows rather than relaxes: the
  event's own time, in its own zone, named — never a reader's locale, which this package
  cannot know. **Every email is therefore en-GB, including a reminder to an account holder
  whose zone `user_preferences` does store.** That is a knowing cut, not an oversight;
  reader-relative email rendering is a Phase-6 item.
- **A reminder offset is signed minutes, and that is exact-elapsed arithmetic (Phase 5).**
  `make_interval(mins => …)` on a `timestamptz` measures elapsed time, so a day-before
  reminder spanning a DST transition fires an hour early or late in local terms. The single
  column is what makes all-day semantics and the ICS `TRIGGER` mapping free, so the drift is
  accepted and written down — `expand.ts` names instants-based arithmetic as this repo's
  canonical silent bug, and it does not get to be silent here.

### Auth

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
- **Organizations / multi-tenancy = Better Auth's built-in `organization()` plugin
  (Tier 4 · Band 4).** The plugin path (no new dependency) over a hand-rolled tenancy
  model. Locked: the plugin tables are hand-maintained in `@repo/db` (the no-CLI core-auth
  ownership rule); the global `user.role` (platform) and org `member.role` (membership) are
  **two orthogonal role layers** that never collide, with org-role checks read fresh from
  the DB; `posts` is the org-scoped worked example via a **nullable** `organization_id`
  (NULL = personal workspace — zero-org clones behave exactly as before) while
  `uploads`/`subscriptions` stay per-user; v1 ships static `owner/admin/member` only
  (teams / dynamic runtime roles are documented one-flag upgrades). Detail:
  [auth/organizations.md](auth/organizations.md).
- **Two-factor auth = Better Auth's built-in `twoFactor()` plugin, TOTP + backup codes
  (Tier 4 · Band 2).** The plugin path over a hand-rolled OTP scheme (only new dep:
  `qrcode.react`). Locked: the `two_factor` table is hand-maintained in `@repo/db` (no-CLI
  rule; migration 0009); enable/disable/regenerate are password-gated; enrollment activates
  on the SECOND step (the first valid `verifyTotp()`), so an abandoned enroll can't lock
  anyone out; OAuth-only accounts can't enroll (2FA guards *password* sign-in); the sign-in
  challenge renders in-page (no plugin redirect); backup codes are shown once. The
  enroll/challenge surfaces are inline **by choice, not necessity** — the tall-`Dialog`
  blocker was a missing height cap, since fixed ([UI.md](UI.md) → Dialog); a 2026-07 Dialog
  mis-diagnosis was disproven — the canonical record is in
  [../archive/PHASE_HISTORY.md](../archive/PHASE_HISTORY.md). Detail:
  [auth/factors.md](auth/factors.md).
- **Passkeys / WebAuthn = Better Auth's `passkey()` plugin (Tier 4 · Band 3).** The plugin
  path over a hand-rolled WebAuthn ceremony. Locked: `@better-auth/passkey` is a separate
  package **exact-pinned in lockstep with core** (it reaches into core internals — version
  skew is a real break); passkeys are an **additive** credential (fully-passwordless is a
  non-goal; the `/account` card isn't password-gated, and removal can never lock an account
  out); rpID/origin derive from `BETTER_AUTH_URL` (no new env var, no new CSP origin); the
  `passkey` table is hand-maintained in `@repo/db` (migration 0012); sign-in takes no email
  (discoverable credentials). Detail: [auth/factors.md](auth/factors.md).
- **Admin plugin = Better Auth's built-in `admin()` plugin, adopted to AUGMENT the RBAC,
  not replace it (Tier 4 · Band 4).** Taken for the two capabilities only it can add —
  user **ban** + **impersonation** — while `lib/rbac.ts` + the audited `setUserRole` stay
  the **authoritative** gate and role-setter: plugin endpoints authorize off the
  cookie-cached session role (≤5 min stale), whereas the repo's boundary reads the role
  **fresh from Postgres**. Hence ban writes directly to the DB behind the fresh
  `requireAdmin()` (the plugin endpoint would forbid a just-promoted admin — verified by
  E2E); impersonation MUST use the plugin (only it can swap the session cookie) and carries
  the ≤5-min window as a documented residual inside a fresh-gated, audited Server Action;
  `allowImpersonatingAdmins` stays false. Migration 0014. Detail:
  [auth/rbac-admin.md](auth/rbac-admin.md).
- **CAPTCHA = Better Auth's built-in `captcha()` plugin, Cloudflare Turnstile, opt-in
  (Tier 4 · Band 2, A12).** Bot protection on sign-up / sign-in / password-reset (the
  plugin defaults). Turnstile over reCAPTCHA/hCaptcha: privacy-friendlier, no Google
  dependency, and its published always-pass/always-fail dummy keys make the flow verifiable
  end-to-end locally with no account. **Conditional registration is mandatory, not
  stylistic** — the plugin registers only when `TURNSTILE_SECRET_KEY` is set (with an empty
  secret it 500s the protected endpoints), **placed last before `nextCookies()`** (a
  conditional spread erases later plugins' `$Infer` augmentations). The widget is a small
  hand-rolled wrapper over Cloudflare's `api.js` (no new dependency). Detail:
  [auth/factors.md](auth/factors.md) → Bot protection / CAPTCHA.

### API & state

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
  Server Action example needs a shared schema. Framework-agnostic (zod only).
- **State split (Step 8) — the read-model boundary:** server/async state lives in **TanStack
  Query** (already wired through `TRPCReactProvider`); only **ephemeral client/UI state** lives in
  **Zustand**. Never copy server data into a store (two sources of truth that drift). Documented
  in [STATE.md](STATE.md); the litmus test is "if two tabs disagreed about this value, is
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
- **Realtime = SSE fed by Postgres LISTEN/NOTIFY, not a hosted service (Tier 4 · A22).** A
  route-handler **Server-Sent Events** stream driven by Postgres **LISTEN/NOTIFY** — no new
  infra (reuses `DATABASE_URL`, the pg-boss posture), correct across instances, no new
  dependency (`pg` + native `EventSource`), no new env or CSP change. Locked: **one
  dedicated LISTEN connection per instance + an in-process registry** fanning out to open
  streams (not a connection per browser); **one global channel + payload `userId` filter**
  (avoids dynamic SQL identifiers in `LISTEN`; per-user hashed channels / Redis pub/sub are
  the documented scale-ups); **SSE feeds the TanStack Query cache**, not a parallel store;
  and **persisted-first** — every notification is a row, the push is an enhancement, and
  the client backfills on re-open (a dropped connection becomes a self-healing refetch).
  Serverless caveat: [DEPLOYMENT.md](DEPLOYMENT.md#realtime-sse--serverless-caveat-tier-4--a22);
  mechanics: [API.md](API.md) → Realtime / SSE.

### UI & styling

- **Design tokens live in `tooling/tailwind/base.css`** (was a broken
  `@repo/tailwind-config/base` export). It owns the full shadcn **slate** theme: the
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
  And `--yes` does **not** auto-answer the "overwrite?" prompt when a registry dep already
  exists (it hangs) — delete, re-add, then `git checkout` the pre-existing files; the worked
  `form` example is archived in [../archive/PHASE_HISTORY.md](../archive/PHASE_HISTORY.md).
- **Step 7 form deps (verified on npm):** `react-hook-form` `^7.80.0` is a dep of **both**
  `@repo/ui` (the shadcn `form` component imports `Controller`/`FormProvider`/`useFormContext`)
  **and `apps/web`** (the example form calls `useForm`). `@hookform/resolvers` `^5.4.0` lives in
  `apps/web` only (where `zodResolver` is called); it satisfies its `react-hook-form ^7.55.0` peer
  and works with the repo's `zod ^4`. Per the CLI quirk above, the CLI's `radix-ui` install was
  removed from `apps/web` (already in `@repo/ui`).
- **The Server-Action form demo lives on the gated `/account` page.** An interim public
  `/profile` demo route was deleted once the real `(auth)` + `(dashboard)` surfaces existed;
  the signed-out `Unauthorized` branch is covered by the `updateUserName` unit test, not a
  public route (history: [../archive/PHASE_HISTORY.md](../archive/PHASE_HISTORY.md)).
- **RHF form ↔ FormData Server Action seam:** `UpdateNameForm` validates client-side with
  `zodResolver(updateNameSchema)`, then builds a `FormData` in `onSubmit` to call
  `updateUserName(formData)` and branches on `{ error } | { data }`. The shared schema/type
  are `updateNameSchema`/`UpdateNameInput`.

### i18n

- **Internationalization = `next-intl` with `[locale]` path routing (Tier 4 · Band 4).**
  `en` + `es`, the locale in the URL. Locked (the how is in [I18N.md](I18N.md)):
  - **`next-intl` over the alternatives** — the App Router dropped Next's built-in i18n
    routing, and `next-i18next` is a Pages-Router design; `next-intl` is App-Router-native.
    No new runtime service, no new env, no CSP change.
  - **Mode A: the locale lives in the URL, not a cookie or domain** — the only strategy
    that stays statically prerenderable under the `cacheComponents`/PPR posture (a
    cookie/`Accept-Language` locale reads request state in the layout, forcing every route
    dynamic), and it gives real per-locale URLs for SEO (hreflang, sitemap) for free.
  - **`localePrefix: "as-needed"`** — the default locale stays unprefixed, so `/`, `/login`,
    `/dashboard` are byte-identical to the pre-i18n URLs and existing bookmarks, the proxy
    matcher, and the E2E suite keep working unchanged.
  - **Coverage is partial (primary journey) by design** — a page that never calls a
    translation hook safely renders its literal strings, so the full i18n pattern is
    demonstrated end-to-end without translating every scaffold surface.
  - **`en` message values stay byte-identical to the extracted literals** — the E2E suite's
    text/role selectors match the message values (down to the `…` / curly `'`), keeping
    i18n a non-breaking refactor of existing copy rather than a rewrite.

### Security & CSP

- **CSP: static `'unsafe-inline'` default; nonce as a first-class BUILD-TIME mode, not the
  default (Phase 3 · M4 recipe → path-to-100 #10 mode, 2026-07-17).** The default ships a
  static CSP with `script-src 'self' 'unsafe-inline'`; the gold-standard nonce CSP
  (`'nonce-…' 'strict-dynamic'`) is the env-gated **`CSP_MODE=nonce`** — one codebase, one
  shared directive list (`src/lib/csp.ts`), both modes always compiled/linted + CI-covered
  (this superseded an earlier inert `.example` recipe, which could rot). Nonce isn't the
  default because a per-request nonce forces a per-request document shell — the opposite of
  Cache Components' static-shell model (D4) — so the switch toggles `cacheComponents`,
  making it unavoidably a **build-time** decision (`next.config.ts` bakes the resolved mode
  into every bundle; a runtime override is a verified no-op). `experimental.useCache: true`
  keeps the `"use cache"` showcase working in nonce mode; what nonce mode gives up is the
  static/PPR posture only. Mechanics, verification, and alternatives considered:
  [SECURITY.md](SECURITY.md) → CSP strategy.

### Services & jobs

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
- **`react-email` is exact-pinned `6.6.3`** (not `^`) — a frequently-publishing devDep CLI
  under the release-age gate; bump deliberately (also recorded in STACK.md; the original pin
  story is archived in [../archive/PHASE_HISTORY.md](../archive/PHASE_HISTORY.md)).
- **Search (Step 12) — read/write split + app-local client.** The Meilisearch client is an
  app-local server-only lazy guarded singleton (`apps/web/src/lib/search.ts`), **not** in
  `@repo/db` (kept pure) — same posture as `lib/stripe.ts`. Reads go through a **public tRPC
  query** (degrades to empty hits; since made `rateLimitedProcedure`); writes (indexing) go
  through an **auth-gated Server Action**. Client class is `Meilisearch` (not `MeiliSearch`).
  **Superseded:** the original example indexed a hardcoded constant; the real `posts` entity
  now indexes its own rows on DB write (`server/actions/post.ts`). See
  [services/meilisearch.md](services/meilisearch.md).
- **Observability (Step 13) — three SaaS integrations, app-local, all env-optional.**
  **Sentry** uses the v10 instrumentation pattern (instrumentation files +
  `withSentryConfig`); init is a no-op without a DSN. **BetterStack** = `@logtail/next`
  `log` used directly; reads `BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_URL`
  (NOT `BETTERSTACK_API_KEY`), console fallback when unset. **PostHog** = server-only lazy
  guarded singleton (flags) + client `PostHogProvider` (children passthrough → RSC boundary
  unchanged) + `/ingest` same-origin proxy rewrite. Pins are exact for sentry/posthog (age
  gate); `@logtail/next` is a caret. `allowBuilds` `@sentry/cli: false` + `core-js: false`.
  Detail: [services/sentry.md](services/sentry.md) ·
  [services/betterstack.md](services/betterstack.md) ·
  [services/posthog.md](services/posthog.md).
- **`next/after` for serverless log flush (Phase 3 · D4).** The tRPC request-telemetry
  middleware and the observability demo action schedule `log.flush()` via
  `after(() => log.flush())` instead of awaiting it inline: the flush runs *after* the
  response is sent, so a short-lived (serverless) runtime can't freeze before BetterStack's
  batched logs ship — without adding flush latency. Runs for **every** tRPC request; `log`
  falls back to console when BetterStack env is unset. `after` is Next's portable
  equivalent of a platform `waitUntil`.
- **Background jobs = pg-boss on the existing Postgres (Phase 3 · D7).** Chosen over
  Redis-backed (BullMQ) or hosted (QStash/Inngest) queues specifically to add **no new
  infra service** — pg-boss reuses `DATABASE_URL`; the cost is one extra process (the
  worker). Pinned **exact** (a very frequent publisher; bump deliberately). Locked: a
  separate **`@repo/jobs` package** (keeps the worker's deps out of the Next build; the
  producer imports only a thin `enqueue()`); **enqueue/worker split + graceful
  degradation** — `enqueue()` (`supervise:false`) logs and no-ops on any failure so it
  never breaks the triggering flow, the worker (`supervise:true`) owns the maintenance
  loop, jobs queue and drain if it's down, and the app builds/runs with the worker never
  started; **pg-boss owns its `pgboss` schema** (created on `start()`) — Drizzle does NOT
  manage it, see [DATABASE.md](DATABASE.md); the worker runs TS via the **`tsx` CLI with a
  dedicated `tsconfig.worker.json`** (stubs `server-only`, fixes the JSX runtime —
  mechanics in [services/jobs.md](services/jobs.md)). Example job `welcome-email`:
  `afterEmailVerification` enqueues instead of sending inline; the handler throws on a real
  provider error (pg-boss retries) but completes on the unconfigured no-op.
- **Observability dashboards-as-code = BetterStack, via a Node sync script (Phase 3).**
  BetterStack, not Grafana — it already carries this repo's logs, and its Uptime API gives
  HTTP monitors (→ `/api/health`) + heartbeats (→ the pg-boss worker) with no data-source
  to stand up (Grafana would need a metrics pipeline the app doesn't emit = new runtime
  surface). A Node sync script (`@repo/observability`), not Terraform: stays in the
  existing pnpm/tsx toolchain, no-ops when `BETTER_STACK_API_TOKEN` is unset (the
  `enqueue()`/`getStripe()` posture), upserts idempotently; config is **typed TS validated
  by Zod** (zero new deps) and `check` runs the parse credential-free in CI. Dev/CI-only
  and trivially deletable: never imported by the app; the only runtime touch is the
  worker's opt-in env-gated fire-and-forget heartbeat ping. Detail:
  [services/observability-dac.md](services/observability-dac.md).

### Tooling & DX

- **Dead-code detection = knip, gating, in the `verify` lane (Tier 4 · A27).** `pnpm knip`
  (root `knip.jsonc`; exact-pinned — a near-daily publisher under the age gate) fails CI on
  unused files / unused exports / unused-or-phantom dependencies — the import-graph orphans
  `manypkg`'s package.json-consistency check can't see. It **gates rather than reports** (a
  report-only lane rots) and sits as a step in `verify` (static analysis, no build/DB).
  Intentional-but-unconsumed boilerplate API surface is tagged **`@public` at the export
  site** (self-documenting, reviewed like code) rather than listed in config; `knip.jsonc`
  ignores are the last resort and each carries its reason. Adoption caught two real defects
  on day one (a phantom `server-only` dep of `apps/web`; a redundant
  `@next/eslint-plugin-next` devDep) — both fixed.
- **`checkpoint-autorun.mjs` standing push authorization (2026-08-14, owner-directed).**
  The owner asked for the `checkpoint` skill to run automatically whenever a session goes
  idle with pending work, so no session ends with unpushed context across the many
  projects they run. Confirmed via `AskUserQuestion` the same session: (1) full-auto
  tier — commit, push, and watch CI to green with no per-run confirmation prompt; (2)
  scope — `next-web-boilerplate` only, not a template default (see the repo-identity
  guard in `.claude/hooks/checkpoint-autorun.mjs`, since `.claude/**` ships to every
  generated project and this consent was never given by a project's actual owner); (3)
  trigger — only when the repo is actually dirty or has unpushed commits, so a Stop hook
  fires on every idle turn but is a silent no-op unless there's something to checkpoint.
  This is the authorization record the hook's `reason` text points back to — it is a
  one-time grant recorded here, not re-asserted from scratch by the hook itself. A
  `contrarian` review (Always-triggered — this is a template-surface edit) found and
  fixed two gaps before this shipped: the missing repo-identity guard (above), and a
  risk that a dirty tree mid-question (the assistant paused to ask the user something)
  would get misread as "done, checkpoint now" — the hook now skips when the last
  assistant message reads like a pending question, and when a rebase/merge/cherry-pick
  is in progress. Not re-confirmed periodically by design; revisit this entry (not the
  hook's prose) if the scope should ever change.
