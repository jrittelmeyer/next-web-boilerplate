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
   version exists (see the dated override entries there — each carries its removal
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

**This section is the canonical live Watch list** — full per-item detail and removal
conditions live here; [`BACKLOG.md`](BACKLOG.md) carries one-line pointers. Currently:

- **TypeScript 7 cutover** — **GA'd as `typescript@7.0.2` (2026-07-08)** but not yet
  adoptable here (proven by a 2026-07-13 cutover attempt — owner-approved age-gate
  override; repo undeployed → no prod risk): TS 7's package IS the native **Go**
  compiler and **ships no JS Compiler API** — its `typescript` module exposes only
  `version` (`createProgram`/`readConfigFile`/`sys`/`transpileModule` gone, no
  `lib/typescript.js`; the programmatic API moved to `./unstable/*`), so `next build`
  fails at its TS-detection step (Next 16 stable embeds the classic API). Every
  library-API consumer (Next, webpack loaders, Vue/Svelte/Astro/MDX/Angular) stays on
  TS 6 until the stable programmatic API returns in **TS 7.1 (~Q4 2026)**. Upstream
  moved 2026-07-10: Next merged **experimental TS7 support into canary**
  ([#95639](https://github.com/vercel/next.js/pull/95639) — detects TS7 and offers
  `experimental.useTypeScriptCli`, shelling out to the CLI instead of the JS API;
  auto-detect planned before stable), closing tracking issue
  [#95490](https://github.com/vercel/next.js/issues/95490)
  ([#95633](https://github.com/vercel/next.js/discussions/95633) remains the
  discussion) — not in any stable 16.2.x (as of 2026-07-15; still absent at 16.2.11).
  The `tsc` CLI itself is clean and **~3.6× faster** (monorepo type-check 20.5s →
  5.7s, cache-bypassed), so the win is real. **Re-gate: on TS7 support reaching a
  *stable* Next release** (`useTypeScriptCli` or its auto-detect successor — check
  `pnpm view next dist-tags`). Mechanics learned: pnpm's age gate re-validates the
  whole lockfile on every `pnpm run`/frozen install, not just `pnpm install` — any
  early adoption needs a `minimumReleaseAgeExclude`.
- **Maintenance-only (Tier 3 G) — the standing state** — the honest "we're done"
  option: let Renovate drive deps, keep docs current, add steps as real needs surface.
  Standing 2026-07-12 → 2026-07-15; superseded 2026-07-15 by the path-to-100 program
  (owner decision; [archive/PATH_TO_100_2026-07-15.md](archive/PATH_TO_100_2026-07-15.md));
  **RESUMED 2026-07-17** — the program shipped all 11 rows and the eighth scoring pass
  verified it at **100.0/100**
  ([archive/PROJECT_AUDIT_2026-07-17.md](archive/PROJECT_AUDIT_2026-07-17.md)). The
  scheduled Renovate batch had **not opened as of 2026-07-22**, and the 2026-07-22
  audit found it **blocked, not waiting** — the scheduled lane has never produced a PR
  (0 `renovate/*` branches ever; all 7 merged PRs came from manual dashboard-approval
  clicks). The widening fix **SHIPPED 2026-07-22**; **confirm PRs actually open at the
  next Monday window (2026-07-27)**. The 7 approved majors merged 2026-07-18;
  typescript-v7 stays held per the TS7 gate above; `actions/setup-node v7` is a new
  pending-approval major, and `@testing-library/jest-dom v7` sits age-gated in the
  dashboard's Pending Status Checks (surfaces for approval once aged; 22B). The
  same-day 22B re-check confirmed the picture unchanged: still 0 `renovate/*`
  branches, 37 Awaiting Schedule.
- **Temporary security overrides** (added 2026-07-15) — three pnpm `overrides:` in
  `pnpm-workspace.yaml` remediate transitive-only Dependabot alerts (#1–#3) that have
  **no upstream fix**. Remove each when its upstream moves, then `pnpm install` + the full
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
    Its `/_next/image` runtime path is e2e-covered since 2026-07-22
    (`apps/web/e2e/image-optimization.spec.ts`) — a sharp that installs but no
    longer transforms turns the e2e lane red instead of passing silently.
  - **`fast-uri` NOT yet overridden** — the fix (3.1.4) was published 2026-07-19,
    inside the 7-day age gate at triage time. Two GHSAs are temporarily
    acknowledged in `auditConfig.ignoreGhsas` (build-tool-only path — webpack's
    schema-utils via `ajv`, zero request-handling exposure). Once 3.1.4 clears the
    gate (~2026-07-26): add `fast-uri: 3.1.4` to `overrides`, remove both GHSAs
    from `ignoreGhsas`, `pnpm install` + full gate.
- **`minimumReleaseAgeExclude` for `next` + `@next/*`** (added 2026-07-23) — the
  2026-07-22 Next.js advisory batch (9 GHSAs vs `<16.2.11`) was remediated by
  bumping to 16.2.11, published 2026-07-21 — inside the 7-day age gate, which
  doesn't exempt security fixes (the exclude is the policy's documented path).
  **Remove both entries once 16.2.11 ages out (2026-07-28)**, then `pnpm install`
  + the full gate.
- The **e2e signup flake** — the `signUp`→`/dashboard` Playwright step is
  intermittently flaky (absorbed by `retries: 2`, but it twice burned 2 of 3 CI
  attempts). **Not a code bug** — a fragile signup+redirect timing flow on modest
  runners. Harden **only if it ever turns a lane red**: bump that test's timeout, or
  wait on a network/cookie signal rather than only the URL.
- **Ship a real derived product end-to-end** (intent-level driver, owner-driven) — a
  real app built to completion on the template is the strongest validation of the
  "verified end-to-end" claim, **unlocks the gated B1 intake-drop row** (BACKLOG →
  Open rows), and supplies the proof the positioning reframe needs — consumption
  finds what audits can't (both inception trials did). Already tracked in memory
  `derived-project-intake-trial`; starts via `/project-init`. No template action
  until it begins; it then feeds the on-ramp rows with real lessons.

## Security response runbook

Advisories publish against the *world*, not against this repo's commits — a fully
green tree can wake up red (the 2026-07-22 Next.js batch dropped 9 GHSAs on a tree
whose CI had passed hours earlier). The pipeline guarantees detection **and** a
backlog entry; this runbook is the human half.

**Signals, ranked.** `pnpm audit` is the authoritative gate (it queries live
advisory data per run; of the four packages remediated 2026-07-22, Dependabot
alerted on **one**). Dependabot alerts and their emails are the supplementary
signal — cross-check both, trust `pnpm audit`.

**Automated cadence.** Three lanes watch for advisories; the first two run
`pnpm audit` and sync one rolling **`security-triage` issue** (created red,
appended while red, auto-closed by the next green run that provably audited —
`.github/scripts/security-triage-issue.sh`):

- **`security-audit.yml`** — daily 05:00 UTC watch lane; red at **moderate+**.
- **ci.yml → Audit (supply chain)** — every PR/push + the Thursday heartbeat;
  *merge gate* at high/critical, but its triage-sync step files/closes the issue
  at the same moderate+ watch threshold (non-PR runs on `main` only — push,
  heartbeat, manual dispatch).
- **Dependabot** — GitHub-side rescans with their own alerts/emails (also what
  auto-closes its alerts after a fix lands; observed latency ~90 min).

**Triage, when the issue fires** (or on any maintenance resume — check the open
issue list, the latest scheduled-run conclusions, and run `pnpm audit` before
declaring the ledger clear):

1. **Direct dependency with a fixed version** → bump it (registry-verified). A fix
   younger than the 7-day age gate needs a dated `minimumReleaseAgeExclude` entry
   in `pnpm-workspace.yaml` (pnpm's gate doesn't exempt security fixes) — remove
   it once the version ages out.
2. **Transitive with a compatible fixed version** → scoped override in
   `pnpm-workspace.yaml` + plain `pnpm install` (never `pnpm update --recursive` —
   it re-resolves the whole lockfile).
3. **No fixed version anywhere** → dated `auditConfig.ignoreGhsas` entry with its
   reason and expected exit condition.
4. **Record it in the same commit**: CHANGELOG **Security** entry + a Watch item
   above (with its removal condition), then the full gate and a CI watch. The
   green push closes the triage issue; confirm the Dependabot alerts auto-close.

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
