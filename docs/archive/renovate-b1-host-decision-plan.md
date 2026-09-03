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

## 1 · Decision

**Keep Mend.** Reasons:

- It already produced the first scheduled `renovate/*` PR in the repo's
  history (#56, 2026-08-31), 10/10 green, still green today.
- Choosing self-hosted instead costs two owner actions now (mint a classic
  PAT with `repo`+`workflow` scope, store it as `RENOVATE_TOKEN`, set
  `ENABLE_RENOVATE=true`) *plus* a mandatory dated 14-day liveness re-check
  per `MAINTENANCE.md`, for a path that has never actually run against this
  repo — strictly more owner burden and less proof than the path that just
  worked.
- Fits the project's maintenance-only posture (`AGENTS.md` status line):
  minimize ongoing owner upkeep, prefer the already-working thing.

## 2 · Changes

1. **Delete `.github/workflows/renovate.yml`.** Template surface
   (`.github/workflows/**`); removing rather than leaving it dormant avoids a
   second bot identity ever colliding with Mend's Dependency Dashboard issue
   if `ENABLE_RENOVATE` were ever flipped on by mistake in a generated
   project. No `RENOVATE_TOKEN` secret exists to remove (none was ever set).
2. **Merge PR #56** (`Update actions/checkout action to v7.0.1`) — squash,
   using GitHub's default merge method for this repo (confirm with `gh pr
   view 56 --json ...` / repo settings before merging; fall back to a normal
   merge commit if squash isn't the default). `workflow` scope is available
   (my token already opened/pushed workflow-touching PRs this session-class
   of work before).
3. **Docs — close the loop:**
   - `docs/BACKLOG.md` B1 row → strikethrough into the Shipped table, one
     line, pointing at this plan + the merged PR + `MAINTENANCE.md`.
   - `docs/MAINTENANCE.md` → "Automation on a fork / new repo": drop the
     self-hosted-workflow paragraph (file no longer exists) and state Mend is
     the chosen, working host; drop the "owner decision pending" framing from
     the Watch item and the "Renovate liveness, 14 days" dated bullet (that
     check was scoped to the self-hosted path, which is no longer in the
     repo).
   - `docs/PROJECT_STATUS.md` — update the row/line that references the
     pending Renovate decision, and bump *Last updated*.
   - `CHANGELOG.md` `[Unreleased]` — one line: Renovate delivery decided
     (Mend), self-hosted workflow removed, #56 merged.
4. **Commit** — conventional commit, no trailers (repo convention), e.g.
   `chore(ci): close the Renovate host decision — keep Mend, drop the
   self-hosted workflow`.
5. **Push, watch CI** via `gh` (this commit itself doesn't touch app code,
   but `docs:sanity` / link-check lanes run on every push).
6. **`pnpm cache:prune`** to close out per the standing checklist.

## 3 · Verification

- `gh pr view 56` shows `MERGED` after step 2.
- `git ls-remote --heads origin` no longer lists `renovate/*` from a
  self-hosted attempt (moot — it never existed) and `.github/workflows/`
  no longer contains `renovate.yml`.
- CI green on the closing-docs commit.
- *Removal condition already met by #56 itself* — no further "prove it
  again" gate; a second scheduled Mend PR on 2026-09-07 would be a nice-to
  have confirmation but is not a blocker for closing this row (Watch item
  already softened from "prove twice" to "prove once, chosen host" language
  during this session — see MAINTENANCE.md edit above).

## 4 · Risks / what could go wrong

- Mend could regress next Monday (2026-09-07) the same way it silently did
  from 07-22 onward. If so, that's a new Watch item to open then, not a
  reason to withhold #56/B1 today — #56 is real, proven evidence, not a
  promise.
- Deleting `renovate.yml` means re-adding the self-hosted fallback later
  requires re-authoring it from `docs/archive/renovate-b1-diagnosis-plan.md`
  §4 if Mend ever needs replacing — acceptable since that section is
  preserved as the recipe.
