# Project Audit — 2026-07-22B (eleventh scoring pass — same-day live-surface re-check)

> The `/project-audit` skill's eleventh run, ~4 hours after the tenth
> ([PROJECT_AUDIT_2026-07-22.md](PROJECT_AUDIT_2026-07-22.md), **99.65/100**).
>
> **Method — fully git-bounded.** HEAD at audit time is `c87a3d4` — the tenth
> pass's own commit — and `git diff c87a3d4..HEAD` is **empty**: the tree is
> byte-identical to the tree the tenth pass scored. Per the skill's bounding
> rule, **all 20 group scores and findings F1–F4 carry by identity**; this pass
> spent its effort exclusively on what time alone can invalidate — the live
> GitHub surface (alerts APIs, not workflow conclusions), the npm-registry
> gates, and the live-advisory `pnpm audit` lane — checked in parallel
> 2026-07-22 ~20:55–21:00 UTC.

## Headline: **99.65/100 holds — nothing moved**

Every score carries unchanged; every externally-gated watch row stands; no new
advisory, alert, or regression appeared. The tenth pass's four backlog rows
(F1–F4) remain the open work, its prioritization statement stands verbatim
(**widen the Renovate schedule first**), and its considered-and-excluded list —
hours old — carries verbatim.

## Live-surface results (the whole pass)

| Check | Result |
| --- | --- |
| CI on HEAD (`c87a3d4`) | CI + CodeQL both **green** |
| Code-scanning alerts (API) | **0 open** |
| Dependabot alerts (API) | **1 open — alert #4** (`brace-expansion`); F5 status below |
| Open PRs / untriaged issues | **0 / 0** (only the Renovate dashboard issue) |
| Pages (Storybook gallery) | **HTTP 200** |
| `renovate/*` branches | **Still zero** — F1 unchanged; 37 updates still Awaiting Schedule (dashboard refreshed 16:41Z) |
| Scheduled CI heartbeat | No `schedule` run yet — first due **2026-07-23**, exactly as documented |
| `pnpm audit` (live advisory data, CI's own command) | **Clean** — only the two ignored `fast-uri` GHSAs, both still required (lockfile carries 3.1.2 until the age gate clears) |
| `pnpm outdated -r` | 44 entries — the stalled-lane picture F1 describes, nothing new |

## Currency & gates (all re-verified ~21:00 UTC; all stand)

| Gate | Finding |
| --- | --- |
| TS7 cutover | `next` latest **16.2.11**; 16.3.0 still `preview.8`/`canary.93`; `typescript` latest 7.0.2 (`next` tag `7.1.0-dev.20260722.1`) → **gate stands** |
| `postcss` override | next@16.2.11 still pins `postcss 8.4.31` → **required** |
| `sharp` override | next@16.2.11 still pins `sharp ^0.34.5` → **required** |
| `effect` override | uploadthing@7.7.4 still pins `effect 3.17.7` → **required** |
| `esbuild` override | drizzle-kit 0.31.10 still depends on `@esbuild-kit/esm-loader` → **required** |
| `dompurify` / `brace-expansion` overrides | posthog-js floor `^3.3.2` · minimatch floor `^5.0.5` — both below the pinned fixes → **required** |
| `fast-uri` deferral | 3.1.4 published 2026-07-19T07:42:54Z → clears the age gate **2026-07-26T07:42Z** → keep deferring |

## Finding status

- **F1–F4 — carry by identity, unaddressed** (no code/config change since the
  tenth pass; the [BACKLOG.md](../BACKLOG.md) rows are current).
- **F5 (Dependabot alert #4, `brace-expansion`) — still open at ~20:55Z**
  (`fixed_at: null`), despite the fix living in the lockfile and CI's audit
  lane green. Still inside the ~12 h auto-close precedent set by alerts #1–#3:
  the fix pushed 17:33Z, so the window runs to **~2026-07-23 05:30Z**. Re-check
  before the next status update; escalate to a manual dismissal-with-reason
  only if it survives the 23rd.

## New micro-findings (below scoring threshold)

- **N1 — a third pending major: `@testing-library/jest-dom` v7** — sits in the
  dashboard's **Pending Status Checks** section (Renovate's holding pen for
  age-gated updates; 7 entries total, the other 6 minor/patch) and will surface
  for approval once aged. Recorded owner-side; joins `typescript v7`
  (deliberately held, TS7 gate) and `actions/setup-node v7` (pending approval).
- **N2 — `pnpm-workspace.yaml` comment nit** — the postcss override note says
  "next@16.2.10" while the sharp note says "16.2.9" (registry latest is
  16.2.11). Cosmetic; **folded into the existing B1 relabel row**, which
  already edits that same comment block (M-1 precedent: config-file comments
  ride the next code touch).
- **Registry latests have drifted past several override pins** (`effect`
  3.22.0 vs the 3.21.4 override · `postcss` 8.5.22 vs 8.5.15 · nested
  `esbuild` 0.28.1 vs 0.25.12). No verdict changes — and refreshing the pins by
  hand would duplicate exactly the bumps the stalled Renovate lane delivers, so
  this stays inside F1 rather than becoming a row.
- The `@react-email/components` deprecation flag resurfaced via `pnpm
  outdated` + a dashboard warning — the already-documented known non-issue
  ([PROJECT_STATUS.md](../PROJECT_STATUS.md) → Known non-issues); no change.

## Score table

Unchanged from the tenth pass — **99.65/100 overall**
([full 20-group table](PROJECT_AUDIT_2026-07-22.md#score-table)). The five
non-100 groups, all awaiting their backlog rows: Monorepo & tooling **98**
(F1) · File uploads **99** (F4) · Security **99** (F2) · Testing & CI **99**
(F4) · Docs & DX **98** (F2+F3).

## Backlog delta

**No new rows.** N2 folded into the existing B1 relabel row; N1 recorded in the
Watch section. Owner-side carry-overs from the tenth pass: confirm alert #4
auto-closes (window above); after **2026-07-26** add `fast-uri: 3.1.4` to
`overrides` and drop both `ignoreGhsas` entries; triage `actions/setup-node v7`
— now joined by `@testing-library/jest-dom v7` once it ages in.
