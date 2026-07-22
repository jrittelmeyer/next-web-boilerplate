# Project Audit — 2026-07-22 (tenth scoring pass — second maintenance-mode pass)

> The `/project-audit` skill's tenth run. Prior pass:
> [PROJECT_AUDIT_2026-07-18.md](PROJECT_AUDIT_2026-07-18.md), **100.0/100**.
>
> **Method.** (a) **Git-bounding:** `git diff d062ab3..HEAD` (`d0f6264`) — **32
> files, +1,128/−249**. The product-code surface (`apps/` · `packages/` ·
> `tooling/` · `e2e` · `docker/` · `drizzle`) changed by exactly **2 files, 2
> lines** — the M-1 `postgres:16`→`18` comment fix the last pass backlogged.
> Everything else is docs, two workflow files (the `ci.yml` heartbeat + the new
> `pages.yml`), committed `.claude/` installer output, `pnpm-workspace.yaml`
> overrides + `pnpm-lock.yaml`, 8 lines of `scripts/init-app.mjs`, and
> `intake/README.md`. **All 20 feature groups carry the 07-17/07-18 verified-100
> findings by identity** except where the changed surface or a time-sensitive
> check touches them. (b) **Live checks via the alerts APIs, not workflow
> conclusions** (the pass-8 addendum's standing method). (c) **Currency & gates:**
> every externally-gated row re-verified against the registry.
>
> **Headline: overall 99.65/100 — the 100 did not hold.** No code regressed;
> nothing in the byte-identical tree moved. The drop comes from three things the
> passage of time and the public surface exposed: **Renovate's scheduled update
> lane has never actually delivered a PR** (37 updates stalled, including the
> three that would retire the temporary security overrides), the **CHANGELOG
> records no security remediation at all** while the same window's cosmetic
> changes are logged, and the `sharp` override now rides a **real runtime path
> that no test exercises**. A fourth item is a labeling correction with
> methodological teeth: three of the four packages remediated on 2026-07-22 were
> never Dependabot alerts — CI's `pnpm audit` lane caught them, and checking
> Dependabot alone would have missed a HIGH on `sharp`.

## Score table

| # | Feature group | 07-18 | Now | This pass's basis |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 100 | **98** | −2: Renovate's scheduled lane is configured but has never produced a PR (F1). Every other tooling claim re-verified |
| 2 | Framework & app architecture | 100 | **100** | Byte-identical — carries |
| 3 | Database | 100 | **100** | Byte-identical — carries; M-1 comment fix landed |
| 4 | Auth & access control | 100 | **100** | Byte-identical — carries |
| 5 | API layer (tRPC + Actions) | 100 | **100** | Byte-identical — carries |
| 6 | UI & design system | 100 | **100** | Byte-identical; Storybook gallery now published + reachable (HTTP 200) |
| 7 | State & data fetching | 100 | **100** | Byte-identical — carries |
| 8 | Forms & validation | 100 | **100** | Byte-identical — carries |
| 9 | Email | 100 | **100** | Byte-identical — carries |
| 10 | Payments (Stripe) | 100 | **100** | Byte-identical — carries |
| 11 | File uploads | 100 | **99** | −1: the `sharp` override rides `/_next/image` (used by `uploads-list.tsx`) with zero test coverage (F4) |
| 12 | Search | 100 | **100** | Byte-identical — carries |
| 13 | Background jobs | 100 | **100** | Byte-identical — carries |
| 14 | Observability | 100 | **100** | Byte-identical — carries |
| 15 | Security | 100 | **99** | −1: no security remediation appears in CHANGELOG (F2); override retirement is blocked behind F1. Posture itself strong: 0 code-scanning alerts, scoped overrides, audit lane caught what Dependabot missed |
| 16 | Testing & CI | 100 | **99** | −1: image-optimization path untested while carrying an overridden native dep (F4). Heartbeat + Pages lanes verified; 26 spec files |
| 17 | Deployment & ops | 100 | **100** | `pages.yml` verified line-by-line against DEPLOYMENT.md — least-privilege perms, SHA-pinned, subpath-safe, `cancel-in-progress: false`. Every claim true |
| 18 | Docs & DX | 100 | **98** | −2: the "4 Dependabot alerts" mislabel across five places (F3) + the CHANGELOG gap (F2) |
| 19 | Internationalization | 100 | **100** | Byte-identical — carries |
| 20 | Realtime / SSE | 100 | **100** | Byte-identical — carries |
| | **Overall (mean)** | **100.0** | **99.65** | |

## Findings

### F1 — Renovate's scheduled update lane has never delivered a PR (new)

The checkable facts:

- **Zero `renovate/*` branches exist on the remote** (`git ls-remote --heads
  origin 'refs/heads/renovate/*'` → empty).
- **Every PR this repo has ever received** (#2–#8) was created
  **2026-07-18T19:12–19:13Z — a Saturday** — by manually ticking Dependency
  Dashboard approval checkboxes for the seven held majors. Approval clicks
  bypass the schedule; they are not evidence the scheduled lane works.
- **The one Monday window that has elapsed since onboarding** (Renovate's
  dashboard issue was created 2026-07-15) was **2026-07-20 00:00–06:00 UTC**. It
  produced nothing, despite **37 updates sitting in "Awaiting Schedule"**.
- Renovate itself **is alive** — it refreshed the dashboard issue
  2026-07-22T16:41:49Z, hours before this audit.

The mechanism: `.github/renovate.json:9` sets `"schedule": ["before 6am on
monday"]` with **no `timezone` key** (Renovate defaults to UTC), giving a
**6-hour window per week** in which branches may be created. Mend's hosted app
must execute a run *inside* that window; a run at any other time only refreshes
the dashboard — which is exactly the observed behavior.

Why it matters beyond tidiness: three of the stalled updates are
`postcss@<8.5.10 → 8.5.19`, `@esbuild-kit/core-utils>esbuild → 0.28.1`, and
`effect → 3.22.0` — the precise bumps that would **retire the temporary security
overrides** whose removal conditions [MAINTENANCE.md](../MAINTENANCE.md) tracks.
The documented posture ("let Renovate drive deps") is currently unfulfilled, and
every downstream project copies this `renovate.json` verbatim, inheriting a
dependency pipeline that may silently never fire.

Honest bound on the claim: Mend's run log isn't readable from here, so a missed
window is inference, not proof. But zero branches ever created, one elapsed
window, and 37 ready items are consistent with it and the fix is one line.
[BACKLOG.md](../BACKLOG.md) already noted the batch "has not opened" — this pass
reframes it from *waiting* to *blocked*.

### F2 — The CHANGELOG records no security remediation (new)

`grep -iE "dependabot|advisor|override|vulnerab|GHSA|CVE|sharp|postcss|effect"`
over `CHANGELOG.md` returns **zero hits**. Neither the 2026-07-15 override trio
nor the 2026-07-22 batch appears anywhere — while the same `[Unreleased]`
section does record the Storybook gallery and the screenshot tour from that
window.

For a template whose documented update path is
[cherry-picking template commits](../GETTING_STARTED.md#staying-current-with-the-template),
this inverts the priority: the 2026-07-22 batch changed **runtime** dependency
resolution — `sharp` forced to 0.35.3 past Next's own `^0.34.5` pin, `dompurify`
bumped underneath `posthog-js` (which ships client-side) — and is the single
most consequential recent change for a consumer deciding what to pull.

### F3 — Three of the four "Dependabot alerts" were never Dependabot alerts (drift)

Dependabot has raised **exactly four alerts in the repo's lifetime**:

| # | Package | GHSA | State |
| --- | --- | --- | --- |
| 1 | esbuild | GHSA-67mh-4wv8-2f99 | fixed 2026-07-15 |
| 2 | effect | GHSA-38f7-945m-qr2g | fixed 2026-07-15 |
| 3 | postcss | GHSA-qx2v-qp2m-jg93 | fixed 2026-07-15 |
| 4 | brace-expansion | GHSA-3jxr-9vmj-r5cp | open (see F5) |

`sharp`, `dompurify`, and `fast-uri` **never produced a Dependabot alert**. They
were caught by the CI `pnpm audit` lane, which failed run `29939053566` on
`c2c07f4` with exactly those advisories (`5 vulnerabilities found — 1 low | 4
high`). Yet the commit message, the `pnpm-workspace.yaml` comment header
("Dependabot remediation (2026-07-22)"), [MAINTENANCE.md](../MAINTENANCE.md)'s
Watch items, [BACKLOG.md](../BACKLOG.md), and
[PROJECT_STATUS.md](../PROJECT_STATUS.md) all describe the batch as Dependabot
alerts.

This is more than pedantry — it inverts which gate is authoritative. The pass-8
addendum's lesson was "query the alerts APIs, not workflow conclusions." This
window shows the complement: **`pnpm audit` is the stronger gate here, and
Dependabot is the weaker signal.** A maintainer verifying only "0 open
Dependabot alerts" would have shipped a HIGH advisory on `sharp` sitting in
Next's image-optimization path. Doc-side labels are corrected in this pass; the
`pnpm-workspace.yaml` comment is a config file, so it rides the backlog row per
the M-1 precedent.

### F4 — The `sharp` override rides an untested runtime path (new)

`sharp: 0.35.3` overrides Next 16.2.11's own exact `^0.34.5` optionalDependency
pin. Next uses sharp to power `/_next/image`, and this repo genuinely uses it:
[`uploads-list.tsx:4`](../../apps/web/src/components/uploads/uploads-list.tsx)
imports `next/image` to route `ufs.sh` thumbnails through the same-origin
optimizer, with `remotePatterns` configured at
[`next.config.ts:130`](../../apps/web/next.config.ts).

**No test touches images.** Grepping all 26 spec files for `_next/image`,
`next/image`, or `<img` returns nothing. Green CI proves the tree installs and
builds; it does not prove the optimizer still transforms correctly against a
sharp minor Next does not declare support for. The risk is modest — 0.34→0.35 is
API-stable for Next's usage, and 0.35.3 ships prebuilt binaries for every
targeted platform — but "we forced a native image library past the framework's
pin and nothing exercises it" is exactly the gap a production app discovers in
production.

### F5 — One open Dependabot alert at audit time (transient — recorded, not scored)

Alert #4 (`brace-expansion`, GHSA-3jxr-9vmj-r5cp) is **open** as of
2026-07-22T20:07Z. The fix is genuinely in the tree: `pnpm-lock.yaml` contains
only `brace-expansion@5.0.7` (all four references), and CI's audit lane is green
on HEAD. Alerts #1–#3 took ~12h to auto-close (created 10:06Z → fixed 22:27Z the
same day); this fix pushed at 17:33Z, ~2.5h before the audit. Near-certainly a
pending rescan. Not scored — but it means the "0 open alerts" claim must be
**re-checked rather than assumed** before the next status update.

## Currency & gates (all re-verified; all still hold)

| Gate | Finding |
| --- | --- |
| TS7 cutover | `next` latest **16.2.11** (was 16.2.10); 16.3.0 still `preview.8` / `canary.93` → **gate stands**. `typescript` latest 7.0.2, `next` tag `7.1.0-dev.20260722.1` → still dev-tagged |
| `postcss` override | next@16.2.11 still `dependencies.postcss = 8.4.31` → **still required** |
| `sharp` override | next@16.2.11 still `optionalDependencies.sharp = ^0.34.5` → **still required** |
| `effect` override | `uploadthing@7.7.4` still `dependencies.effect = 3.17.7` → **still required** |
| `esbuild` override | `drizzle-kit` still `0.31.10` → **still required** |
| `fast-uri` deferral | 3.1.4 published **2026-07-19T07:42:54Z** → clears the 7-day gate **2026-07-26T07:42Z**. The deferral and the two `ignoreGhsas` entries are correct; MAINTENANCE.md's "~2026-07-26" is accurate to the hour |
| New major | **`actions/setup-node v7`** has appeared as a pending-approval major (not previously tracked) alongside the correctly-held `typescript v7` |

## Public / consumer surface

All green except where noted under Findings:

- **Storybook on Pages live** — <https://jrittelmeyer.github.io/next-web-boilerplate/>
  returns HTTP 200; README and DEPLOYMENT.md links resolve. Every claim in
  DEPLOYMENT.md's new section verified line-by-line against `pages.yml`.
- **Community health 100%** — CONTRIBUTING, CODE_OF_CONDUCT, LICENSE, SECURITY,
  PR template, and issue forms all present. (GitHub's community-profile API
  reports `issue_template: false` because it only detects the legacy single-file
  form, not the modern `ISSUE_TEMPLATE/` directory — an API quirk, not a gap.)
- **0 open code-scanning alerts** · **0 untriaged issues** (only the Renovate
  dashboard) · **0 open PRs**.
- **Screenshots** — all four assets present in `docs/assets/` and correctly
  referenced from README + FEATURES.
- **CI green on HEAD** (CI + CodeQL). The one red run (`c2c07f4`) is the audit
  lane correctly catching the advisories HEAD then fixed — the gate working, not
  a failure.
- **CI heartbeat** — cron is Thursdays 04:30 UTC, added Monday 2026-07-20, so the
  first scheduled run is due **2026-07-23** and has not fired yet. The docs say
  exactly this; accurate.

## Backlog

| Band | Area | Item | Fixes | Lifts | Effort |
| --- | --- | --- | --- | --- | --- |
| B1 | Tooling / deps | **Widen the Renovate schedule so the batch can actually land** — replace `["before 6am on monday"]` with a full-day window (e.g. `["on monday"]`), add an explicit `"timezone"`, and consider raising `prHourlyLimit`; then confirm on the next window that PRs open | The scheduled lane has produced 0 PRs; 37 updates stalled, incl. the three that would retire the temporary security overrides | Monorepo & tooling +2 | S — one-line config, plus one window to observe |
| B1 | Docs / release | **Record the security remediations in CHANGELOG** — add the 2026-07-15 and 2026-07-22 override batches to `[Unreleased]`, explicitly flagging that `sharp` is forced past Next's own pin on a runtime path | Consumers cherry-picking template commits have no record of the only security-relevant changes | Security +1 · Docs & DX +1 | S |
| B1 | Docs accuracy | **Relabel the non-Dependabot advisories** — `sharp`/`dompurify`/`fast-uri` were caught by CI `pnpm audit`, not Dependabot; state that `pnpm audit` is the authoritative gate and Dependabot supplementary. Doc-side fixed in this pass; the `pnpm-workspace.yaml` comment header still needs it | A mislabel that misdirects the verification method — Dependabot alone would have missed a HIGH on `sharp` | Docs & DX +1 | S — rides the next code touch (M-1 precedent) |
| B2 | Uploads / testing | **Cover the image-optimization path** — assert `/_next/image` returns a transformed response (keyless, against a local asset), so the `sharp` override is exercised rather than merely installed | `sharp: 0.35.3` overrides Next's exact `^0.34.5` on a real runtime path with zero coverage | File uploads +1 · Testing & CI +1 | M — needs a keyless-safe fixture image |

**Owner-side (not backlog):** confirm alert #4 auto-closes; after **2026-07-26**
add `fast-uri: 3.1.4` to `overrides` and drop both `ignoreGhsas` entries; triage
the new `actions/setup-node v7` pending-approval major.

## Considered and excluded (visible decisions)

- **All prior exclusions re-affirmed** — the four advised-against PATH_TO_100
  rows, the `init-app` test harness, scoring `.claude/` kit output as a product
  group, and pass-8's `lib/csp.ts` unit-test exclusion.
- **"Preempting the awaiting-schedule Renovate minors"** — this standing
  exclusion from passes 7–9 is **superseded** by F1. The issue was never that
  the batch needed preempting; it's that the batch cannot land as configured.
- **Self-hosting Renovate as a GitHub Action** (full control over run cadence,
  eliminating the window-intersection problem outright). Excluded for now: it
  adds a workflow, a token to manage, and CI minutes to solve a problem that a
  one-line schedule widening most likely fixes. Revisit only if widening the
  window still produces no PRs.
- **Dropping the Renovate schedule entirely** (continuous PRs paced by
  `prConcurrentLimit`). Defensible and simpler, but the weekly-batch posture is
  a deliberate owner choice that keeps triage bounded — the widening fix
  preserves that intent.
- **Enabling Dependabot security updates** (currently `disabled`). Would put a
  second bot opening PRs against the same lockfile as Renovate, a known conflict
  source; Renovate's `vulnerabilityAlerts` block already handles security bumps
  with `minimumReleaseAge: null`. Correctly left off — noted so the decision is
  visible.

## Won't-fix notes

**None.** The ledger stays empty; all four rows above are recoverable.

## Prioritization statement

**99.65/100 — the first drop since the path-to-100 program closed, and none of
it is code.** Three of the four rows are small, high-breadth, and cheap (two
docs, one config line); the fourth is a modest test-coverage addition. The
highest-value item by a wide margin is **widening the Renovate schedule** —
it is one line, it benefits every downstream copy of this template, and until it
lands the repo's entire dependency-currency posture (including retirement of six
temporary security overrides) is manual. Bands in [BACKLOG.md](../BACKLOG.md)
remain the single source of truth; this report is the scoring record.
