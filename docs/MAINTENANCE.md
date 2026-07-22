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
5. **Audit allowlist hygiene** — `pnpm audit` gates CI. For a transitive advisory,
   prefer a scoped **override** in `pnpm-workspace.yaml` when a compatible fixed
   version exists (see the dated Dependabot trio there — each carries its removal
   condition, mirrored in the Watch items below); acknowledge it in
   `auditConfig.ignoreGhsas` (with its reason) only when nothing fixable exists.
   **Prune both kinds** once the upstream fix lands. Same for the `vite` version
   override — bump it as newer releases age out.

## Automation on a fork / new repo

GitHub repo settings don't travel with a template copy. On your own repo:

- **Install the Renovate (Mend) GitHub App** — without it, no update PRs ever arrive.
  Because `.github/renovate.json` is already committed, there's no onboarding PR —
  Renovate goes straight to the Dependency Dashboard issue and scheduled update PRs.
  Choose **"Only selected repositories"** when installing: an "All repositories"
  install defaults the Mend org to **Silent** mode (it scans but never creates
  issues or PRs), and changing the GitHub-side repository access afterward does
  *not* clear it — flip the mode to Interactive at
  [developer.mend.io](https://developer.mend.io) if the dashboard issue never
  appears. Validate config edits with
  `pnpm dlx --package renovate renovate-config-validator .github/renovate.json`.
- **Re-create the CI gate variables** (they're repo variables, not workflow content):
  `ENABLE_CODEQL` (needs a public repo or GHAS), `ENABLE_VISUAL`, and optionally
  `ENABLE_PERF` / `ENABLE_GHCR_PUBLISH`. Unset, those lanes *skip silently* — they
  don't fail. → [`context/DEPLOYMENT.md → CI/CD`](context/DEPLOYMENT.md#cicd-github-actions)
- Optional: a `CODECOV_TOKEN` secret (coverage upload is skipped cleanly when unset).

## Watch items (known, tracked, deliberately not done)

The live list is [`BACKLOG.md`](BACKLOG.md). Currently:

- **TypeScript 7 cutover** — TS 7 GA'd as the native Go compiler but ships no JS
  Compiler API yet, so stable `next build` cannot use it. Experimental TS7 support
  (`experimental.useTypeScriptCli`) landed in **Next canary 2026-07-10**; re-evaluate
  when it reaches a **stable** Next release (TS 7.1, ~Q4 2026, restores the
  programmatic API for the wider toolchain). The `tsc` CLI alone is ~3.6× faster, so
  the win is worth tracking.
- **Temporary security overrides** (added 2026-07-15) — three pnpm `overrides:` in
  `pnpm-workspace.yaml` remediate transitive-only Dependabot alerts that have **no
  upstream fix**. Remove each when its upstream moves, then `pnpm install` + the full
  gate:
  - `effect: 3.21.4` → remove when **uploadthing** ships on effect >=3.20 (7.7.4
    exact-pins 3.17.7).
  - `"postcss@<8.5.10": 8.5.15` → remove when **next**'s own postcss pin reaches
    >=8.5.10 (16.2.11 still pins 8.4.31 — re-checked 2026-07-22).
  - `"@esbuild-kit/core-utils>esbuild": 0.25.12` → remove when **drizzle-kit** drops
    the deprecated `@esbuild-kit` loader.

  The `auditConfig.ignoreGhsas` allowlist emptied the same day — `pnpm audit` now
  guards these overrides live (red if one ever regresses).
- **More security overrides** (added 2026-07-22) — three transitive-only advisories,
  newly disclosed the same week (`pnpm audit` queries live advisory data — nothing in
  the lockfile changed to surface these; the prior day's CI was fully green). **Only
  `brace-expansion` was a Dependabot alert**; `sharp`, `dompurify`, and `fast-uri`
  were caught by the CI `pnpm audit` lane and never appeared in Dependabot — so
  **`pnpm audit` is the authoritative gate here and Dependabot the supplementary
  signal** (checking Dependabot alone would have missed a HIGH on `sharp`, which sits
  in Next's image-optimization path). Remove each when its upstream moves, then
  `pnpm install` + the full gate:
  - `brace-expansion: 5.0.7` → remove once a routine bump naturally carries the
    lockfile past 5.0.7 (already in-range for **minimatch**'s own `^5.0.5`).
  - `dompurify: 3.4.12` → remove once a routine bump naturally carries the lockfile
    past 3.4.12 (already in-range for **posthog-js**'s own `^3.3.2`).
  - `sharp: 0.35.3` → remove when **next**'s own sharp pin reaches >=0.35.0 (16.2.11
    still pins `^0.34.5`, excluding the libvips CVE fix — re-checked 2026-07-22).
  - **`fast-uri` NOT yet overridden** — the fix (3.1.4) was published 2026-07-19,
    inside the 7-day age gate at triage time. Two GHSAs are temporarily
    acknowledged in `auditConfig.ignoreGhsas` (build-tool-only path — webpack's
    schema-utils via `ajv`, zero request-handling exposure). Once 3.1.4 clears the
    gate (~2026-07-26): add `fast-uri: 3.1.4` to `overrides`, remove both GHSAs
    from `ignoreGhsas`, `pnpm install` + full gate.
- The **e2e signup flake** — intermittent, absorbed by Playwright retries, not a code
  bug; harden only if it ever turns a lane red.

## Periodic audit cadence

Two review passes keep docs and code from drifting — run them on real need (a big
upgrade, a batch of merged Renovate PRs) rather than on a calendar:

- **Doc audit** — sweep for code↔doc drift: claims in `docs/` that no longer match
  the code, duplication on the hot path, stale detail to archive — plus **currency
  drift** (claims the ecosystem moved out from under: upstream gates,
  "current/latest" statements) and the **outward-facing consumer claims** (README
  quickstart commands, badges, links).
- **Project audit** — score the repo against a best-available bar and emit a
  prioritized backlog of gaps — including, post-launch, the **public-template
  surface** (on-ramp truth, community files, automation actually alive) and a
  re-check of externally-gated watch rows.

Both audits ship as committed agent skills (`.claude/skills/project-audit/` and
`.claude/skills/doc-audit/`, alongside the checkpoint/tidy helpers — all installed
from the [ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) skill library);
each SKILL.md is a plain-markdown procedure a human — or any agent tooling — can
follow directly. Past audit reports live in [`archive/`](archive/) as worked
examples.

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
