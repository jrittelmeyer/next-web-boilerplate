# Contributing

Thanks for taking the time to contribute! This is a production-ready Next.js
monorepo starter, and the same discipline that built it applies to changes:
every architectural decision is documented, and the quality gate is non-negotiable.

## Before you start

Every area of the codebase has a context doc in [`docs/context/`](docs/context/).
**Read the relevant one before working in that area** — it explains the "why"
behind the conventions you're expected to follow. The index lives in
[`AGENTS.md`](AGENTS.md), and [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)
tracks what's built and verified.

## Prerequisites

- **Node.js 24+** (see [`.nvmrc`](.nvmrc)) — `nvm use` if you use nvm.
- **pnpm 11+** — `corepack enable` pins the version from `package.json`.
- **Docker** — for local Postgres (and Meilisearch).

## Local setup

```bash
cp .env.example .env                                # fill in secrets (DB + auth)
docker compose -f docker/docker-compose.yml up -d   # start Postgres + Meilisearch
pnpm install                                        # installs + sets up Git hooks
pnpm --filter @repo/db db:migrate                   # apply migrations
pnpm dev                                            # http://localhost:3000
```

The app is designed to **degrade gracefully** when optional services (Stripe,
Resend, Sentry, PostHog, Uploadthing, Upstash) are unconfigured — you only need a
database and auth secret to run it. See [`docs/context/DEPLOYMENT.md`](docs/context/DEPLOYMENT.md)
for the full env reference.

## The quality gate

Run the full gate before opening a pull request — CI runs the same checks:

```bash
pnpm lint          # Biome + ESLint (@next/eslint-plugin-next)
pnpm type-check    # TypeScript across all packages
pnpm build         # build all apps and packages
pnpm test          # Vitest unit + integration tests
pnpm test:e2e      # Playwright E2E (needs a running build + database)
```

`pnpm lint:fix` and `pnpm format` auto-fix most style issues.

## Git hooks (installed automatically)

`pnpm install` sets up [husky](https://typicode.github.io/husky/) +
[lint-staged](https://github.com/lint-staged/lint-staged) via the root `prepare`
script — no manual setup. Bypass any hook with `--no-verify` when you genuinely
need to.

| Hook | Runs | Purpose |
| --- | --- | --- |
| `pre-commit` | `biome check --write` on staged files | Formats, lints, and sorts imports on staged files only; safe fixes are re-staged. |
| `commit-msg` | a dependency-free length/prefix check | Rejects empty / `< 10`-char subjects and leftover `fixup!`/`squash!` prefixes. |
| `pre-push` | `pnpm type-check` | Project-wide TypeScript check (turbo-cached). |

The `commit-msg` hook is **not** a Conventional-Commits enforcer — the history is
intentionally mixed-style. Write a clear, descriptive subject. See
[`docs/context/CONVENTIONS.md`](docs/context/CONVENTIONS.md#git-hooks) for details.

## Conventions worth knowing

- **Read split:** tRPC for queries, Server Actions for mutations (see [`API.md`](docs/context/API.md)).
- **Validation:** shared Zod schemas live in `@repo/validators`.
- **Tests:** Vitest files are `*.test.*`, Playwright specs are `*.spec.*`.
- **Package boundaries:** respect the import rules in [`ARCHITECTURE.md`](docs/context/ARCHITECTURE.md).
- **Code style** is enforced by Biome + `.editorconfig` — don't hand-format.

## Pull requests

1. Branch off `main`.
2. Keep the change focused; update the relevant `docs/context/*` doc if you change
   behavior, and `docs/PROJECT_STATUS.md` if you complete a tracked step.
3. Make sure the full gate passes.
4. Fill out the PR template (summary, type of change, the gate checklist).

## Reporting bugs & security issues

- **Bugs / features:** open an issue using the templates.
- **Security vulnerabilities:** do **not** open a public issue — follow the
  [security policy](.github/SECURITY.md) instead.

By contributing, you agree your contributions are licensed under the project's
[MIT License](LICENSE).
