# Getting started — using this template

From `git clone` to a running app, then from scaffold to *your* app. For what the
boilerplate contains and why, read [`FEATURES.md`](FEATURES.md) first.

## Prerequisites

- **Node.js 24+** ([`.nvmrc`](../.nvmrc) pins it; `engines` warns below 24)
- **pnpm 11+** — easiest via `corepack enable` (the root `package.json` pins the exact
  version in `packageManager`)
- **Docker** — for local Postgres (+ Meilisearch, optional)

## The 60-second start

Grab a copy (GitHub **"Use this template"**, or a history-less copy via
`npx degit jrittelmeyer/next-web-boilerplate my-app`), then:

> **Windows:** put the copy in a short path (e.g. `C:\Projects\my-app`). The build
> emits long chunk filenames under `apps/web/.next`, and a deep starting directory
> can push absolute paths past Windows' 260-character `MAX_PATH` limit — the build
> then fails with `path length … exceeds max length of filesystem`.

```bash
# bash / zsh
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d
pnpm install
pnpm --filter @repo/db db:migrate
pnpm dev                                # → http://localhost:3000
```

```powershell
# PowerShell (or run `pnpm init-app`, which seeds .env cross-platform)
Copy-Item .env.example .env
docker compose -f docker/docker-compose.yml up -d
pnpm install
pnpm --filter @repo/db db:migrate
pnpm dev                                # → http://localhost:3000
```

Optional: `pnpm --filter @repo/db db:seed` loads a demo author + 8 example posts
(idempotent — safe to re-run).

That's genuinely it. `.env.example` ships with a working local `DATABASE_URL`
(matching the docker-compose Postgres) and a placeholder `BETTER_AUTH_SECRET` that
satisfies validation — change it before anything public. Sign-up works immediately:
with no email provider configured, accounts get a session right away instead of
waiting on a verification email.

## Starting from an idea? Run `/project-init`

If you develop with Claude Code, the preinstalled
[ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) skill library ships an
**inception skill** that replaces the manual scaffold-then-plan routine:
hand `/project-init` your idea (or a stack of plan documents) and it runs discovery
— clarifying questions, gap analysis, a competitive scan, and a map of which shipped
integrations your product actually needs — then writes your product brief
(`docs/PRODUCT.md`), runs `pnpm init-app` for you, regenerates
`PROJECT_STATUS.md`/`BACKLOG.md` around *your* product with a prioritized plan to a
100 audit score, and starts the build pipeline. Everything below works exactly the
same without it.

## Starting from an existing app? Run `/project-adopt`

The kit's second inception door, for when the product already exists — on any
stack — and you want it on this foundation. Hand `/project-adopt` a path or git
URL, or drop the code into `intake/source/` (gitignored; the original is a
read-only reference, never committed). The skill surveys the app into a **parity
contract** — routes, flows, data model, auth shape, design tokens, copy, SEO —
maps every subsystem honestly (keep theirs, replace with the template's rigor,
light up template features the app lacks), asks one batched round of clarifying
questions, then writes `docs/PRODUCT.md` + `docs/MIGRATION.md` and regenerates
`PROJECT_STATUS.md`/`BACKLOG.md` into a port program whose finish line is an app
indistinguishable from the original to its users — running on this template,
with the relevant integrations baked in. Where the original runs, every port
step is verified against it side-by-side.

## Environment: what's required vs what lights up

Only **two variables are required** — everything else is optional and the app
degrades gracefully without it. Validation lives in `apps/web/src/env.ts`
(`@t3-oss/env-nextjs` + Zod); the full annotated reference is
[`context/DEPLOYMENT.md → Environment Variables`](context/DEPLOYMENT.md#environment-variables).

| Integration | Env var(s) | When unset |
| --- | --- | --- |
| **Database** | `DATABASE_URL` | **Required** — app won't start |
| **Auth** | `BETTER_AUTH_SECRET` | **Required** (min 32 chars) |
| Auth base URL | `BETTER_AUTH_URL` | Defaults to `http://localhost:3000` |
| Email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` | Sends no-op with a logged warning; sign-up skips verification and yields an immediate session |
| OAuth | `GITHUB_CLIENT_ID`+`SECRET`, `GOOGLE_CLIENT_ID`+`SECRET` | Provider button hidden; email/password only (set *both* halves of a pair) |
| Payments (Stripe) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Checkout + webhook return "not configured" |
| Uploads (Uploadthing) | `UPLOADTHING_TOKEN` | Upload surfaces disabled |
| Search (Meilisearch) | `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY` | Search returns empty, indexing no-ops |
| Rate limiting | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Falls back to a working in-memory limiter |
| CAPTCHA (Turnstile) | `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | CAPTCHA plugin not registered; forms unchanged |
| Errors (Sentry) | `NEXT_PUBLIC_SENTRY_DSN` | SDK is a no-op |
| Logging (BetterStack) | `BETTER_STACK_SOURCE_TOKEN`, `BETTER_STACK_INGESTING_URL` | Logs go to the console |
| Analytics (PostHog) | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | SDK inert; consent banner still demo-able |

Per-service setup guides (get a key → wire it → verify it) are in
[`context/SERVICES.md`](context/SERVICES.md); each ends with a **"Remove it"**
checklist if you don't want that integration at all.

## Make it yours — the rename checklist

`pnpm init-app --name my-app` handles the first row; the rest is a quick
find-and-replace pass. None of it blocks running locally — rename when you're ready.

| What | Where | Needed when |
| --- | --- | --- |
| Root package name + README title | `package.json`, `README.md` (via `pnpm init-app --name`) | Always |
| Site name (metadata titles) + landing heading | `apps/web/src/lib/site.ts`, `apps/web/src/app/[locale]/page.tsx` — and the matching assertions in `apps/web/e2e/home.spec.ts` + `e2e/i18n.spec.ts` | Always |
| Seed data strings | `packages/db/src/seed.ts` | If you use the seed |
| Local container names (`nwb-postgres`, `nwb-meilisearch`) | `docker/docker-compose.yml`, `docker/docker-compose.prod.yml` | Cosmetic |
| CI image/network names (`nwb-web:ci`, `nwb-worker:ci`, `nwb-ci`) | `.github/workflows/ci.yml` | Cosmetic |
| Rate-limit key prefix (`nwb:ratelimit`) | `apps/web/src/lib/rate-limit.ts` | If sharing a Redis with other apps |
| Fly.io app name (`nwb-web`) | `fly.toml` | Before `fly apps create` (names are globally unique) |
| 2FA issuer / passkey RP name | `packages/auth/src/config.ts` (derived from hostname; brand-name hooks are commented) | Cosmetic |
| `@repo/*` workspace scope | Every `package.json` + import | **Optional — harmless to keep** (it's a conventional internal scope) |

If you cloned with git history (not degit / "Use this template"): `Remove-Item -Recurse -Force .git` (or `rm -rf .git`) and `git init` to start your own history.

## Remove what you don't need

- **The template's own history/marketing docs** — `pnpm init-app` offers to remove
  them for you (interactive y/N; `--slim` / `--keep-template-docs` for scripted
  runs; idempotent, run it anytime). They chronicle *this template's* build journey,
  not your app: `docs/PROJECT_STATUS.md`, `docs/BACKLOG.md`, `docs/archive/`,
  `docs/plain-english-guide/`, the funding link (+ README Support section);
  `CHANGELOG.md` is reset to an empty skeleton. It also neutralizes the template
  references in `README.md`/`AGENTS.md`, retargets the kept docs' pointers at the
  removed history to the public template repo (or rewrites them so they don't
  presume a not-yet-regenerated doc exists), and lists any remaining mention
  file:line. Kept, because they
  document *your* app's foundation: `FEATURES.md`, this file, `VERIFICATION.md`,
  `MAINTENANCE.md`, all of `context/`.
- Every integration in [`context/SERVICES.md`](context/SERVICES.md) ends with a
  self-contained **"Remove it"** checklist (Stripe, Sentry, PostHog, Uploadthing,
  Meilisearch, jobs, dashboards).
- The **"Demo / scaffold routes (delete these)"** table in
  [`context/ARCHITECTURE.md`](context/ARCHITECTURE.md#demo--scaffold-routes-delete-these)
  marks which routes are throwaway demos, which are real app shell, and which is the
  copy-me template.

## Staying current with the template

`degit` and GitHub's "Use this template" give you a **history-less** copy — a clean
slate, but also no shared git ancestry with this repo, so you can't just `git pull`
later improvements. Milestones are tagged (`v1.0.0`, `v1.1.0`, …) with notes on the
[Releases page](https://github.com/jrittelmeyer/next-web-boilerplate/releases) and in
[`CHANGELOG.md`](../CHANGELOG.md), so you can see what changed and pull in what you
want. Add the template as a second remote to diff and cherry-pick:

```bash
git remote add template https://github.com/jrittelmeyer/next-web-boilerplate.git
git fetch template --tags
git log --oneline v1.0.0..template/main      # what's landed since you started
```

**Don't `git merge template/main`.** Your copy shares no history with the template, so
a plain merge is refused (*"refusing to merge unrelated histories"*), and
`--allow-unrelated-histories` treats the whole delta as add/add conflicts — a fresh
degit of `v1.0.0` merging the current tip produced **143 conflicting files**. That's
the one-way-copy tradeoff, not a bug. Two paths that actually work:

- **Cherry-pick the changes you want** (recommended) — it applies patches, so it
  ignores the unrelated history and conflicts stay localized to files *you've* also
  edited. In the same dry-run, cherry-picking the latest commit auto-merged the
  workflow + context docs cleanly; the only conflicts were the template's own journey
  docs — which `pnpm init-app --slim` removes from a derived app anyway.
  ```bash
  git cherry-pick -x <sha>            # -x records the source commit
  ```
- **Inspect a file and port by hand** — for a targeted update:
  ```bash
  git diff HEAD template/main -- apps/web/src/lib/csp.ts
  ```

**Conflict zones to expect**, whichever path you take:

- `pnpm-lock.yaml` — never hand-resolve; take either side, then run `pnpm install` to
  regenerate it from the merged `package.json`s.
- `.env.example` — merge additively (keep your keys, add the template's new ones).
- The template's own journey docs (`PROJECT_STATUS.md`, `BACKLOG.md`, `docs/archive/`,
  `docs/plain-english-guide/`, `CHANGELOG.md`) — and `PRODUCT.md`/`MIGRATION.md` if
  `/project-init` or `/project-adopt` regenerated them — are yours now; discard the
  template's side of those conflicts.

If tracking the template long-term matters more than a clean slate, **`git clone` it
instead of `degit`** and develop on a branch — then your app descends from the
template's history and ordinary merges work (at the cost of carrying this repo's build
history).

## Build your first feature

The `posts` entity is the **copy-me template**: schema + indexes
([`context/DATABASE.md`](context/DATABASE.md#example-schema--posts-the-copy-me-entity-step-28)),
tRPC read procedures with cursor pagination, Server Action writes with typed field
errors, optimistic UI, org scoping, and search indexing
([`context/API.md`](context/API.md#example-entity-post-step-28--d1)). Copy the
pattern end-to-end, then delete the demo routes as your real features replace them.

When adding code, follow [`context/CONVENTIONS.md`](context/CONVENTIONS.md) — and if
you develop with a coding agent, point it at [`AGENTS.md`](../AGENTS.md), which loads
the right context doc per task.

## Testing

| Suite | Command | Needs |
| --- | --- | --- |
| Unit + component (all packages) | `pnpm test` | **Nothing** — no DB, no keys |
| Coverage (thresholds enforced) | `pnpm test:coverage` | Nothing |
| DB integration | `pnpm --filter @repo/db test:integration` (same for `@repo/jobs`) | Local Postgres |
| E2E (Playwright) | `pnpm test:e2e` (one-time `pnpm exec playwright install chromium`) | Local Postgres |

No paid or external key is needed anywhere in the test story — E2E auth flows work
keyless because unconfigured email means sign-up sessions are immediate.
→ [`context/TESTING.md`](context/TESTING.md)

## Two install-time behaviors to know about

- **7-day supply-chain age gate.** `pnpm-workspace.yaml` sets
  `minimumReleaseAge: 10080` (minutes): installing the committed lockfile is fine
  (all entries pre-cleared), but **adding a dependency version published <7 days ago
  will be refused** — by design (npm supply-chain attacks are usually caught within
  days). Pick the newest release that clears the gate, or consciously add a
  `minimumReleaseAgeExclude`. → [`context/STACK.md`](context/STACK.md)
- **Build scripts are allowlisted.** pnpm only runs postinstall scripts listed in
  `allowBuilds`. If a new dependency needs its build script, that's a deliberate
  one-line opt-in, not a surprise.

## Going to production

1. Work through [`VERIFICATION.md`](VERIFICATION.md) — a phased checklist that proves
   each feature end-to-end (free/keyless phases first, then per-service live phases).
2. Set real env values per the reference in
   [`context/DEPLOYMENT.md`](context/DEPLOYMENT.md#environment-variables). Generate a
   real `BETTER_AUTH_SECRET`; `BETTER_AUTH_URL` **must** equal your public origin.
3. Replace the placeholder security contact in
   `apps/web/src/app/.well-known/security.txt/route.ts` (it ships
   `security@example.com` with an in-file warning).
4. Deploy: the multi-stage `docker/Dockerfile` runs anywhere; a worked, proven
   **Fly.io runbook** is in
   [`context/DEPLOYMENT.md → Fly.io`](context/DEPLOYMENT.md#flyio-worked-runbook),
   with Vercel / Railway / self-host paths documented alongside.
5. Keep it current over time — that's [`MAINTENANCE.md`](MAINTENANCE.md).
