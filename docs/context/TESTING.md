# Testing

> When to load: writing tests, running the test suite, adding test utilities, CI debugging.

## Stack

- **Unit + component:** Vitest 4.x (uses its built-in **oxc** transformer — the
  automatic JSX runtime works without `@vitejs/plugin-react`).
- **Integration (DB):** Vitest against a **real** Postgres, in `@repo/db`'s
  `__tests__/integration/` — opt-in via `test:integration` (see
  [Integration Test Pattern](#integration-test-pattern)).
- **E2E:** Playwright (`@playwright/test`), Chromium project.
- **Accessibility:** `@axe-core/playwright` (axe-core) inside the E2E suite — see
  [Accessibility](#accessibility-axe).
- **Coverage:** Vitest's V8 provider (`@vitest/coverage-v8`). Enforced under
  `--coverage` (the `test:coverage` task + CI), thresholds per package (see
  [Coverage](#coverage)).

## How the suite is wired

Vitest runs **per package**, orchestrated by Turborepo — each package that has
tests owns its own `vitest.config.ts` and a `"test": "vitest run"` script, and
the root `pnpm test` (`turbo test`) fans out to them. This matches the repo's
turbo-first model and lets each package pick the right environment:

| Package | Config | Environment | Example |
| --- | --- | --- | --- |
| `@repo/validators` | `packages/validators/vitest.config.ts` | `node` | `src/index.test.ts` (the `updateNameSchema` schema) |
| `@repo/auth` | `packages/auth/vitest.config.ts` | `node` | `src/config.test.ts` (the pure env-driven config helpers — P3-3) |
| `@repo/email` | `packages/email/vitest.config.ts` | `node` | `src/templates.test.tsx` (renders every template to HTML + plain text — A5) |
| `@repo/jobs` | `packages/jobs/vitest.config.ts` | `node` | `src/handlers/welcome-email.test.ts` (job contract + handler, `@repo/email` mocked — D7) |
| `@repo/ui` | `packages/ui/vitest.config.ts` | `jsdom` | `src/components/button.test.tsx` (renders the `Button`) |
| `@repo/db` | `packages/db/vitest.config.ts` | `node` | `__tests__/integration/posts.test.ts` (real Postgres — **opt-in only**) |
| `web` | `apps/web/vitest.config.ts` | `node` | `src/server/actions/post.test.ts` (Server Action branches; `@/env` stubbed) |

`@repo/db` deliberately has **no `test` script** (only `test:integration`), so the
default `pnpm test` / `turbo test` fan-out skips it — its tests need a live database
and run only where one exists (see [Integration Test Pattern](#integration-test-pattern)).

`apps/web` has a **`node`-environment Vitest project** (`apps/web/vitest.config.ts`)
for its Server Actions + `lib/*` logic (C2). The historical blocker was that importing
most app modules pulls in `@/env`, which validates environment variables at import and
throws without `DATABASE_URL`/`BETTER_AUTH_SECRET` — and the server-only `lib/*` modules
import `server-only`, which throws on import outside a React Server build. The config
clears both with two `resolve.alias` entries — `@/env` → a test stub (`src/test/env.stub.ts`)
and `server-only` → an empty module (`src/test/empty.ts`) — so any app module can be
unit-tested; the individual tests additionally mock the heavy workspace deps (`@repo/db`,
`@repo/auth`, search, rate-limit, `next/*`). Coverage is scoped to just the tested modules
(see [Coverage](#coverage)). The app also owns the **E2E** tests (`apps/web/e2e/`).

The `@repo/ui` config has two extra settings worth knowing:
- `resolve.alias` maps `@repo/ui` → `./src` so a component's own subpath imports
  (e.g. `@repo/ui/lib/utils`) resolve to the raw source during tests.
- `setupFiles: ["./src/test/setup.ts"]` registers the
  `@testing-library/jest-dom` matchers (`toBeInTheDocument`, `toHaveAttribute`, …).

## File Conventions

| Test type | Location | File pattern | Runner |
| --- | --- | --- | --- |
| Unit (pure functions) | Co-located with source | `*.test.ts` | Vitest |
| Component | Co-located with the component | `*.test.tsx` | Vitest (jsdom) |
| Integration (DB, API) | `packages/db/__tests__/integration/` | `*.test.ts` | Vitest via `test:integration` (needs a live DB — see below) |
| E2E (browser flows) | `apps/web/e2e/` | `*.spec.ts` | Playwright |

The split is enforced by convention: **Vitest owns `*.test.*`**, **Playwright
owns `*.spec.*`**. Each Vitest config `include`s only `src/**/*.test.*`, so the
app's Playwright specs are never picked up by a unit run.

## What to Test

**Always test (Vitest):**
- Zod validators in `@repo/validators` (pure, fast).
- Business-logic utilities in `packages/` — when the logic lives inside a module with
  heavy imports, extract it: `@repo/auth`'s `src/config.ts` (P3-3) pulls the pure,
  env-driven helpers (provider registration, trusted-origins parsing, the email-change
  token decode) out of `auth.ts` so they unit-test in plain `node` without the
  DB/email/`server-only` wiring; `config.test.ts` stubs env per test via `vi.stubEnv`.
- Server Actions / tRPC procedure logic — the `apps/web` Vitest project covers the
  branches (auth gate, rate-limit block, validation failure) with `@/env` stubbed and
  the workspace deps mocked. `src/server/actions/post.test.ts` + `admin.test.ts` and
  `src/lib/rate-limit.test.ts` + `rbac.test.ts` are the worked examples; the DB-backed
  data-layer mirror lives in `@repo/db`'s integration tests (below).
- Email template rendering (A5) — `@repo/email`'s `src/templates.test.tsx` renders every
  template to HTML **and** the plain-text alternative through the same
  `@react-email/render` calls the send path uses (`render(el)` / `render(el, { plainText:
  true })`), asserting non-empty output carrying the dynamic content (name, links). A
  companion `send.test.tsx` locks the graceful-degradation contract (unconfigured →
  `{ error }`, never throws) across all eight helpers. Catches a broken template that
  would otherwise only surface via a manual `email export`.

**Test with Playwright:**
- Authentication flows — `e2e/auth.spec.ts` drives the real C1 UI (sign up → land on
  `/dashboard`, sign in, sign out re-gates, `/posts` recognizes the session) via the
  `(auth)`/`(dashboard)` pages. Helpers in `e2e/support/auth.ts` fill the forms.
- The example entity end-to-end — `e2e/posts.spec.ts` (create → list → delete).
- RBAC / admin surface (D2) — `e2e/admin.spec.ts` (promote/demote another user through
  the `/admin` UI; the self-demotion guard shows "(you)"; a non-admin 404s and never
  sees the Admin link).
- The `/account` surface — `e2e/account.spec.ts` (P3-1: serial one-user lifecycle —
  name change, immediate email change, password change + re-login; see
  [Cookie-cache staleness](#playwright-pattern) below), `e2e/account-sessions.spec.ts`
  (P2-1: revoke across two browser contexts), and `e2e/account-deletion.spec.ts`
  (P2-2: danger zone).
- Organizations (Tier 4 · Band 4) — `e2e/organization.spec.ts`: **serial across two
  browser contexts** (an owner and the invitee — the accept flow is genuinely a *second*
  user), covering create → invite → the three accept-link states (signed-out prompt /
  wrong-account mismatch / accept) → membership, then post org-scoping (publish under the
  org, switch to Personal from the header, reload `/posts`, the org post drops, switch
  back and it returns). Email is off in CI, so the accept link's id is read from the
  authenticated `list-invitations` endpoint (the same source the UI's "Copy link" uses)
  rather than a delivered mail; the workspace switch waits on the `set-active` round-trip
  so the session cookie is fresh before `/posts` reloads and re-scopes.
- Two-factor auth (Tier 4 · Band 2) — `e2e/two-factor.spec.ts`, **serial**, two throwaway
  users: one runs the `/account` lifecycle (enroll → regenerate backup codes → disable),
  the other leaves 2FA on and proves the **sign-in challenge** (sign out → sign in →
  answer the TOTP step → `/dashboard`, then again via the **backup-code** fallback). The
  test plays the authenticator app itself with an in-repo RFC-6238 TOTP generator —
  `e2e/support/totp.ts` (`generateTotp` + `secretFromOtpauthUri`, ~30 lines, **no
  dependency**, the same "no library for a tiny stable primitive" ethos as
  `lib/user-agent.ts`), computing a live 6-digit code from the enrollment secret. Two
  mechanics that matter: (1) the 2FA UI is **inline** and its "Confirm your password"
  label collides with other `/account` cards, so every interaction is scoped to the 2FA
  card (`[data-slot="card"]` filtered by its heading); the secret + a backup code are read
  off the enroll screen (the manual-key `<code>` and the backup-codes `<ul>`). (2) the
  `support/auth.ts` `signIn` helper waits for `/dashboard`, which **can't** happen while
  2FA challenges, so the challenge is driven **inline** (fill the code field, click Verify)
  rather than through the helper. TOTP verify is stateless in the plugin (no used-code
  tracking), so replaying the same-window code across enroll and sign-in is safe.
- Accessibility — `e2e/a11y.spec.ts`: the public pages (`/`, `/posts`, `/login`,
  `/signup`) plus the signed-in `/account`, `/admin`, and `/admin/audit` surfaces (see
  [Accessibility](#accessibility-axe)).
- Audit read UI (B2) — `e2e/admin-audit.spec.ts`: seeds a target user + a future-dated
  `role_changed` audit row, then asserts `/admin/audit` renders it with the `LEFT JOIN`-resolved
  target email + label/detail, and that garbled / past-the-end cursors degrade to a valid page.
- Admin plugin (Tier 4 · Band 4) — `e2e/admin-ban.spec.ts` (ban blocks sign-in + revokes
  sessions; unban restores) and `e2e/admin-impersonate.spec.ts` (cookie-swap round-trip via a
  cache-bypassed `get-session` probe; the admin must re-sign-in after promotion — see AUTH.md).
- Passkeys (Tier 4 · Band 3) — `e2e/passkey.spec.ts`: full lifecycle (register → rename →
  sign out → passkey sign-in → delete) via Chrome's CDP **virtual authenticator** (see AUTH.md).
- GDPR data export (Tier 4 · Band 3) — `e2e/data-export.spec.ts`: fresh sign-up → download →
  asserts the real credential password hash + live session token are **absent** from the JSON.
- i18n (Tier 4 · Band 4) — `e2e/i18n.spec.ts`: **DB-free** public flows — switcher en↔es,
  localized `<title>`, hreflang links, locale-preserving auth redirect (see [I18N.md](I18N.md)).
- Realtime notifications (Tier 4 · A22) — `e2e/notifications.spec.ts`: **two browser
  contexts** for the same user, both waiting for the feed's "Live" stream badge before
  acting; device B clicks "Send test notification" and device A — which never reloads —
  receives the row + unread badge over its open `EventSource` (the NOTIFY → single
  LISTEN client → in-process fan-out path), then "Mark all read" clears the badge
  optimistically.
- The payment flow (Stripe test mode), file upload, search results.

**Don't bother testing:**
- Trivial presentational UI, framework code (Next.js router, Drizzle itself),
  third-party SDK behavior.

## Coverage

Coverage runs only under `--coverage`, so a plain `pnpm test` stays fast and
warning-free. The dedicated task generates + **enforces** it:

```bash
pnpm test:coverage                          # all packages (turbo test:coverage)
pnpm --filter @repo/ui exec vitest run --coverage   # one package
```

Each test-bearing package owns its `coverage` block (provider `v8`, reporters
`text`/`json`/`lcov`, `all: true` so untested files count too) and its own
`thresholds` in `vitest.config.ts`. A breach fails `vitest` (exit 1), so CI's
`pnpm test:coverage` step gates on it:

| Package | Thresholds | Why |
| --- | --- | --- |
| `@repo/validators` | 100% lines/functions/branches/statements | Pure logic — exactly what a coverage gate should hold, and the package already sits at 100%. A new untested schema fails the gate, which is the point. |
| `@repo/ui` | 11% lines/statements, 10% functions, 27% branches | A regression **floor**, not a target — most components are shadcn primitives we intentionally don't unit-test ("don't test trivial presentational UI", above), so the `all: true` aggregate sits low by design and each new untested primitive erodes it slightly. The floor tracks the value the `button`/`empty-state`/`theme-toggle`/`textarea` smokes hold, with a small margin; re-base it only on an actual breach (lowering a passing floor weakens the guard). |
| `web` | 95% lines/functions/statements, 88% branches | Coverage `include` is an **explicit file list** in `apps/web/vitest.config.ts` (the source of truth — **25 modules as of A22**: eight `server/actions/*` + sixteen `lib/*` + `server/realtime/sse.ts`, e.g. `auth-redirect`, `data-export`, `consent`, `audit-format`, `i18n-metadata`) — not all of `src/`, which would force a near-zero floor. ⚠️ **A newly-tested `lib/*` / `server/actions/*` file is NOT measured until its path is added to that list** (the tell: the coverage totals don't move). They sit at 100% statements/lines/functions and ~91% branches (the gap is defensive `?? fallback` paths a failed Zod parse / non-Error throw can't reach); the floor sits a few points under, so a real drop fails CI without churning on those. |
| `@repo/auth` | 90% lines/functions/statements, 80% branches | `include` is scoped to `src/config.ts` — the pure env-driven config helpers extracted from `auth.ts` (P3-3), sitting at 100% on all four metrics under the house 90/90/80/90 floor. `auth.ts` itself is only the `betterAuth()` composition over DB/email/jobs wiring; every E2E auth flow exercises it, so it stays out of the unit gate. |
| `@repo/email` | 95% lines/functions/statements, 90% branches | `include` is scoped to `src/templates/**` — the render smoke tests take every template to HTML **and** plain-text (both prop-set and default-prop passes), sitting at 100% on all four metrics; the floor sits a few points under so adding an untested template trips the gate. `send.tsx`/`client.ts` (the Resend + `server-only` bootstrap, the email analog of jobs' `boss.ts`) stay out of the `include` — smoke-tested only for graceful degradation. |
| `@repo/jobs` | 90% lines/functions/statements, 80% branches | `include` is scoped to the pure parts — `handlers/**` + `queues.ts` (the job contract + handler logic, `@repo/email` mocked); the pg-boss I/O bootstrap (`boss.ts`/`worker.ts`) is left to the `test:integration` round-trip in the `e2e` lane. |

`@repo/db`'s integration tests are **not** part of the coverage gate (they're DB-backed
and run via `test:integration`, separately from the `--coverage` unit run). To tighten
a bar, edit the package's `thresholds`; a breach fails `vitest` (exit 1) and the CI
`test:coverage` step with it.

**CI upload.** The `verify` job runs `pnpm test:coverage` and uploads every
`packages/*/coverage/` as a build artifact (always, via `if-no-files-found:
ignore`). If a `CODECOV_TOKEN` secret is set, it also publishes to Codecov;
without the secret that step is skipped, so the pipeline is self-contained. See
[DEPLOYMENT.md](DEPLOYMENT.md#cicd-github-actions).

## Integration Test Pattern

Integration tests hit a **real** database (no mocks), so they run where Postgres
is available — locally with the Docker container up, or in the DB-backed CI lane (the
`e2e` job, which runs on **every PR and push to main**) — never in the default
`pnpm test` unit run. They live in **`packages/db/__tests__/integration/`**
and run via the package's own **`test:integration`** script:

```bash
pnpm --filter @repo/db test:integration     # needs DATABASE_URL + a migrated DB
```

How it's wired so the default run stays DB-free:

- `packages/db/vitest.config.ts` (node env) `include`s only `__tests__/integration/**`
  and its `setupFiles` loads the root `.env` **before** the test imports `@repo/db`
  (the pg `Pool` reads `DATABASE_URL` at construction; dotenv won't override an
  already-set var, so it's a no-op in CI).
- `@repo/db` has **no `test` / `test:coverage` script** — only `test:integration` —
  so `turbo test` (the DB-free `verify` lane) never invokes it. The E2E CI lane,
  which provisions `postgres:16` + runs `db:migrate`, runs it explicitly.

The worked example is **`__tests__/integration/posts.test.ts`** — it runs the exact
SQL behind the tRPC `post.list` procedure (select + `leftJoin` author name +
newest-first, plus the D1 **keyset-cursor pagination**: page-by-page with no overlap
and a `null` cursor at the end) and the `createPost`/`updatePost`/`deletePost` actions
against real Postgres (incl. the `$onUpdate` `updatedAt` bump), plus the FK
`onDelete: "cascade"`. It's scoped to a dedicated test author so it cleans up after
itself **without** touching the `db:seed` rows:

```typescript
// packages/db/__tests__/integration/posts.test.ts
import { db, posts, user } from "@repo/db";
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const TEST_AUTHOR = { id: "integration-test-author", name: "…", email: "…", emailVerified: true };

describe("posts (integration)", () => {
  // Deleting the author cascades to its posts — the only cleanup needed.
  beforeEach(() => db.delete(user).where(eq(user.id, TEST_AUTHOR.id)));
  afterAll(() => db.delete(user).where(eq(user.id, TEST_AUTHOR.id)));

  it("lists posts newest-first with the author name joined in", async () => {
    await db.insert(user).values(TEST_AUTHOR);
    await db.insert(posts).values({ authorId: TEST_AUTHOR.id, title: "…", content: "…" });

    const rows = await db
      .select({ title: posts.title, authorName: user.name, authorId: posts.authorId })
      .from(posts)
      .leftJoin(user, eq(posts.authorId, user.id))
      .orderBy(desc(posts.createdAt));

    const mine = rows.filter((r) => r.authorId === TEST_AUTHOR.id);
    expect(mine[0]?.authorName).toBe(TEST_AUTHOR.name);
  });
});
```

> These integration tests exercise the **data layer** in `@repo/db` against a real
> database — the exact SQL behind the procedure — while the procedure's own branch logic
> (auth gate, rate-limit, validation) is unit-tested in the `apps/web` Vitest project with
> the workspace deps mocked. The query mirrors the procedure exactly, so it covers that
> path against real Postgres.

**`@repo/jobs` follows the same split (D7):**
- **Unit** (`verify` lane, DB-free) — `vitest.config.ts` covers the pure parts: the job
  contract (`queues.ts`) and the handlers with their providers mocked (`@repo/email`,
  `@sentry/node` for the DLQ consumer). Coverage is scoped to `handlers/**` + `queues.ts`;
  the pg-boss I/O bootstrap is left to the integration tests.
- **Integration** (`e2e` lane, real Postgres) — `vitest.integration.config.ts` (its own
  `test:integration` script, like `@repo/db`) spins up pg-boss against the DB in **isolated
  schemas** (dropped in `afterAll`): `worker.test.ts` (`pgboss_test`) enqueues a job and
  asserts the payload survives the round-trip; `dead-letter.test.ts` (`pgboss_test_dlq`)
  proves an exhausted job (retries spent) is copied to the dead-letter queue with its
  original payload. CI runs them in the `e2e` job right after the `@repo/db` integration
  tests. See [SERVICES.md](SERVICES.md) → Background jobs.

## Playwright Pattern

The scaffold ships one DB-free smoke test against the public landing page — it
proves the app builds, boots, and serves shadcn/ui components end-to-end:

```typescript
// e2e/home.spec.ts
import { expect, test } from "@playwright/test";

test("home page renders the boilerplate landing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "next-web-boilerplate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Primary" })).toBeVisible();
});
```

Every spec except the DB-free `home.spec.ts`, `security-headers.spec.ts`, and
`i18n.spec.ts` touches the database (19 specs total as of A22), so the suite belongs in
the DB-backed E2E lane (the `e2e` job — every PR and push to main), which runs against a
Postgres service.

**One spec never runs in the default suite:** `csp-nonce.spec.ts` (path-to-100 #10)
asserts the `CSP_MODE=nonce` build's per-request-nonce matrix, so
`playwright.config.ts` routes it to its own project **only when `CSP_MODE=nonce`**
(and then runs *just* it + the mode-agnostic `security-headers.spec.ts`, against a
single webServer — the email-capture server isn't started). CI runs it in the
variable-gated `csp-nonce` lane, which builds the app in nonce mode
([DEPLOYMENT.md](DEPLOYMENT.md#cicd-github-actions)); locally:
`CSP_MODE=nonce CI=true pnpm --filter web test:e2e` (bash — the mode must reach the
Turbo-driven build).

**Admin bootstrap (D2).** `e2e/admin.spec.ts` needs a logged-in admin, but promotion is
never self-service (no UI or seed admin). It signs up users through the UI, then
promotes one via a **direct DB write** — `promoteToAdmin(email)` in `e2e/support/db.ts`,
the sanctioned out-of-band path (see [AUTH.md](AUTH.md#promoting-an-admin-never-self-service)).
That helper imports `@repo/db`, so the *Playwright process itself* (not just the booted
server) needs `DATABASE_URL`: `test:e2e` therefore runs under `dotenv -e ../../.env`
(mirroring `dev`/`build`/`start`), which loads the local `.env` and **no-ops when the
file is absent** (CI, where `DATABASE_URL` already comes from the job env). The shared
`@repo/db` pool is intentionally left open — Playwright terminates the worker at the end.

**Auth through the real UI (C1).** The auth spec drives the `(auth)` forms, not the
HTTP API — `signUp`/`signIn`/`signOut` in `e2e/support/auth.ts` fill the fields by
label and wait for the navigation the app performs (`/dashboard` on success, `/login`
on sign-out), so the suite exercises the same path a user does:

```typescript
// e2e/support/auth.ts
export async function signUp(page: Page, user: TestUser): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard"); // session is live by the time we land
}
```

Email verification is **off** unless `RESEND_API_KEY` + `EMAIL_FROM` are set (graceful
degradation), so sign-up yields a session immediately and the redirect into the app
fires; with email configured the form shows a "check your inbox" state instead.

> **Origin note for local runs:** Better Auth validates the request origin against
> `trustedOrigins` (always `BETTER_AUTH_URL`, default `http://localhost:3000`). Running
> the prod build on a *different* port for an ad-hoc check needs that port trusted, e.g.
> `AUTH_TRUSTED_ORIGINS=http://localhost:3100 pnpm --filter web exec dotenv -e ../../.env -- next start -p 3100`,
> then `E2E_BASE_URL=http://localhost:3100 pnpm --filter web test:e2e auth.spec.ts`. The
> default `:3000` path (CI + `pnpm test:e2e`) needs none of this.

**Hydration race.** `e2e/posts.spec.ts` fills the create form, whose inputs are
controlled by React Hook Form. A value typed *before* the client form hydrates is
wiped when React attaches — so wait for the page to settle first (hydration triggers
the `post.list` refetch, making `networkidle` a reliable "hydrated" gate here), then
fill, then assert the value held as a guard. This is the one non-obvious thing about
testing a controlled form end-to-end.

**Cookie-cache staleness (P3-1).** `e2e/account.spec.ts` is a **serial** one-user
lifecycle (`test.describe.configure({ mode: "serial" })`, one shared context) — a single
sign-up keeps the file inside Better Auth's 5-per-60s sign-up limiter, and later tests
build on earlier mutations (the re-login uses the changed email + changed password).
After a profile mutation, a plain reload can legitimately re-render **stale** session
data for up to 5 minutes: the Step-19 cookie cache serves `getSession()` from a signed
cookie, and `updateUserName` writes the user table directly, so the cookie never hears
about it. Assert authoritatively against
`GET /api/auth/get-session?disableCookieCache=true` (the P2-1 probe) — it reads the DB
and re-issues the cookie cache, after which a reload deterministically renders the fresh
values. UI success is asserted on each form's `role=status` copy, never on
`router.refresh()` committing (see [AUTH.md](AUTH.md) — the Next 16.2.9 race).

### How Playwright gets a server + DB

`apps/web/playwright.config.ts` sets a `webServer` that boots the **production
build** on `http://localhost:3000` (`command: "pnpm start"`). `pnpm test:e2e`
runs through Turbo, whose `test:e2e` task `dependsOn` `build`, so the app is
built before Playwright starts; `reuseExistingServer` lets a local dev server on
:3000 be reused. (`next start` prints a harmless `output: standalone` warning but
serves fine.) Browsers are installed with `pnpm exec playwright install chromium`.

Set **`E2E_BASE_URL`** to point the suite at an already-running server (a prod build
on another port, a preview deploy) — Playwright then targets that URL and does **not**
manage a server. The default + CI path (env unset) is unchanged.

The DB-backed **CI** lane (the `e2e` job — every PR and push to `main`) provides a
`postgres:16` service, runs `pnpm --filter @repo/db db:migrate`, then the DB
integration tests, then `pnpm test:e2e`. See
[DEPLOYMENT.md](DEPLOYMENT.md#cicd-github-actions).

### Email capture — the magic-link E2E (path-to-100 #6)

Email-delivered flows can't be E2E'd keyless — the link lives in the email. The suite
solves this with a **test-only capture seam** in `@repo/email`'s single `send()`
chokepoint (`packages/email/src/send.tsx`): when **`EMAIL_TEST_CAPTURE_DIR`** is set
(and email is otherwise configured), every send is written as one JSON file —
`{ action, to, subject, url }` — instead of calling Resend. Unset (the default
everywhere), the code path is byte-identical; never set it in a real deployment — it
silently diverts delivery.

The wiring (`playwright.config.ts`):

- A **second webServer** boots the *same* keyless build on **:3001** with fake
  `RESEND_API_KEY`/`EMAIL_FROM` (flipping `isEmailConfigured()` on — registering the
  `magicLink()` plugin and the login affordance), `BETTER_AUTH_URL=http://localhost:3001`
  (trusted-origin + the links inside captured emails), and `EMAIL_TEST_CAPTURE_DIR`
  pointing at the gitignored `apps/web/e2e/.email-capture/`. These env entries win over
  the start script's `dotenv -e ../../.env` (dotenv-cli never overrides already-set
  vars), so a populated local root `.env` can't leak real creds in.
- A **second project** (`chromium-email`, baseURL :3001) runs *only*
  `e2e/magic-link.spec.ts` + `e2e/email-suppression.spec.ts`; the main `chromium`
  project ignores them. The main :3000 server stays keyless — itself load-bearing
  (auth.spec.ts asserts the magic-link affordance is hidden there, and signup must
  keep yielding an immediate session).
- The spec + config share the directory constant and a polling reader via
  `e2e/support/email-capture.ts`. In `E2E_BASE_URL` mode both the second server and the
  project are dropped (an external server has no capture directory to read).

**The suppression E2E (path-to-100 #8)** rides the same :3001 server, which also
carries a fake-but-well-formed `RESEND_WEBHOOK_SECRET` (shared constant in
`e2e/support/resend-webhook.ts`). The spec **self-signs** a Permanent-bounce payload —
the svix scheme is just HMAC-SHA256 over `` `${id}.${timestamp}.${rawBody}` `` with
the base64-decoded secret, ~6 lines of `node:crypto` — and POSTs it through the
route's **real** verification path (plus a tampered-signature 400 check), then proves
the suppressed address yields **no capture file** while a control address still does.
Suppression rows persist across runs by design, so the spec uses unique per-run
addresses. CI-honest: no provider, no network, no new dependency.

## Accessibility (axe)

`e2e/a11y.spec.ts` scans pages with **`@axe-core/playwright`** (axe-core) and fails on
any **critical** or **serious** violation — the WCAG-blocking impact levels — so a real
regression turns the suite red without churning on minor/cosmetic advisories:

```typescript
import AxeBuilder from "@axe-core/playwright";

const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
const blocking = violations.filter((v) => ["critical", "serious"].includes(v.impact ?? ""));
expect(blocking).toEqual([]);
```

It covers the public pages — the DB-free landing page, the form-bearing `/posts` page,
`/login`, and `/signup` — plus the signed-in `/account`, `/admin`, and `/admin/audit`
surfaces (P3-2; audit page added with the B2 read UI). The signed-in test bootstraps ONE
user (sign-up + out-of-band `promoteToAdmin`, the admin.spec pattern) and scans the three
pages via full-page `goto`, keeping the file — which
runs first alphabetically, ahead of the `account-*` signups — to a single hit on Better
Auth's 5-per-60s sign-up limiter. `@axe-core/playwright` is pinned exact (`4.11.3`)
rather than caret — the latest published only days ago and a caret would re-resolve to
it, tripping the repo's release-age discipline (same posture as `lint-staged`).

## Commands

```bash
pnpm test                                   # all Vitest unit tests (turbo, per package)
pnpm test:coverage                          # all unit tests + enforced coverage thresholds
pnpm --filter @repo/ui test                 # one package's Vitest tests
pnpm --filter web test                       # apps/web Server Action + lib unit tests
pnpm --filter @repo/ui exec vitest          # watch mode for one package
pnpm --filter @repo/ui exec vitest run --coverage   # one package + coverage report

pnpm --filter @repo/db test:integration     # DB integration tests (needs DATABASE_URL + migrated DB)
pnpm --filter @repo/jobs test:integration   # pg-boss enqueue→process round-trip (needs DATABASE_URL)

pnpm exec playwright install chromium       # one-time: download the browser
pnpm test:e2e                               # run Playwright E2E + a11y (builds first)
E2E_BASE_URL=http://localhost:3100 pnpm --filter web exec playwright test   # target a running server
pnpm --filter web exec playwright test --ui # Playwright interactive UI
pnpm --filter web exec playwright test --debug
```
