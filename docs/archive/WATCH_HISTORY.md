# Watch history — landed and closed Watch items

**Historical record — not part of normal agent task context.** The blocks below were moved
here **verbatim** from `docs/MAINTENANCE.md → Watch items` on 2026-09-02 (doc audit), once every
item in them had landed or closed; the live Watch list keeps a one-line struck record (or a
compacted live entry) pointing at each section. Only the relative link paths were rewritten for
this location. The earlier archival of the same class (2026-08-19) lives in
[PHASE_HISTORY.md → Archived 2026-08-19](PHASE_HISTORY.md#archived-2026-08-19-status-watch-and-overrides-history).
Future landed takes and closed batches go here, under a dated heading.

## Contents

- [TypeScript 7 cutover (full entry as of 2026-09-02)](#typescript-7-cutover-full-entry-as-of-2026-09-02)
- [Maintenance-only (Tier 3 G): the Renovate narrative to 2026-09-02](#maintenance-only-tier-3-g-the-renovate-narrative-to-2026-09-02)
- [Dated dependency takes landed 2026-08-10 to 2026-09-02](#dated-dependency-takes-landed-2026-08-10-to-2026-09-02)
- [better-auth 1.6.26 and 1.6.30 takes (2026-08-14, 2026-08-26)](#better-auth-1626-and-1630-takes-2026-08-14-2026-08-26)
- [sharp override removed 2026-08-26](#sharp-override-removed-2026-08-26)
- [Advisory batch 2026-07-27](#advisory-batch-2026-07-27)
- [Advisory batch 2026-08-04 (#5)](#advisory-batch-2026-08-04-5)
- [Age-exclude for next 16.2.11 (closed 2026-07-28)](#age-exclude-for-next-16211-closed-2026-07-28)
- [next 16.2.12 (taken 2026-08-02)](#next-16212-taken-2026-08-02)
- [PROJECT_STATUS date-gated watch paragraph (as of 2026-09-02)](#project_status-date-gated-watch-paragraph-as-of-2026-09-02)
- [BACKLOG Watch bullets (as of 2026-09-02)](#backlog-watch-bullets-as-of-2026-09-02)
- [BACKLOG B4 TypeScript 7 row (as of 2026-09-02)](#backlog-b4-typescript-7-row-as-of-2026-09-02)
- [BACKLOG B1 Renovate row (as of 2026-09-02)](#backlog-b1-renovate-row-as-of-2026-09-02)

## TypeScript 7 cutover (full entry as of 2026-09-02)

_Moved verbatim from `docs/MAINTENANCE.md` on 2026-09-02._

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
  ([#95639](https://github.com/vercel/next.js/pull/95639) — offers
  `experimental.useTypeScriptCli`, shelling out to the CLI instead of the JS API),
  closing tracking issue
  [#95490](https://github.com/vercel/next.js/issues/95490)
  ([#95633](https://github.com/vercel/next.js/discussions/95633) remains the
  discussion). The `tsc` CLI itself is clean and **~3.6× faster** (monorepo
  type-check 20.5s → 5.7s, cache-bypassed), so the win is real. Mechanics learned:
  pnpm's age gate re-validates the whole lockfile on every `pnpm run`/frozen
  install, not just `pnpm install`. That cost a `minimumReleaseAgeExclude` in July;
  **it no longer would** — `7.0.2` and all **20** `@typescript/typescript-<os>-<arch>`
  platform optional deps published 2026-07-08, ~25 days clear of the 7-day gate as of
  2026-08-02. ⚠️ But the gate binds what a range **resolves to**, not the version you
  had in mind, and the TS train publishes daily (`dist-tags.next` was
  `7.1.0-dev.20260802.1`), so a cutover should pin **exactly**, not `^7.x`.

  **⇒ THE NEXT-SIDE RE-GATE LIFTED 2026-08-02 — met by its literal terms, at three
  named costs.** The condition as written was *"TS7 support reaching a stable Next
  release (`useTypeScriptCli` or its auto-detect successor)"*. Verified **in the
  installed artifact**, not from a changelog: `apps/web` resolves `next@16.2.12`
  (`dist-tags.latest`), which carries `useTypeScriptCli` across 40 files including
  `dist/build/type-check.js`, `dist/build/load-jsconfig.js` and its own shipped docs
  page. Read that page (`dist/docs/…/useTypeScriptCli.md`) before planning a cutover —
  it is the primary source and it names what the flag costs:
  - **It is opt-in, not auto-detected.** *"Next.js does not select the CLI checker
    automatically"* — TS7 installed without the flag makes `next build` exit with
    instructions. The gate's disjunction is satisfied by `useTypeScriptCli`; the
    auto-detect successor this file expected before stable **did not** arrive.
  - **It widens what gets type-checked** — *"The complete project selected by the
    configured `tsconfig` is checked, including test files"*, and
    `--debug-build-paths` **cannot** narrow it. ⚠️ **This was overstated here until
    2026-08-02:** it is not new exposure for *this* repo. `apps/web` already runs
    `tsc --noEmit` over a tsconfig that includes `**/*.ts(x)`, so the 47 co-located
    tests and 29 `e2e/*.spec.ts` are checked **today**. The scope is unchanged; only
    the checker would be. The one genuinely-new surface is `.next/types/**/*.ts`,
    which `pnpm type-check` cannot see (turbo scopes it to `dependsOn: ["^build"]`,
    upstream builds only) — so `next build`, not `type-check`, is what would test it.
  - **Diagnostics degrade.** Next-specific code frames and error rewriting are not
    applied; `typescript.ignoreBuildErrors` skips the CLI checker too.

  **⇒ BUT THE BINDING CONSTRAINT IS NOT THE ONE THIS ENTRY TRACKED. Re-gated
  2026-08-02 on a fact no cutover trial could have surfaced:** ⚠️ **TS 7 ships no
  `tsserver`.** Verified at the registry — `typescript@6.0.3` declares
  `bin: { tsc, tsserver }`; `typescript@7.0.2` declares `bin: { tsc }`. The 20
  platform packages are compiler binaries. So bumping the workspace `typescript`
  leaves the editor's "Use Workspace Version" with no server, and the **`next`
  tsserver plugin** (`tooling/typescript/nextjs.json` → `plugins: [{ name: "next" }]`,
  the one `knip.jsonc` carries a dedicated ignore for) with no host. Either the editor
  falls back to its own bundled TypeScript — **a different checker from the build**,
  the classic green-in-editor / red-in-CI split, on the daily loop — or `"use client"`
  boundary violations and invalid metadata exports stop surfacing while typing.
  **No lane in `ci.yml` runs an editor**, which is exactly why the previous "run a
  trial" re-gate was the wrong instrument: a fully green trial would not have licensed
  the cutover.

  **Two further costs, both landing on the template surface** (`scripts/init-app.mjs`
  ships this tree verbatim into every generated project): TS 7 is a native Go binary
  published for **20 platform tuples with no musl variant**, while the repo's own
  builder is `node:24-alpine` (`docker/Dockerfile`) — TS 6 is pure JS and runs
  anywhere Node does, so a cutover trades away a portability guarantee an adopter
  currently has. And `next.config.ts` would need care: `experimental` exists **only**
  in nonce mode there (`...(cspMode === "nonce" ? { experimental: { useCache: true } }
  : {})`), so adding `useTypeScriptCli` as a *sibling* key silently drops one side —
  before the spread the flag is lost (TS7 without it makes `next build` exit ⇒ the
  CSP-nonce e2e lane goes red), after it `useCache` is lost (`"use cache"` stops
  caching). It must be **merged into one object**, not stacked.

  **The dependency blocker, restated from inspection rather than enumeration:**
  `react-docgen-typescript@2.4.0` is real — `lib/parser.js:22` does
  `require("typescript")` and then uses `ts.SyntaxKind` (16×), `ts.displayPartsToString`
  (6×), `ts.SymbolFlags` (6×), `ts.TypeFlags`, `ts.isIdentifier` … i.e. deep classic
  Compiler API, while TS 7's module exposes only `version`. Reached via
  `@storybook/react-vite` from `packages/ui/.storybook/main.ts`; **it gates the
  visual-regression lane, not `next build`.** ⚠️ Its peer is `>= 4.3.x`, which TS 7
  *satisfies* — so `pnpm install` would neither fail nor warn; the break is at
  Storybook build time. Escape hatch if ever needed: `typescript: { reactDocgen:
  "react-docgen" }` (AST-based, no Compiler API) or `false`. That costs autodocs
  prop-table fidelity but **no visual baselines** — `packages/ui/tests/visual.spec.ts`
  filters `entry.type === "story"` and autodocs pages index as `type: "docs"`, so none
  is screenshotted.
  The enumeration that found it (packages declaring `typescript` as a dependency or
  required peer) still cannot see a bare `require("typescript")` under an *optional* or
  undeclared peer — treat it as the floor. **A worked example of that blind spot, and
  of its inverse:** `next-intl@4.13.1` also resolves against `(typescript@6.0.3)` in
  the lockfile and looks like a second blocker. It is not — `typescript` is an
  **optional peer with no version range** there (only `next`/`react` are in
  `peerDependencies`) and `next-intl/dist` imports `typescript` nowhere. Cleared by the
  same sweep: knip (oxc), drizzle-kit/vitest (esbuild), biome (Rust), zero
  `typescript-eslint` anywhere; `@trpc/*`'s `typescript >=5.7.2` peer is types-only
  inference, not an API consumer.

  ***Removal condition (replaces "run a cutover trial"):*** `typescript@7.1.x` stable
  **and** it ships a language service (or the `next` tsserver plugin has a documented
  TS 7 story) **and** `react-docgen-typescript` resolves against it. Each is checkable
  without building anything. Until then **hold Renovate's `typescript` v7 major** — now
  for a recorded reason rather than a pending experiment. Costs no audit points.

## Maintenance-only (Tier 3 G): the Renovate narrative to 2026-09-02

_Moved verbatim from `docs/MAINTENANCE.md` on 2026-09-02._

- **Maintenance-only (Tier 3 G) — the standing state** — the honest "we're done"
  option: let Renovate drive deps, keep docs current, add steps as real needs surface.
  Standing 2026-07-12 → 2026-07-15; superseded 2026-07-15 by the path-to-100 program
  (owner decision; [archive/PATH_TO_100_2026-07-15.md](PATH_TO_100_2026-07-15.md));
  **RESUMED 2026-07-17** — the program shipped all 11 rows and the eighth scoring pass
  verified it at **100.0/100**
  ([archive/PROJECT_AUDIT_2026-07-17.md](PROJECT_AUDIT_2026-07-17.md)). The
  scheduled Renovate batch had **not opened as of 2026-07-22**, and the 2026-07-22
  audit found it **blocked, not waiting** — the scheduled lane has never produced a PR
  (0 `renovate/*` branches ever; all 7 merged PRs came from manual dashboard-approval
  clicks). The widening fix **SHIPPED 2026-07-22** — and **the proof FAILED anyway: the
  2026-07-27 Monday window passed with still zero `renovate/*` branches ever
  opened** (`git ls-remote --heads origin 'refs/heads/renovate/*'` → empty; all 7
  merged Renovate PRs came from manual dashboard clicks). **This is now a
  diagnosis job, not a wait** — next stop is the Mend app side (run logs / mode /
  cadence at developer.mend.io); owner's call on when to run it. Fallback if the
  app side won't cooperate: self-hosted Renovate via `renovatebot/github-action`
  on a cron, reusing the committed config — **built 2026-08-31 as
  `.github/workflows/renovate.yml`** (B1 in [`BACKLOG.md`](../BACKLOG.md); see below). The 7 approved majors merged 2026-07-18;
  typescript-v7 stays held per the TS7 gate above; `actions/setup-node v7` is a new
  pending-approval major, and `@testing-library/jest-dom v7` sits age-gated in the
  dashboard's Pending Status Checks (surfaces for approval once aged; 22B). The
  same-day 22B re-check confirmed the picture unchanged: still 0 `renovate/*`
  branches, 37 Awaiting Schedule. **Re-checked 2026-08-19** (doc audit): still zero
  `renovate/*` branches ever — every Monday window through 2026-08-17 has passed
  empty; the B1 diagnosis row remains the open path.
  **2026-08-30 → 31 — diagnosed, built, and then the picture moved.** The Mend side
  was checked at developer.mend.io: App installed, Interactive mode, schedule
  evaluating correctly (its own job log says "Matches schedule on monday"), and a
  manual trigger (job `ea8d7e50`) died mid-`pnpm update` with no error emitted —
  a Community/Free-tier resource ceiling for this monorepo, not a config defect
  (full write-up: [archive/renovate-b1-diagnosis-plan.md](renovate-b1-diagnosis-plan.md)).
  The self-hosted fallback shipped the same morning (`renovate.yml`, see Automation
  on a fork above). **Then two things happened on 2026-08-31 that the plan did not
  predict:** (1) the Mend App opened
  [PR #56](https://github.com/jrittelmeyer/next-web-boilerplate/pull/56) at 10:57 UTC
  — `actions/checkout` v7.0.0 → v7.0.1, every CI lane green, `renovate/stability-days`
  passing — **the first scheduled `renovate/*` branch in the repo's history**. So Mend
  *does* deliver the update class that needs no lockfile generation (the
  github-actions manager runs before the pnpm work that gets killed); the Dependency
  Dashboard issue's `updatedAt` is still 2026-07-22, consistent with the run never
  reaching its end. (2) The self-hosted cron's first run (18:28 UTC) **failed at
  startup** — `'token' MUST be passed using its input or the 'RENOVATE_TOKEN'
  environment variable`; `gh secret list` shows no repo secret yet. ⚠️ Two hosts are
  now configured against one repo and the workflow header's dual-run warning is live.
  **Owner decision, not a build row:** (a) add `RENOVATE_TOKEN` and uninstall the
  Mend App — the plan, and what the diagnosis supports for lockfile-bearing PRs; or
  (b) keep Mend, delete `renovate.yml`, and accept that npm-manager PRs may keep dying
  on Mend's tier. Either way, merge or close #56 first (touching
  `.github/workflows/*` needs the `workflow` scope), and the row closes when a
  scheduled `renovate/*` PR from the *chosen* host merges. *Removal condition:* that
  merge. Independent of the choice, the workflow needs its `vars.ENABLE_RENOVATE`
  gate before it is template-safe (BACKLOG B1, filed 2026-09-01 by the seventeenth
  audit — generated projects inherit a weekly failing run until then).

## Dated dependency takes landed 2026-08-10 to 2026-09-02

_Moved verbatim from `docs/MAINTENANCE.md` on 2026-09-02._

  - ~~**2026-08-10 — the `nanoid` 3.3.17 + `dompurify` 3.4.13 park exits**~~ —
    **EXITED 2026-08-12, two days late** (each was due when its fix aged in on
    08-10: nanoid ~10:39 UTC, dompurify ~14:16 UTC; the gap carried no exposure —
    both edges are audit-only and the daily security lane ran green 08-10/11/12).
    One PR per the 2026-08-07 signed spec: registry re-verified at take time
    (3.4.13 = `latest`, no newer release; **3.3.17 taken over 3.3.18** — npm's
    `legacy` tag, an unrelated React-Native fix with no advisory delta, so the
    aged advisory floor won per the postcss 8.5.23 precedent), the bare
    `dompurify:` key promoted to the ranged `"dompurify@<3.4.13": 3.4.13`,
    `"nanoid@<3.3.17": 3.3.17` added (in-range for postcss's `^3.3.16` —
    fix-forward), and the signed rider converted `fast-uri: 3.1.5` to its ranged
    form (same bare-key defect; the conversion moved nothing). Allowlist back to
    `[]` — `pnpm audit` zero vulnerabilities, **zero ignored**; the lockfile moved
    exactly two packages; Dependabot #25 + #26 auto-close. Removal conditions now
    live on the ranged keys in `pnpm-workspace.yaml`. The advisory detail this
    entry used to carry lives on those keys' comments (nanoid: GHSA-2v37-7h3g-55p8,
    HIGH, functions never invoked here; dompurify: GHSA-55q2-fjhq-7xh7, moderate,
    audit-ledger-only edge — the real fix channel is the posthog-js Watch line
    below).
  - ~~**2026-08-14 ~16:41 UTC — `nanoid` 3.3.18** ages in~~ — **TAKEN 2026-08-14
    ~17:08 UTC**, on schedule. **GHSA-2v37-7h3g-55p8 WIDENED 2026-08-13T15:43Z** —
    the 3.x vulnerable range moved to `<3.3.18` (first-patched 3.3.18), so the
    08-12 exit's 3.3.17 was inside it again and the tree re-flagged HIGH. Parked
    (route 1) ~14:10 UTC the same day (3.3.18 was ~2.5h short of the age gate at
    that point); registry re-verified at take time (3.3.18 published
    2026-08-07T16:41Z — gate cleared). The ranged override promoted
    `"nanoid@<3.3.17": 3.3.17"` → `"nanoid@<3.3.18": 3.3.18` and the
    `auditConfig.ignoreGhsas` entry was deleted in the same change (back to `[]`).
    `pnpm audit` — zero vulnerabilities, zero ignored. Exposure analysis
    unchanged throughout (postcss's sole edge calls plain `nanoid(6)`; the
    vulnerable custom-generator functions are never invoked here). **Rider —
    DONE 2026-08-14:** the bare `brace-expansion: 5.0.9` key converted to its
    ranged form in the earlier same-day change (audit F5 — same file, same
    unsatisfiable-removal class the 08-12 PR fixed for fast-uri).
  - ~~**2026-08-10 ~20:34 UTC — `next` 16.3.0** ages in~~ — ~~**superseded 2026-08-14,
    take `next` 16.3.1 instead**~~ — **16.3.1 TAKEN then REVERTED 2026-08-22, defer
    to `next` 16.3.2 (ages in 2026-08-28) — and the retake target has moved again:
    `next` 16.3.3 (published 2026-08-25T15:32Z, registry-verified 2026-08-26) is
    Vercel's August security release (two critical CVEs per its advisory post);
    it ages in ~2026-09-01, or qualifies for the age gate's security-only
    exception routes. Owner call, plan → sign-off; the 16.3.2 retake plan below
    (riders, order-dependent verification, the Docker standalone check) applies
    to 16.3.3 unchanged.** 16.3.0 is aged and due, but a plan →
    contrarian pass the same day found a live regression: `next/image`'s optimizer
    calls `sharp.block()` and only selectively unblocks raster formats, not SVG (the
    block/unblock registry is process-global), so any `next/image` optimization
    request permanently blocks SVG decoding for the rest of the process — breaking
    `next/og`'s `ImageResponse` (satori renders JSX → SVG, sharp rasterizes it).
    Verified against Next.js's own PR (`vercel/next.js#96733`, merged into the
    `next-16-3` branch 2026-08-06 — three days *after* 16.3.0 shipped — whose own
    verification note reproduces the break via `test/e2e/og-api/index.test.ts`)
    rather than taken on the contrarian's word alone. This repo has three files on
    that exact surface: `opengraph-image.tsx`, `icon.tsx`, `apple-icon.tsx` (all
    `ImageResponse`, confirmed by grep). `next` 16.3.1 was the first stable release
    carrying the fix, and was taken 2026-08-22 (full gate, both E2E CI lanes, a
    manual `:3100` `next start` live-verify, `sharp` override removed per its met
    removal condition) — **but CI's Docker image job caught a SECOND, independent
    regression**: `output: 'standalone'`'s runtime (the code path only the Docker
    build exercises, never `next start`) crashed at boot,
    `Cannot find module '.../@swc/helpers/esm/_interop_require_default.js'`. Root
    cause: 16.3.1 bumped bundled `@swc/helpers` `0.5.15`→`0.5.23`, whose `exports`
    map added a `module-sync` condition that build-time file tracing (resolves
    `default`→`cjs/`) and Node ≥22.12's runtime resolver (resolves `module-sync`→
    `esm/`) disagree about under pnpm's `.pnpm` virtual store — matches
    vercel/next.js#97356/97358/97547/97597/97598/97599 exactly. Already fixed
    upstream (PR #97372, backported as #97453) and **that fix is one of the six PRs
    in `next` 16.3.2's own release notes** — confirmed via the GitHub compare API
    that #97453's merge commit sits in the `v16.3.1...v16.3.2` range. **Reverted the
    16.3.1 take rather than bypass the 7-day age gate for 16.3.2** (a `contrarian`
    pass on that bypass plan flagged it would need all 9 lockstep packages
    enumerated — `next` + 8 `@next/swc-*` platform binaries — plus a rewrite of the
    age-gate's authoritative rule text, since its three documented exception routes
    are security-only): `16.2.12` predates 16.3.0 entirely, so it never had the
    SVG-blocking regression in the first place, and nothing is lost waiting the
    ~6 remaining days for 16.3.2 to clear the gate normally. Full incident record:
    [CHANGELOG](../../CHANGELOG.md) 2026-08-22.
    **Rider, found by the 2026-08-06 audit, applies again to the 16.3.2 retake**
    (re-verify at build time): pins `sharp ^0.35.3` and `postcss 8.5.23` identically
    to 16.3.1 (registry-confirmed 2026-08-22), so the take plan should again
    **remove the `sharp: 0.35.3` override** (its removal condition — next's own pin
    ≥0.35.0 — is met) and re-check the postcss override's second condition (natural
    tree resolution ≥8.5.23 — already true, independent of the bump).
    **Verification must be order-dependent**: exercise a `next/image` optimization
    first, then hit the OG/icon routes — testing them in isolation would not have
    caught 16.3.0's bug. **New for the retake, learned from the 16.3.1 revert:**
    (a) exercise `output: 'standalone'` locally — an actual `docker build` +
    `docker run` + `/api/health` hit, for both the `web` and `worker` Dockerfile
    targets — before pushing, not just `next start` on `:3100`; the two code paths
    diverge and CI's Docker job is the only lane that exercises the standalone
    runtime; (b) skim the *very next* patch version's changelog for anything
    touching the subsystem just bumped, independent of whether it's flagged as
    security content — the disqualifying test applied to 16.3.2 the first time
    ("is this security-relevant") was the wrong question; "does it fix a known
    regression in what I'm about to pin" is the one that would have caught this
    before CI did.
    **16.3.3 TAKEN 2026-08-26** (August 2026 security release, two critical CVEs
    — full triage + verification in [CHANGELOG](../../CHANGELOG.md) 2026-08-26):
    CVE-2026-75604/GHSA-p293-qw3h-jr36 (Windows-hosted-server RCE) doesn't apply
    (no Pages Router); GHSA-2xp9-vwfh-vxw4/GHSA-g89c-p67h-r497 (AVIF-decode RCE
    via libheif in `sharp`) does — reachable through this repo's Uploadthing
    upload surface — and justified the age gate's route (2) exception (ages in
    naturally 2026-09-01). Exclude scoped to all 10 lockstep packages this time
    (`next` + `@next/env` + 8 `@next/swc-*`), not just bare `next` — the exact
    gap a `contrarian` pass caught before taking it. `sharp: 0.35.3` override
    **removed** — its removal condition ("next's own sharp pin reaches
    >=0.35.0") is met by 16.3.3's own `^0.35.3` floor; the lockfile resolves
    `sharp@0.35.3` naturally without it (confirmed by a no-op reinstall). Full
    gate + 607 tests/coverage/knip/docs:sanity green, lockfile diff surgical.
    **The Docker standalone (`output: 'standalone'`) check — the exact lane that
    caught the 16.3.1 regression — could not be completed in the take session**
    (three local builds died on host memory pressure; the owner shipped on full
    gate + a `:3100` live-verify — health, icon/apple-icon/opengraph-image all 200,
    `/_next/image` clean). **CLOSED 2026-08-30:** the CVE-2026-14456 fix
    ([archive/plan-cve-2026-14456.md](plan-cve-2026-14456.md)) built,
    booted and health-checked **both** `runner` and `worker` images locally on
    16.3.3, and CI's Docker image job has been green since (`e5e99f0`, `c69eb6e`,
    PR #56). Correction recorded there too: that job had been red since 08-27 on
    the base image's `libssl3`/`libcrypto3` CVE, not on memory — the 16.3.3 row's
    "host memory exhaustion" framing described the local build, not the lane.
  - ~~**2026-09-01 ~15:32 UTC — the `next` 16.3.3 `minimumReleaseAgeExclude` goes
    inert**~~ — **DONE 2026-09-02, on schedule.** The **ten**-entry block (`next` +
    `@next/env` + 8 `@next/swc-*`; the 16.3.3 entry below said "all 9" — a miscount the
    2026-09-01 audit's contrarian caught) is deleted from `pnpm-workspace.yaml`, and
    that file's `vite` comment is corrected in the same edit ("we never import vite
    directly" was wrong — `packages/ui/package.json:53` declares `vite: 8.0.16` as a
    devDep for Storybook's `@storybook/react-vite` builder; the comment now says the
    override keeps that direct pin and every transitive copy in lockstep). The gate is
    unconditional again with zero exclusions. **Proof is CI's frozen install, not the
    local one** — pnpm reads publish times from registry metadata that can be cached
    locally, so a local green is the weaker signal (a refinement on the 07-28/08-06
    removals, which leaned on the local run).

## better-auth 1.6.26 and 1.6.30 takes (2026-08-14, 2026-08-26)

_Moved verbatim from `docs/MAINTENANCE.md` on 2026-09-02._

  - ~~**2026-08-11 ~21:20 UTC — `better-auth` 1.6.26** ages in~~ — **TAKEN
    2026-08-14.** Registry-verified over `latest` (1.6.28, published
    2026-08-13T22:40Z) and 1.6.27 (2026-08-11T17:59Z) — both still inside the
    7-day gate at take time, and their release notes carried nothing over 1.6.26
    worth jumping the gate for (Suspense/CLI/type fixes only, no advisories).
    Bumped `better-auth` `^1.6.25` → `^1.6.26` in both `apps/web/package.json`
    and `packages/auth/package.json`, plus `@better-auth/passkey` `1.6.25` →
    `1.6.26` (exact pin, its `peerDependencies.better-auth` registry-confirmed
    `^1.6.26` first). **Schema-diffed the installed 1.6.26 artifacts against
    1.6.25 before building** (`packages/auth/AGENTS.md`'s standing rule): a
    contrarian pass on the plan found the diff procedure itself was incomplete —
    it only covered `better-auth`'s own `dist/plugins/*/schema.mjs` files, missing
    that the `user`/`session`/`account`/`verification` core tables live in the
    separate `@better-auth/core` package and that `@better-auth/passkey`'s table
    is inline, not a separate file. Both were independently diffed too (also
    byte-identical) and the leaf rule corrected for future bumps. **No migration
    needed.** Full gate + `@repo/auth`'s 38-test unit suite green. Live-verified
    on a fresh prod build (`:3100`, email blanked): sign-up, sign-in, full 2FA
    enrollment + challenge round-trip (via the repo's own `totp.ts` helper), an
    organization invite-and-accept round-trip, admin set-role + ban, and —
    1.6.26's own behavioral change — deleting an account with 4 active sessions
    confirmed all 4 gone from `session` in the same request. One gotcha hit and
    fixed mid-verify: port 3100 was held by an unrelated project's orphaned
    server from a prior session (`civicmatch`, running since 08-12) answering
    health checks and auth calls with plausible-looking responses that never
    touched this repo's DB — caught by cross-checking the listener PID's command
    line and confirming rows actually landed in `nwb-postgres`/`appdb`, not by
    the response shape alone.
  - ~~**2026-08-24 ~19:11 UTC — `better-auth` 1.6.30** ages in~~ — **TAKEN
    2026-08-26.** Registry re-verified fresh at take time: 1.6.30 (published
    2026-08-17T19:11Z) is still the newest 1.6.x — `latest` moved to 1.7.1
    (2026-08-18), confirmed a breaking minor per the 1.7.x guard below, not a
    supersession. None of 1.6.27–1.6.30 carries a CVE; the one access-control
    fix in the window (SSO org auto-assignment trusting an unverified provider
    domain, 1.6.29) is scoped to `@better-auth/sso`, which this repo doesn't
    use. Bumped `better-auth` `^1.6.26` → **exact `1.6.30`** in both
    `apps/web/package.json` and `packages/auth/package.json` — **not** a caret
    range: `^1.6.30` let `pnpm install` silently resolve to `1.7.1` (now that
    1.7.x exists in-range), pulling in `@better-auth/core@1.7.1` transitively
    and defeating the whole point of staying on 1.6.x. Exact-pinning is now the
    rule for this dependency going forward, matching `@better-auth/passkey`'s
    existing exact pin (`1.6.26` → `1.6.30`, lockstep peer confirmed via the
    registry). **Schema-diffed the installed 1.6.30 artifacts against 1.6.26
    across the full surface** (`better-auth` plugin `schema.mjs` files,
    `@better-auth/core`'s `dist/db/`, passkey's inline schema): every runtime
    `.mjs` schema file byte-identical; only `.d.mts` type declarations and one
    unused re-export (`organization/schema.mjs` dropped `invitationStatus`/
    `roleSchema` from its exports, neither referenced in this repo) changed.
    **No migration needed.** Full gate green (lint/type-check/build). Live-verified
    on a fresh prod build (`:3100`, email blanked): sign-up, sign-in, full 2FA
    enrollment + challenge round-trip (the repo's own `totp.ts` algorithm,
    reimplemented in the verify script), an organization invite-and-accept
    round-trip, admin set-role + ban (confirmed the banned user can no longer
    sign in), and deleting an account with 2 active sessions — confirmed both
    gone from `session`, and the `user` row itself gone, not just the deleting
    session. Port 3100 was free this time (no orphaned squatter). Throwaway
    `verify-*@example.com` users cleaned from `appdb` after verification.
    ⚠️ **`better-auth` 1.7.x (`latest` since 2026-08-18) is still NOT a routine
    take**: a breaking minor — 15 breaking changes incl. account identity
    scoped by issuer (requires migration), captcha paths needing explicit
    wildcards (this repo wires CAPTCHA), SCIM/MCP extractions. Plan →
    sign-off when there's a reason to move; no advisory forces it.
    `@better-auth/passkey` 1.7.1 exists for lockstep when that day comes.

## sharp override removed 2026-08-26

_Moved verbatim from `docs/MAINTENANCE.md` on 2026-09-02._

  - ~~`sharp: 0.35.3` → remove when **next**'s own sharp pin reaches >=0.35.0 (16.2.11
    still pins `^0.34.5`, excluding the libvips CVE fix — re-checked 2026-07-22)~~ —
    **REMOVED 2026-08-26 with the `next` 16.3.3 take**: 16.3.3 pins `^0.35.3`, so the
    condition is met and the lockfile resolves `sharp@0.35.3` unaided (confirmed by a
    no-op reinstall). This bullet was left reading as active until the 2026-09-01
    audit's sweep caught it. Its `/_next/image` runtime path stays e2e-covered since 2026-07-22
    (`apps/web/e2e/image-optimization.spec.ts`) — a sharp that installs but no
    longer transforms turns the e2e lane red instead of passing silently.

## Advisory batch 2026-07-27

_Moved verbatim from `docs/MAINTENANCE.md` on 2026-09-02._

- **Advisory batch 2026-07-27** (closed [#10](https://github.com/jrittelmeyer/next-web-boilerplate/issues/10),
  red since 2026-07-25) — three highs, one of them a **direct** dependency:
  - **`better-auth` 1.6.20 → 1.6.23** (with `@better-auth/passkey` in lockstep).
    GHSA-qq9h-g4jm-xgf3 (CVSS 8.3, account takeover via pre-account) was **live-exposed
    here**, not transitive: its four preconditions — version `<1.6.22`, the magic-link
    or email-OTP plugin, email+password with open registration, and an account
    pre-existing at the address — all hold whenever `isEmailConfigured()` is true, which
    is the intended production path and is inherited by every derived project. 1.6.23 is
    the newest patched release clearing the 7-day gate. **Follow-up CLOSED 2026-07-30 —
    1.6.25 installed** (with `@better-auth/passkey` in lockstep) once it cleared the
    gate at 15:48:12Z. Not advisory-driven and **no migration**: the 1.6.23→1.6.25 model
    definitions were diffed against the installed artifacts and every difference is
    cosmetic. See the CHANGELOG **Security** entry for the 1.6.24 `Origin`-enforcement
    behaviour change on the magic-link / email-OTP send endpoints.
  - postcss + brace-expansion: see the retargeted override bullets above.
  - **The 2026-07-26 daily audit's green was a false green** — the advisory endpoint
    returned invalid JSON and `--ignore-registry-errors` turned that into exit 0, so
    the run never audited and left #10 untouched. **Both** lanes now assert the
    "…vulnerabilities found" trailer a completed report always emits, mirroring the
    guard `security-triage-issue.sh` already applied before closing the issue:
    `ci.yml`'s merge gate (so a PR can't merge on an unaudited tree) and
    `security-audit.yml`'s **Propagate audit status** (which previously gated only on
    a non-zero exit, so an outage skipped it and the run concluded *success*). Issue
    state was never wrong — the script's guard held — but the **run conclusion** was,
    and that is what a human reads in `gh run list`. A genuine npm outage now turns
    both lanes red and needs a re-run; that is the safe direction to fail.

## Advisory batch 2026-08-04 (#5)

_Moved verbatim from `docs/MAINTENANCE.md` on 2026-09-02._

- **Advisory batch 2026-08-04 (#5** — closed
  [#41](https://github.com/jrittelmeyer/next-web-boilerplate/issues/41), red since
  2026-08-03/04**)** — nine advisories (4 high, 5 moderate) across five packages, every
  path build/dev/test tooling; `brace-expansion` 5.0.9 (the ninth) merged separately as
  PR #38. The batch's lesson: **two of the nine were against our own previous
  remediation pins** (fast-uri 3.1.4, postcss 8.5.20) — an override is a standing
  liability, and `pnpm audit` re-judging pinned values live is exactly how both
  surfaced. New overrides, both RANGED deliberately (a bare key pins every future
  resolution so its own removal condition can never fire, and would force a future
  undici@8 copy cross-major *down*; a ranged key self-neutralizes and leaves new copies
  for `pnpm audit` to judge loudly):
  - `"undici@<7.29.0": 7.29.0` → five advisories at once (GHSA-4cwx-7wf7-3272, high,
    plus four moderates), reached only via vitest→jsdom (test tooling). In-range for
    jsdom's own `^7.25.0`. Remove when the lockfile's undici entry moves past 7.29.0
    (the key is inert from that moment).
  - `"socket.io-parser@<4.2.7": 4.2.7` → GHSA-2m8v-j782-fhvr (high, zero-attachment
    memory exhaustion), via react-email's dev preview server. In-range for socket.io's
    own `~4.2.4` — the lockfile's 4.2.6 simply predated the fix. Remove when the
    react-email chain re-resolves >=4.2.7.
  - postcss (second retarget) + fast-uri (parked GHSA — **exited on schedule
    2026-08-07**, the override now 3.1.5): see their bullets above.
  Dependabot alerted on **only the undici five**; `pnpm audit` caught all nine — the
  authoritative-gate ranking holds.

## Age-exclude for next 16.2.11 (closed 2026-07-28)

_Moved verbatim from `docs/MAINTENANCE.md` on 2026-09-02._

- ~~**`minimumReleaseAgeExclude` for `next` + `@next/*`**~~ — **CLOSED 2026-07-28, on
  schedule.** 16.2.11 (published 2026-07-21T16:00:01Z) cleared the 7-day gate that day;
  every `@next/*` entry in the lockfile is either 16.2.11 (published ~2 minutes *earlier*)
  or `@next/eslint-plugin-next@16.2.9`, so nothing still needed the bypass and a frozen
  install could not break. Proven falsifiably rather than assumed: `pnpm --filter web add
  next@16.2.12 --lockfile-only` is **refused on age grounds with the exclude removed**
  (exit 1, naming `next` and all eight `@next/swc-*` siblings) and **succeeds with it
  restored** (exit 0). Note the removal is a **no-op at install** — `apps/web` declares
  `^16.2.11`, which the lockfile already satisfies, so a lockfile-driven install never
  consults the registry; the gate re-arms at the next *resolution* (Renovate, `pnpm add`).
  16.2.12 becomes admissible 2026-08-01.

## next 16.2.12 (taken 2026-08-02)

_Moved verbatim from `docs/MAINTENANCE.md` on 2026-09-02._

- ~~**`next` 16.2.12 admissible but not taken**~~ — **TAKEN 2026-08-02**, with
  `@next/eslint-plugin-next` in lockstep. Registry-verified at the time: `dist-tags.latest`,
  published 2026-07-25T20:45:53Z (8 days, past the 7-day gate), **no 16.2.13**. Contents are a
  docs backport plus the TypeScript-7 cherry-picks (vercel/next.js#95831 → #92277, #95639,
  #95692, #95753).
  - **Neither override retires.** 16.2.12 still pins `dependencies.postcss` exactly `8.4.31`
    (below the 8.5.18 key floor) and `optionalDependencies.sharp` `^0.34.5` (below the 0.35.0
    condition). Read off the published manifest, not inferred — `pnpm-workspace.yaml` is
    byte-unchanged.
  - **`@next/eslint-plugin-next` needs its own `pnpm add`.** It lives in `tooling/eslint`, so
    `pnpm --filter web add next@…` does not move it, and `manypkg` cannot flag the drift
    because its old `^16.0.0` range diverged from nothing. That is exactly why it sat three
    patches behind the framework it lints. Declared range is now `^16.2.12`.
  - **The verification that mattered was the alias path.** #92277 rewrites `load-jsconfig.ts`
    (+58/−20) to compute an effective base URL for `paths` declared **without** `baseUrl` —
    this repo's hard rule, and what `apps/web/tsconfig.json` does (`@/*` → `./src/*`). Only
    the Next app root's tsconfig is exposed (`packages/jobs` is a standalone worker Next never
    builds; `packages/ui` reaches the app via `transpilePackages`). Proven both ways: `next
    build` re-ran for 71 s — **not** a `FULL TURBO` replay, which on a lockfile change would
    have meant the graph never rebuilt — and `/calendar` rendered real DB rows on a `:3100`
    prod build; **and** `next dev --turbopack` first-compiled clean on `:3106`. The dev check
    is not ceremony: `load-jsconfig` feeds `next dev` too, and the gate never starts a dev
    server, so a dev-only alias regression would reach every consumer unobserved.
  - **This bump lifted the TypeScript-7 re-gate above** — `experimental.useTypeScriptCli` is now
    in a *stable* release. **Corrected 2026-08-02** in its own pass with its own evidence (the
    installed artifact + the flag's shipped docs page), deliberately not inherited from this
    entry: see the TS7 Watch item above for what the flag costs and what still blocks a cutover.

## PROJECT_STATUS date-gated watch paragraph (as of 2026-09-02)

_Moved verbatim from `docs/PROJECT_STATUS.md` on 2026-09-02._

**Date-gated watch** — [MAINTENANCE.md → Watch items](../MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done)
is canonical; the per-program rows above + [CHANGELOG](../../CHANGELOG.md) carry each
landed item. Open now: **Renovate — host choice pending (2026-08-31)**: the
self-hosted `renovate.yml` shipped (BACKLOG B1) but its first cron run failed at
startup — the `RENOVATE_TOKEN` secret is not set — while the Mend App opened the
first scheduled `renovate/*` PR in the repo's history the same morning (#56,
`actions/checkout` 7.0.1, every lane green). Pick one host, then merge/close #56. The
`ENABLE_RENOVATE` gate **shipped 2026-09-02**, so generated projects no longer inherit
a weekly failing run — but enabling here is now a two-action close (secret **and**
variable) with a dated 14-day liveness check · **e2e month-boundary red**
(`3e68733` attempt 1, 09-01: deterministic 00:00–04:00Z on the 1st of each month — B2
fix due before 10-01; MAINTENANCE Watch (c)) ·
**`next` 16.3.4** (published 2026-08-31T20:00Z, untriaged) ages in 2026-09-07; the
16.3.3 `minimumReleaseAgeExclude` was **deleted on schedule 2026-09-02** (gate
unconditional again, zero exclusions).
The 16.3.3 Docker-standalone follow-up **closed 2026-08-30** (the CVE-2026-14456 fix
built, booted and health-checked both images locally; CI's Docker lane green since).
⚠️ **`better-auth` 1.7.x is a breaking minor** (`latest` since 2026-08-18, 1.7.2 now)
— plan → sign-off, not a routine take; no advisory forces the move. Ledger clear as
of 2026-08-26: `nanoid` 3.3.18 +
`better-auth` 1.6.30 + `next` 16.3.3 taken (exact-pinned where the dep warrants it
— see the rows above), `main` green, `auditConfig.ignoreGhsas` `[]`, `pnpm audit`
zero vulnerabilities / zero ignored. The verbatim history this paragraph used to carry:
[archive/PHASE_HISTORY.md → Archived 2026-08-19](PHASE_HISTORY.md#archived-2026-08-19-status-watch-and-overrides-history).
## BACKLOG Watch bullets (as of 2026-09-02)

_Moved verbatim from `docs/BACKLOG.md` on 2026-09-02._

- **TypeScript 7 cutover** — GA'd (`typescript@7.0.2`) but ships no JS Compiler API. The Next-side gate lifted 2026-08-02 (`experimental.useTypeScriptCli` in stable `next@16.2.12`), **but that is no longer the binding constraint**: ⚠️ **TS 7 ships no `tsserver`**, so a cutover would leave the editor and the `next` tsserver plugin without a language service — and no CI lane can observe that, which is why the "run a trial" re-gate was retired on 2026-08-02 in favour of a checkable one. **Re-gated on TS 7.1** (~Q4 2026). Hold Renovate's `typescript` v7 major.
- **Calendar Phase 6 — sharing & interop** — the calendar's next program. Not started, and until 2026-08-02 not tracked anywhere despite ~30 in-code and in-doc "Phase 6" commitments; see the B2 row below.
- **Calendar reminders — three accepted limits** (end-anchored reminders · guest reminders · reader-zone email rendering), plus the sweeper's fixed 60-minute look-back as a deployment knob. Each was recorded in a doc or a source comment and tracked nowhere. ⚠️ Dropping the `anchor` CHECK **alone** yields a reminder that silently never fires.
- **A global `now` for relative-time formatting** — deferred and self-gating; no route server-renders a `relativeTime` yet. Add it alongside the first one.
- **Maintenance-only (Tier 3 G)** — the standing state since 2026-07-17 (verified 100.0/100). **Renovate delivery — the picture changed 2026-08-31:** after a month of empty Monday windows, the self-hosted `renovate.yml` fallback shipped (B1 row below), its first cron run failed for want of the `RENOVATE_TOKEN` secret, and the same morning the Mend App opened the first scheduled `renovate/*` PR ever (#56, CI green). Which host stays is the owner's call — options + evidence in [MAINTENANCE.md](../MAINTENANCE.md). The `ENABLE_RENOVATE` gate that makes `renovate.yml` template-safe **shipped 2026-09-02**; enabling now takes two actions (secret **and** variable), so a dated 14-day liveness check rides with it in [MAINTENANCE.md](../MAINTENANCE.md) — a forgotten variable reproduces the same silent zero-PR observable that hid the Mend failure for six weeks.
- **Three distinct e2e defects — and the lane has gone red twice (2026-08-03, PR #34 attempt 1: 1 failed · 9 flaky · 56 passed; 2026-09-01, `3e68733` attempt 1 — the deterministic month-boundary defect, (c) in MAINTENANCE and a B2 row below).** They are separate defects and the old single row conflated them; full detail + removal conditions in [MAINTENANCE.md](../MAINTENANCE.md). **(a) The signup hang — DIAGNOSED and FIXED 2026-08-03** (`e2e/support/auth.ts`): the helper clicked "Create account" **before React hydrated the form**, so no request was ever issued and `waitForURL` hung on a page that had submitted nothing. Reproduced 8/8 under 6× CPU throttling; the CI log agrees (hung attempts left no server-side signup line, so the account was never created). Fixed by settling the form, then awaiting the auth response beside the click and asserting its status. ⚠️ **Two hypotheses were tested and RULED OUT** — a Next `router.push`+`refresh` race (30/30 clean on 16.2.12, and the missing server line disproves its required shape) and the 5/60s rate limiter (zero 429s in the failing log). Don't revive either without new evidence. **(b) The `set-active` hang** (`e2e/organization.spec.ts:43`) — this is what died at Retry #2 and turned the lane red. Root cause still **unknown**; the 2026-08-03 change removed `r.ok()` from its predicate so a non-2xx names itself instead of hanging, and made all three Playwright lanes produce reports + traces. **Next red is the evidence — read the artifact before theorising.**
- **Temporary security overrides** — ten `overrides:` in `pnpm-workspace.yaml` (nine security + the `vite` freshness pin), each key carrying its own dated why-comment and removal condition in that file; `auditConfig.ignoreGhsas` is `[]` (zero ignored, `pnpm audit` clean) as of 2026-08-26. The park/exit machinery and the three-route rule live at `minimumReleaseAge` in that file + [MAINTENANCE.md](../MAINTENANCE.md) (canonical). Current edge: `nanoid` closed at `"nanoid@<3.3.18": 3.3.18` (taken 2026-08-14) and the `sharp` override retired 2026-08-26 with the `next` 16.3.3 take (its removal condition — next's own sharp pin ≥0.35.0 — met; see [MAINTENANCE.md](../MAINTENANCE.md) · [CHANGELOG](../../CHANGELOG.md)). `minimumReleaseAgeExclude` is **empty again as of 2026-09-02** — the `next` 16.3.3 ten-entry block was deleted on schedule once 16.3.3 aged past the 7-day gate, so the gate is unconditional with zero exclusions. Full history (the fast-uri graduation, the dompurify/nanoid parks, the two dated age-excludes): [archive/PHASE_HISTORY.md → Archived 2026-08-19](PHASE_HISTORY.md#archived-2026-08-19-status-watch-and-overrides-history).
- **`contrarian` subagent — evaluated 2026-07-28, kept** — it cleared its acceptance bar twice (incl. catching its own `Bash` grant contradicting a "read-only" description). Kill criterion committed: three consecutive merged ALWAYS-path PRs with no `## Contrarian disposition` PR-body section ⇒ the policy is dead. Registration is **surface-dependent** (a reload does not fix it) — fallback recipe: [CONVENTIONS.md → Agent tooling](../context/CONVENTIONS.md#agent-tooling-claude).
- **`main` has no branch protection** — `gh api …/branches/main/protection` → 404, so no status check is actually required. Every merge-ordering discipline is self-imposed. Owner decision, not a build row.
- **Ship a real derived product end-to-end** — owner-driven, in flight (via `/project-init`); unlocks the gated B1 intake-drop row and feeds the on-ramp rows with real lessons.
## BACKLOG B4 TypeScript 7 row (as of 2026-09-02)

_Moved verbatim from `docs/BACKLOG.md` on 2026-09-02._

| B4 | Toolchain | **TypeScript 7 cutover** (outside the program) | STACK.md | The Next-side gate LIFTED 2026-08-02 (`experimental.useTypeScriptCli` in stable `next@16.2.12`, verified in the installed artifact) — **but the binding constraint turned out to be something no cutover trial could see.** ⚠️ **TS 7 ships no `tsserver`** (`bin: { tsc }` vs TS 6's `{ tsc, tsserver }`): the editor's "Use Workspace Version" and the **`next` tsserver plugin** (`tooling/typescript/nextjs.json`) would have no language service, so the editor would check with a *different compiler than the build* — and **no `ci.yml` lane runs an editor**. Two further costs land on the **template surface**, which `init-app.mjs` ships verbatim: TS 7 is a native binary for 20 tuples with **no musl variant** (the builder is `node:24-alpine`), and `next.config.ts`'s `experimental` key exists only in nonce mode, so the flag must be *merged* into it, not added beside it. **The 2026-08-02 "run a trial" re-gate is RETIRED** — a green trial would not have licensed the cutover. ***New removal condition:*** `typescript@7.1.x` stable **and** a language service exists **and** `react-docgen-typescript` resolves against it. Cutover mechanics, corrected: the bump is **10** specifiers, not 9 (`packages/calendar` postdates the earlier note), and needs **no** `minimumReleaseAgeExclude` — but should pin **exactly**, since the gate binds what a range resolves to and TS publishes daily. Full detail in Watch above. Costs no audit points. |
## BACKLOG B1 Renovate row (as of 2026-09-02)

_Moved verbatim from `docs/BACKLOG.md` on 2026-09-02._

| B1 | Tooling / deps | **Restore Renovate PR delivery** — `.github/workflows/renovate.yml` built 2026-08-31 (self-hosted `renovatebot/github-action`, SHA-pinned, reuses `.github/renovate.json` unchanged) after diagnosis at developer.mend.io ruled out every repo-side and account-side cause (App installed, Interactive mode, correct schedule evaluation) and a manual trigger's job log (`ea8d7e50`) showed the run killed mid-`pnpm update` with no error emitted — a Mend Community/Free-tier resource ceiling, not a config defect | [MAINTENANCE.md → Automation on a fork](../MAINTENANCE.md#automation-on-a-fork--new-repo) · [diagnosis](renovate-b1-diagnosis-plan.md) | **Owner decision pending (2026-08-31):** the first cron run (18:28 UTC) failed at startup — `'token' MUST be passed … RENOVATE_TOKEN`; `gh secret list` shows no repo secret — and the same Monday the Mend App opened [#56](https://github.com/jrittelmeyer/next-web-boilerplate/pull/56) (`actions/checkout` 7.0.1, every lane green), the first scheduled `renovate/*` PR ever: Mend does deliver the no-lockfile class (the Dependency Dashboard's `updatedAt` is still 2026-07-22, so its run still never finishes). Pick **one** host — (a) add `RENOVATE_TOKEN` (classic PAT, `repo` + `workflow`) and uninstall the Mend App, per the plan; or (b) keep Mend, delete `renovate.yml`, and accept that lockfile-bearing PRs may keep dying on Mend's tier. Never both: the duplicate-dashboard race in the workflow header is live now. Then merge/close #56 (10/10 checks green as of 2026-09-01; it touches `ci.yml`/`codeql.yml`/`pages.yml`/`security-audit.yml` — **not** `renovate.yml`, which postdates it and keeps `actions/checkout` v7.0.0; the `workflow` scope is needed) and confirm a scheduled `renovate/*` PR from the chosen host; move to Shipped once observed. Independent of the choice, and now **shipped** (2026-09-02): the fork-safe `ENABLE_RENOVATE` gate, so a generated project no longer inherits the weekly red — but enabling here is now a **two**-action close (secret **and** variable), tracked by a dated 14-day liveness check in MAINTENANCE. Evidence 2026-09-01: 58 outdated (66 on 08-19); exact-pinned `posthog-js` 32 minors behind, `@sentry/nextjs` 14, `knip` 10, `stripe` 4. |