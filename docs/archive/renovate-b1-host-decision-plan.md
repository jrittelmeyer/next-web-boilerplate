# Renovate B1 host decision — plan (draft, pending sign-off)

**Backlog row:** `docs/BACKLOG.md` B1 "Restore Renovate PR delivery" (owner
decision pending since 2026-08-31). **Prior work:** the diagnosis in
`docs/archive/renovate-b1-diagnosis-plan.md` (Mend-side resource-ceiling
hypothesis) and the fork-safe `ENABLE_RENOVATE` gate shipped 2026-09-02.

## 0 · Re-checked this session (2026-09-03), not assumed stale

| Check | Result |
| --- | --- |
| PR #56 (`renovate/actions-checkout-7.x`, opened by `app/renovate` = Mend's bot identity) | **OPEN, MERGEABLE**, all 10 checks green (CI type-check/lint/test/build, CodeQL ×2, supply-chain audit, E2E incl. CSP-nonce lane, Docker build/scan/SBOM, visual regression, `renovate/stability-days`). No regression since 08-31. |
| Any other `renovate/*` branch or PR, from either host | `git ls-remote --heads origin 'refs/heads/renovate/*'` → only `renovate/actions-checkout-7.x`. `gh pr list --state all` → #56 is the only Renovate-authored PR in repo history. No new scheduled window has fired since 08-31 (next is Monday 2026-09-07), so no new evidence either way — the 08-31 result stands as-is. |
| Self-hosted path's actual live state | `gh variable list` → `ENABLE_RENOVATE` **not set** (only `ENABLE_CODEQL`/`ENABLE_VISUAL`/`ENABLE_CSP_NONCE` are). `gh secret list` → **no `RENOVATE_TOKEN`**. So `renovate.yml`'s job-level `if` is false — the workflow is fully inert today, not merely unverified. |

Conclusion: the facts behind the 2026-08-31 lean are unchanged, and the
self-hosted alternative has zero live evidence of working (never run, no
token) versus Mend's one real green PR. Re-diagnosing Mend further isn't
warranted — the decision is a one-time host pick, not a new investigation.

**Revised after contrarian review (2026-09-03):** the section below folds in
its two Major findings and resolves its Critical finding against
`MAINTENANCE.md`'s own text (see "Contrarian disposition").

## 1 · Decision

**Keep Mend as the chosen host — but precisely scoped, not oversold.**
`docs/MAINTENANCE.md:348-365` already records the exact shape of what #56
proves: the Dependency Dashboard issue's `updatedAt` is *still* frozen at
2026-07-22 even after #56 shipped, which the doc reads as "Mend *does*
deliver the no-lockfile class... its pnpm run still never finishes" — i.e.
Mend reliably delivers lightweight, no-lockfile updates (GitHub Actions
digest/version bumps, #56's class) on schedule, but full npm-manager
updates requiring a pnpm resolve remain unproven and may keep failing on
Mend's tier, exactly as option (b) in that same doc already anticipated
("accept that npm-manager PRs may keep dying on Mend's tier"). This is a
pre-existing, already-recorded risk — not a new gap this plan is
introducing — but the plan text must state it plainly rather than imply #56
proves the whole scheduler fixed.

Reasons to still choose Mend over self-host:

- It already produced the first scheduled `renovate/*` PR in the repo's
  history (#56, 2026-08-31 — same day the self-hosted cron also fired,
  corroborating this was the actual Monday schedule window, not a manual
  dashboard-checkbox trigger), 10/10 green, still green today, for the
  update class it covers.
- Self-hosted has **zero** live evidence: its one historical run (08-31,
  before the `ENABLE_RENOVATE` gate existed 2026-09-02) failed at startup
  for want of `RENOVATE_TOKEN`. Since the gate landed, it's unconditionally
  inert (`ENABLE_RENOVATE` unset, no secret) — not "unverified", genuinely
  never-executed-successfully-even-once.
- Fits the project's maintenance-only posture: minimize ongoing owner
  upkeep, prefer the path with a real, if partial, delivered artifact.

## 2 · Changes

1. **Keep `.github/workflows/renovate.yml` in the repo, dormant, not
   deleted.** Contrarian finding (Major), accepted: the file costs nothing
   while `ENABLE_RENOVATE` stays unset (silent skip by design), and deleting
   it trades a real, already-CI-clean, ready-to-enable artifact for a
   rebuild-from-`docs/archive/renovate-b1-diagnosis-plan.md`-§4 exercise
   exactly when it would be needed most — if Mend goes silent again the way
   it did 07-22→08-31 with zero error signal. Update only its header
   comment: state plainly this is the *cold fallback*, Mend is the *chosen*
   host, and `ENABLE_RENOVATE` should stay unset here unless Mend is
   later abandoned.
2. **Merge PR #56** (`Update actions/checkout action to v7.0.1`) — check
   the repo's default merge method (`gh api repos/jrittelmeyer/next-web-boilerplate --jq '.allow_squash_merge,.allow_merge_commit,.allow_rebase_merge,.delete_branch_on_merge'`)
   before merging; use squash if that's the repo default, else a normal
   merge commit. This alone satisfies `MAINTENANCE.md`'s own stated
   *removal condition* ("a scheduled `renovate/*` PR from the chosen host
   merges") for the no-lockfile update class.
3. **Docs — close the loop, precisely scoped:**
   - `docs/BACKLOG.md` B1 row → strikethrough into the Shipped table, one
     line: Mend chosen (scoped to the no-lockfile update class), `#56`
     merged, `renovate.yml` kept dormant as cold fallback — not "Renovate
     restored" unqualified.
   - `docs/MAINTENANCE.md` → "Automation on a fork / new repo" and the
     "Maintenance-only" Watch bullet: drop "owner decision pending"
     framing (decided); state Mend is chosen and delivers the no-lockfile
     class, npm-manager delivery remains an accepted open risk (not
     re-diagnosed, not blocking); state `renovate.yml` is kept as a
     documented cold fallback, `ENABLE_RENOVATE` intentionally unset. Drop
     only the self-hosted-specific "14-day `RENOVATE_TOKEN` liveness"
     dated bullet (moot — that path isn't being enabled); do **not** drop
     the general "prove delivery keeps working" watch framing — replace it
     with a note that 2026-09-07 (the next scheduled Monday) is a free,
     non-blocking confirmation point worth an informal glance, contrarian
     finding (Major) accepted on timing grounds even though the doc's own
     removal condition is already met by merging #56.
     Also fix the imprecise "fully inert... vs failed at startup" framing
     (contrarian Minor): state the sequence — one historical startup
     failure 08-31 pre-gate, unconditionally inert since the 09-02 gate.
   - `docs/PROJECT_STATUS.md` — update the row/line that references the
     pending Renovate decision, and bump *Last updated*.
   - `CHANGELOG.md` `[Unreleased]` — one line: Renovate host decided (Mend,
     scoped to no-lockfile updates), `renovate.yml` kept dormant as cold
     fallback, #56 merged.
4. **Commit** — conventional commit, no trailers (repo convention), e.g.
   `chore(ci): close the Renovate host decision — keep Mend, renovate.yml
   stays dormant`.
5. **Push, watch CI** via `gh` (this commit itself doesn't touch app code,
   but `docs:sanity` / link-check lanes run on every push).
6. **`pnpm cache:prune`** to close out per the standing checklist.

## 3 · Verification

- `gh pr view 56` shows `MERGED` after step 2.
- `.github/workflows/renovate.yml` still present, header comment updated,
  `gh variable list` still shows no `ENABLE_RENOVATE`.
- CI green on the closing-docs commit.
- Removal condition (per `MAINTENANCE.md`'s own wording) is met by merging
  #56 for the no-lockfile class; npm-manager delivery stays an open,
  documented risk rather than something this row claims to have fixed.

## 4 · Risks / what could go wrong

- Mend could regress on its no-lockfile delivery too, the same silent way it
  did from 07-22 onward. A glance at 2026-09-07's scheduled window is free
  confirmation but not a gate on closing this row today — #56 is real,
  proven evidence for its class, not a promise for classes it hasn't
  touched.
- npm-manager PRs (the majority of the ~58-outdated backlog, including
  `typescript`, `better-auth`) may continue to fail silently on Mend's tier
  indefinitely — this is the accepted, pre-recorded risk of choosing Mend
  over self-host, not a new one. If it becomes a real problem, the fallback
  is already in the repo (dormant `renovate.yml`) rather than something to
  re-author from scratch.
- Keeping `renovate.yml` dormant (vs. deleting) means it ships to every
  project generated from this template as dead-but-harmless template
  surface unless a fork enables it — acceptable since it's already
  fork-safe (`ENABLE_RENOVATE` gate) and documented as such.

## 5 · Contrarian disposition

Ran per `CLAUDE.md`'s mandatory rule for `.github/workflows/**` changes.
Findings and disposition:

- **[Critical] "#56 doesn't prove the schedule is fixed."** — **Folded in**,
  reframed rather than overruled: `MAINTENANCE.md`'s own text already
  explains the frozen dashboard `updatedAt` as "delivers no-lockfile,
  doesn't finish npm-manager runs" and same-day self-hosted-cron firing
  corroborates 08-31 was the real Monday window, not a manual trigger — so
  the underlying claim ("scheduled, real, but class-scoped") holds, and §1
  above now states the scope explicitly instead of implying full-scheduler
  health.
- **[Major] "Don't delete `renovate.yml`, keep it dormant."** — **Folded
  in** — §2.1 changed from delete to keep-dormant-with-updated-header.
- **[Major] "Don't drop the liveness/probation language before 09-07."** —
  **Folded in** — §2.3 keeps a non-blocking 09-07 note instead of dropping
  the watch framing outright, while still closing B1 today since the doc's
  own removal condition is met by the merge itself.
- **[Minor] "inert vs. failed-at-startup inconsistency."** — **Folded in**
  — §1 and the MAINTENANCE.md edit now state the actual sequence (one
  historical pre-gate failure, then inert since the gate).
- **[Minor] merge-mechanics gap** — **Folded in** — §2.2 now checks the
  repo's actual merge-method settings before merging rather than assuming
  squash.
