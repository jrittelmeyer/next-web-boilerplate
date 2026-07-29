# Project Audit — 2026-07-29 (twelfth scoring pass)

> The `/project-audit` skill's twelfth run, seven days after the eleventh
> ([PROJECT_AUDIT_2026-07-22B.md](PROJECT_AUDIT_2026-07-22B.md), **99.65/100**).
>
> **Method — git-bounded.** The eleventh pass scored the tree at `c87a3d4`;
> HEAD this pass is `7a04c57` — the tip of the **unmerged PR
> [#13](https://github.com/jrittelmeyer/next-web-boilerplate/pull/13) branch**
> (`fix/false-safety-claims-2026-07-28`, 2 commits ahead of `main`), so this
> report describes `main`-plus-PR-#13; the delta is 22 commits. Product code
> byte-identical to the audited `c87a3d4` tree carries by identity; the pass
> spent its effort on the delta — advisory batch #4 (`better-auth` 1.6.23 +
> migration 0018, override retargets, the fail-closed audit gates), the new
> `security-audit.yml` + triage-issue pipeline, `scripts/docs-sanity.mjs`, the
> image-optimization e2e, the `contrarian` subagent wiring, the
> context-engineering docs program — plus everything time alone invalidates:
> the live GitHub surface (alert APIs, not workflow conclusions), the
> npm-registry gates, and the dated watch rows. Checked 2026-07-29 ~12:00 UTC.

## Headline: **99.9/100 — three of the 07-22 findings closed verified; F1 alone remains, escalated**

The 07-22 pass's F2 (CHANGELOG security record), F3 (Dependabot mislabel), and
F4 (untested `sharp` runtime path) all shipped and are **re-verified closed in
the code this pass** — Security, Testing & CI, File uploads, and Docs & DX
return to 100. F1 (Renovate's scheduled lane) **stands and has escalated**:
the widening fix shipped 07-22 exactly as specified, and the 2026-07-27 Monday
window still produced zero `renovate/*` branches — the failure is now provably
on the Mend app side, and the stall is growing (48 dashboard entries vs 37 on
07-22; 50 `pnpm outdated -r` entries vs 44). Monorepo & tooling stays 98 and
the backlog row converts from "widen and wait" to a diagnosis row.

## Live-surface results

| Check | Result |
| --- | --- |
| CI + CodeQL on HEAD (`7a04c57`, PR #13) | Both **green** (CI concluded success ~12:00 UTC) |
| Code-scanning alerts (API) | **0 open** |
| Dependabot alerts (API) | **1 open — alert #16** (`brace-expansion` ≤5.0.7, HIGH): the *documented, dated deferral* — GHSA-mh99-v99m-4gvg is in `ignoreGhsas` with its removal action due **2026-07-30** (see Owner-carry). Not a gap: the fix (5.0.8, published 07-23) sits inside the 7-day age gate and the path is build-tooling-only |
| Open PRs / untriaged issues | **1 / 0** — the one PR is #13 itself (this audited tree; CI green, `## Contrarian disposition` present). Only the Renovate dashboard issue is open |
| Pages (Storybook gallery) | **HTTP 200** |
| `renovate/*` branches | **Still zero, ever** — F1: the 07-27 window passed with the widened schedule live |
| Daily security-audit lane | Green 07-27 · 07-28 · 07-29 — all **post-fix, provably-audited greens** (the trailer assertion is live in both lanes) |
| CI Thursday heartbeat | First run 2026-07-23 — **failed, and correctly**: see "The heartbeat's first red" below. Next due 2026-07-30 |
| `pnpm audit` (local, live advisory data) | **Clean** — 1 high, the ignored `GHSA-mh99-v99m-4gvg` deferral |
| `pnpm outdated -r` | 50 entries (44 on 07-22) — F1's cost, growing |

## Currency & gates (all re-verified ~12:00 UTC)

| Gate | Finding |
| --- | --- |
| TS7 cutover | `next` latest **16.2.12**; 16.3.0 still `preview.10`/`canary.102`; `typescript` 7.0.2 (`next` tag 7.1.0-dev) → **gate stands** |
| `next` 16.2.12 | Published 2026-07-25T20:45Z → admissible **2026-08-01** (age-exclude removed 07-28 on schedule — re-verified in `pnpm-workspace.yaml`) |
| `better-auth` 1.6.25 | Published 2026-07-23T15:48Z → installable **2026-07-30** (Watch row correct) |
| `brace-expansion` 5.0.8 | Published 2026-07-23T11:39Z → override raise + ignore drop due **2026-07-30** (Watch row correct) |
| `postcss` override | next@16.2.12 still pins `postcss 8.4.31` → **required** |
| `sharp` override | next@16.2.12 still pins `sharp ^0.34.5` → **required** |
| `effect` override | uploadthing@7.7.4 still pins `effect 3.17.7` → **required** |
| `esbuild` override | drizzle-kit 0.31.10 still ships `@esbuild-kit/esm-loader` → **required** |

## The heartbeat's first red (recorded, not a finding)

The Thursday heartbeat's first-ever scheduled run (2026-07-23 06:44 UTC)
failed in **Audit (supply chain)** — a **true positive**: the 07-22/23 Next.js
advisory batch (GHSA-6gpp-xcg3-4w24 et al., 11 findings) against the
then-current lockfile (`next` 16.2.9). The fix — the 16.2.11 bump, `212b628`
— landed **the same day**, ~10 hours later. The lane did exactly what the
heartbeat exists to do: catch world-drift between merges. Two notes for the
record: (a) at that date ci.yml's audit job had no triage-sync step yet — the
rolling issue (#10) was filed 07-25 by the then-new daily lane; both lanes
sync it now; (b) the run's `failure` conclusion stays in history unrepaired,
which is cosmetic — the next heartbeat (2026-07-30) supersedes it.

## Finding status

- **F1 — Renovate scheduled lane: CARRIED, escalated (−2, Monorepo & tooling).**
  The 07-22 B1 row shipped verbatim (`"on monday"` + `timezone` +
  `prHourlyLimit: 0` — re-verified in `.github/renovate.json`), and the
  2026-07-27 proof window **failed anyway**: zero `renovate/*` branches have
  ever existed; all 7 merged Renovate PRs came from manual dashboard clicks.
  Config is exonerated; the block is Mend-side (app mode / run logs at
  developer.mend.io — plausibly the documented "Silent mode" failure mode
  [MAINTENANCE.md → Automation on a fork](../MAINTENANCE.md#automation-on-a-fork--new-repo)
  warns about). Backlog row replaced — see Backlog delta.
- **F2 — CHANGELOG security record: CLOSED, verified.** `CHANGELOG.md` now
  carries a `### Security` section recording the 2026-07-15/07-22/07-27
  batches incl. the `better-auth` account-takeover entry with its downstream
  call-to-action. Security → 100, half of Docs & DX's deduction recovered.
- **F3 — Dependabot mislabel: CLOSED, verified.** The `pnpm-workspace.yaml`
  comment header now states only `brace-expansion` was a Dependabot alert and
  names CI's `pnpm audit` the authoritative gate. Docs & DX → 100.
- **F4 — untested `sharp` runtime path: CLOSED, verified.**
  `apps/web/e2e/image-optimization.spec.ts` proves the overridden optimizer
  *transforms*, structurally: PNG→webp conversion for a webp-accepting client,
  IHDR-width assertion (64, not the fixture's 256) for a PNG-only client, and
  a 400 on a non-allowlisted remote URL. A sharp that installs but can't
  transform now turns the e2e lane red. File uploads + Testing & CI → 100.

## Delta review (the non-carried surface — all clean)

- **Advisory batch #4** — `better-auth` ^1.6.23 with `@better-auth/passkey`
  in exact lockstep; migration 0018 is additive and safe on live tables
  (`NOT NULL DEFAULT 0` backfills; `locked_until` nullable *by plugin
  contract* — the schema comment records why); the GHSA was verified
  live-exposed by driving the attack, not by reading the advisory.
- **Fail-closed audit gates** — both lanes assert the "…vulnerabilities
  found" trailer a completed report always emits, with `shell: bash`
  (pipefail) correctly flagged as load-bearing; the triage script refuses to
  close the issue on an outage and `set -euo pipefail` makes its own API
  failures red. Every path I traced fails in the safe direction.
- **`security-audit.yml` + `security-triage-issue.sh`** (new) — daily watch
  lane at moderate+, rolling single issue, close-all-on-green self-heals a
  red/red race; SHA-pinned actions; least-privilege permissions.
- **`scripts/docs-sanity.mjs`** (new, in the verify lane) — deterministic
  link/command/hook-wiring/subagent-reference checks; ran clean locally (55
  files). One fails-open nit noted in Considered & excluded.
- **`init-app.mjs`** — `--slim` now generically retargets remaining
  `docs/archive/` links at the public template repo, closing the class of
  dangling links its own shipped docs-sanity lane would flag downstream.
- **`contrarian` wiring** — the agent file's `tools:` grant now matches its
  documented read-only surface (the PR #13 fix, verified in the file); the
  nudge hook is inert-by-design on malformed payloads; `knip.jsonc` covers
  repo-owned hooks with a scoped glob that doesn't shadow the kit entry.

## Score table

| # | Feature group | 07-22 | Now | This pass's basis |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 98 | **98** | −2: F1 stands, escalated — delivery provably broken Mend-side; stall growing (48 dashboard entries, 50 outdated). Delta adds docs:sanity + knip coverage of repo-owned hooks |
| 2 | Framework & app architecture | 100 | **100** | Code byte-identical (delta touched a test fixture only) — carries |
| 3 | Database | 100 | **100** | Migration 0018 additive + contract-correct; everything else carries |
| 4 | Auth & access control | 100 | **100** | 1.6.23 remediation verified by driving the attack; lockout columns modeled to the plugin contract; 1.6.25 follow-up dated |
| 5 | API layer (tRPC + Actions) | 100 | **100** | Byte-identical — carries |
| 6 | UI & design system | 100 | **100** | Byte-identical; Pages 200 re-verified |
| 7 | State & data fetching | 100 | **100** | Byte-identical — carries |
| 8 | Forms & validation | 100 | **100** | Byte-identical — carries |
| 9 | Email | 100 | **100** | Byte-identical — carries |
| 10 | Payments (Stripe) | 100 | **100** | Byte-identical — carries |
| 11 | File uploads | 99 | **100** | F4 closed: the optimizer's transform is e2e-proven structurally |
| 12 | Search | 100 | **100** | Byte-identical — carries |
| 13 | Background jobs | 100 | **100** | Byte-identical — carries |
| 14 | Observability | 100 | **100** | Byte-identical — carries |
| 15 | Security | 99 | **100** | F2 closed; batch-#4 response exemplary end-to-end (detect → verify exposure → remediate → record → gate hardened); 0 scanning alerts; the 1 Dependabot alert is the dated deferral |
| 16 | Testing & CI | 99 | **100** | F4's e2e shipped; docs-sanity lane added; both audit gates fail closed (the 07-26 false green proved the hole; closed 07-27); CI + CodeQL green on HEAD |
| 17 | Deployment & ops | 100 | **100** | Carries; the heartbeat's first red was a true positive, remediated same-day |
| 18 | Docs & DX | 98 | **100** | F2 + F3 closed; context-engineering program + docs-sanity gate; **zero drift found this pass** |
| 19 | Internationalization | 100 | **100** | Byte-identical — carries |
| 20 | Realtime / SSE | 100 | **100** | Byte-identical — carries |
| | **Overall (mean)** | **99.65** | **99.9** | |

## Backlog delta

**One row replaced.** The shipped 07-22 B1 widening row is superseded by:

| Band | Area | Item | Fixes | Lifts | Effort |
| --- | --- | --- | --- | --- | --- |
| B1 | Tooling / deps | **Restore Renovate PR delivery** — owner half: diagnose at developer.mend.io (org mode Silent vs Interactive, per-repo run logs — the config is exonerated). Fallback half, agent-buildable if Mend won't cooperate: replace the app with self-hosted Renovate (`renovatebot/github-action` on a weekly cron, same `.github/renovate.json`), which removes the Mend-app dependency entirely | The scheduled lane has never delivered a PR; 48 dashboard entries / 50 outdated and growing; override retirements (dompurify, fast-uri) wait on it | Monorepo & tooling +2 | S to diagnose · M for the fallback lane |

**Owner-carry (dated actions already in the Watch list — not new rows):**
on/after **2026-07-30**: raise `brace-expansion` to 5.0.8 + drop the
GHSA-mh99-v99m-4gvg ignore · bump `better-auth`/`@better-auth/passkey` to
1.6.25 (lockstep) · confirm the 07-30 heartbeat + Dependabot alert #16
auto-close after the 5.0.8 raise. On/after **2026-08-01**: `next` 16.2.12
becomes admissible. **Merge PR #13** — this audit scored its tree; CI green,
disposition section present.

## Considered & excluded

- **docs-sanity's Commands check fails open if AGENTS.md's `## Commands`
  heading is ever renamed** (the section split yields an empty string and the
  loop checks nothing). Excluded: the same file's link checker still runs, the
  heading is load-bearing prose in a 113-line budgeted file this repo audits
  monthly, and a heading-presence assertion would add a failure mode for
  downstream repos that legitimately restructure AGENTS.md. Revisit only if a
  real drift slips through.
- **Refreshing override pins past registry drift** (effect 3.22.x, postcss
  8.5.2x) — still F1's job, not a hand-bump; unchanged from 07-22B.
- The 07-22B considered-and-excluded list otherwise carries verbatim.

## Prioritization

Unchanged in shape: **the Renovate diagnosis/fallback row is the only
audit-driven open work**, and it precedes everything else because override
retirement and the stalled minor/patch lane both queue behind it. The B1/B3
rows in [BACKLOG.md](../BACKLOG.md) (intake-drop convention, positioning
reframe, second adapter) remain owner-gated by design and are not audit
deductions.
