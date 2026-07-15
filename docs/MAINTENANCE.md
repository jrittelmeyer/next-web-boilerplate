# Maintenance — keeping this stack current

How this repo stays up to date as the ecosystem moves, and how to run the same
framework in an app you started from it. The stack was current and fully verified at
release; this doc is what keeps that true.

## Philosophy

- **`main` is the version.** There are no release branches; fixes and upgrades land on
  `main` (see the [security policy](../.github/SECURITY.md)). Downstream apps rebase
  or cherry-pick what they want.
- **Every change runs the full gate** — `pnpm lint` · `pnpm type-check` · `pnpm build`
  — plus a live check where the change is observable. Verify by running, not by
  assuming.
- **Plan before nontrivial changes.** Upgrades and new features get a written plan
  first (agents: see the working agreements in [`AGENTS.md`](../AGENTS.md)).

## Dependency policy

The full per-dependency record (versions, pin style, and *why*) is
[`context/STACK.md`](context/STACK.md). The rules:

1. **Version-check against the npm registry, never blog posts** —
   `pnpm view <pkg> version` (or the registry dist-tags endpoint) before adding or
   bumping anything.
2. **A 7-day minimum release age, enforced at two layers**:
   - **Renovate** (`.github/renovate.json`) never *proposes* a release younger than
     7 days (security fixes bypass this).
   - **pnpm** (`minimumReleaseAge: 10080` in `pnpm-workspace.yaml`) validates every
     lockfile entry at *install* time, so a too-fresh package can't enter the tree at
     all. Note pnpm's gate does **not** exempt security fixes — a <7-day-old fix needs
     a deliberate `minimumReleaseAgeExclude`.
3. **Exact-pin frequent publishers** (`stripe`, `@sentry/nextjs`, `posthog-*`, `knip`,
   `pg-boss`, …): with a caret range, a near-daily publisher re-trips the age gate on
   every resolve. Renovate's `rangeStrategy: "auto"` preserves each dependency's pin
   style when bumping.
4. **Cross-package pins stay in lockstep** — `pnpm lint:deps` (manypkg) fails CI if a
   shared dependency's range diverges between workspace packages; auto-align with
   `pnpm fix:deps`. Some pairs are deliberate lockstep (e.g. `@better-auth/passkey`
   must match `better-auth` exactly).
5. **Audit allowlist hygiene** — `pnpm audit` gates CI; known-unfixable transitive
   advisories are acknowledged in `pnpm-workspace.yaml` `auditConfig.ignoreGhsas`,
   each with its reason. **Prune entries** once the upstream fix lands. Same for the
   `vite` version override there — bump it as newer releases age out.

## Automation on a fork / new repo

GitHub repo settings don't travel with a template copy. On your own repo:

- **Install the Renovate (Mend) GitHub App** — without it, no update PRs ever arrive.
  It opens an onboarding PR and a Dependency Dashboard issue. Validate config edits
  with `pnpm dlx --package renovate renovate-config-validator .github/renovate.json`.
- **Re-create the CI gate variables** (they're repo variables, not workflow content):
  `ENABLE_CODEQL` (needs a public repo or GHAS), `ENABLE_VISUAL`, and optionally
  `ENABLE_PERF` / `ENABLE_GHCR_PUBLISH`. Unset, those lanes *skip silently* — they
  don't fail. → [`context/DEPLOYMENT.md → CI/CD`](context/DEPLOYMENT.md#cicd-github-actions)
- Optional: a `CODECOV_TOKEN` secret (coverage upload is skipped cleanly when unset).

## Watch items (known, tracked, deliberately not done)

The live list is [`BACKLOG.md`](BACKLOG.md). At release:

- **TypeScript 7 cutover** — TS 7 GA'd as the native Go compiler but ships no JS
  Compiler API yet, so `next build` cannot use it. Re-evaluate when **Next.js ships
  TS 7 support** (expected with TS 7.1, ~Q4 2026). The `tsc` CLI alone is ~3.6×
  faster, so the win is worth tracking.
- **Email bounce/complaint handling** — Resend already suppresses account-side; the
  optional app-side piece is a webhook → suppressions table.
- The **e2e signup flake** — intermittent, absorbed by Playwright retries, not a code
  bug; harden only if it ever turns a lane red.

## Periodic audit cadence

Two review passes keep docs and code from drifting — run them on real need (a big
upgrade, a batch of merged Renovate PRs) rather than on a calendar:

- **Doc audit** — sweep for code↔doc drift: claims in `docs/` that no longer match
  the code, duplication on the hot path, stale detail to archive.
- **Project audit** — score the repo against a best-available bar and emit a
  prioritized backlog of gaps.

The project audit ships as a committed agent skill (`.claude/skills/project-audit/`,
alongside the checkpoint/tidy helpers); its SKILL.md is a plain-markdown procedure a
human — or any agent tooling — can follow directly. The doc audit is run as a
described procedure (the sweep above) rather than a committed skill. Past audit
reports live in [`archive/`](archive/) as worked examples.

## Local disk hygiene

The Turbo cache (`.turbo/cache`) has no native size cap and grows by ~3.5 GB per
clean build; `pnpm clean` does **not** touch it.

```bash
pnpm cache:size    # report current cache size
pnpm cache:prune   # evict oldest entries down to the cap (default 20 GB)
```

`cache:prune` also runs automatically on `pre-push`.
→ [`context/DEPLOYMENT.md → Local disk hygiene`](context/DEPLOYMENT.md#local-disk-hygiene-turbo-cache)

## Major-upgrade runbook

For a framework-level bump (Next major, React major, Tailwind major, Better Auth
major — anything with a migration guide):

1. **Branch**, and read the upstream migration guide + [`context/STACK.md`](context/STACK.md)
   notes for the packages involved (several pins have "bump when X" conditions
   recorded inline).
2. **Bump** the dependency (registry-verified, age-gate-cleared), plus any lockstep
   partners (manypkg will tell you).
3. **Full gate**: `pnpm lint && pnpm type-check && pnpm build`, then `pnpm test` and
   `pnpm test:e2e`.
4. **Live-verify the affected surface** against a fresh production build (build, then
   `PORT=3100 pnpm --filter web start` so a standing dev server isn't disturbed) —
   walk the relevant [`VERIFICATION.md`](VERIFICATION.md) phase, not just the tests.
5. **Update the docs in the same change**: the [`context/STACK.md`](context/STACK.md)
   version table, the affected `docs/context/*` doc, and
   [`PROJECT_STATUS.md`](PROJECT_STATUS.md). If the upgrade changed a *decision*
   (not just a version), record it in [`context/DECISIONS.md`](context/DECISIONS.md).
6. Merge only on a green CI run.

## When best practices move

This boilerplate encodes 2026 defaults, and says *why* each was chosen
([`FEATURES.md`](FEATURES.md) for the summary, [`context/DECISIONS.md`](context/DECISIONS.md)
for the full record). When the ecosystem shifts, re-argue against the recorded
rationale rather than the code: if the "why" no longer holds (a library died, a
platform feature landed, a rejected option matured), that's the signal to revisit —
and the decision log is where the reversal gets recorded, so the next reader inherits
the reasoning, not just the diff.
