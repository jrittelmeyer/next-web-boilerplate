# Renovate B1 diagnosis — plan (draft, pending sign-off)

**Backlog row:** `docs/BACKLOG.md:74` (B1, Tooling/deps). **Watch item:**
`docs/MAINTENANCE.md` → Watch items → "Maintenance-only" bullet, Renovate
sub-thread.

## 0 · What's already established (carried from prior sessions)

- Config widening shipped 2026-07-22; every scheduled Monday window since
  (07-27, 08-03, 08-10, 08-17, 08-24) has passed with **zero** `renovate/*`
  branches ever created (`git ls-remote --heads origin 'refs/heads/renovate/*'`
  → empty).
- All 7 merged Renovate PRs to date came from manual Dependency Dashboard
  checkbox clicks, never a scheduled run.

## 1 · Repo-side facts checked this session (ruling in/out)

| Check | Result | Verdict |
| --- | --- | --- |
| `.github/renovate.json` schema validity | `pnpm dlx renovate-config-validator` → "Validating .github/renovate.json as global config" / "Config validated successfully against 1 file(s)" | **Valid** — not a config-syntax problem |
| `schedule`/`timezone` syntax | `"schedule": ["on monday"]`, `"timezone": "America/New_York"` — both accepted by the validator above | **Valid** |
| Branch protection on `main` blocking Renovate's branch pushes | `gh api repos/.../branches/main/protection` → `404 Branch not protected` | **Ruled out** — nothing stops a branch push |
| GitHub App installation scope (`Only selected` vs `All repositories`, active vs suspended) | `gh api repos/.../installation` → `401 could not be decoded` (this endpoint needs a GitHub App JWT, not a user PAT — **not checkable via `gh` as a repo collaborator**); `gh api user/installations` → `403 needs a GitHub App–authorized token` | **Not checkable by me — owner-only, needs the Mend dashboard or GitHub org "Installed GitHub Apps" settings page** |
| Dependency Dashboard issue (#1) state | `updatedAt: 2026-07-22T21:26:35Z`, **0 comments**, no timeline activity since a 2026-07-15 commit reference. The issue body is a live snapshot (per-package current/available versions, "Awaiting Schedule" and "Pending Approval" sections) but the issue itself has not been *edited* by the bot since 07-22 | **This is the smoking gun** — see §2 |

## 2 · Diagnosis

The Dependency Dashboard issue's `updatedAt` (the bot rewrites this issue's
body on every run where anything changed, and touches it even with no
changes on some cadences) has been frozen at **2026-07-22T21:26:35Z** through
at least five subsequent scheduled Monday windows. Combined with zero
`renovate/*` branches in that entire span, this is not "Renovate runs but
declines to open PRs" (which the 07-22 widening was meant to fix) — it's
**Renovate not executing on this repository at all** since 07-22, right
around when the widening was merged.

Two repo-side causes are ruled out (config validity, branch protection).
Everything else — GitHub App installation scope/suspension, org Silent vs
Interactive mode, per-repo scheduler/quota state, a stuck or errored run —
lives entirely in Mend's infrastructure and dashboard, which I cannot reach
(no login, and the relevant API requires GitHub App auth a repo-collaborator
PAT doesn't have). **This is a Mend-side diagnosis job, not a repo-config
fix** — there is nothing further to rule in/out from this side.

## 3 · What the owner needs to check at developer.mend.io

In order, cheapest/most-diagnostic first:

1. **Org mode: Silent vs Interactive.** Org settings page. If Silent, the
   dashboard issue and PRs are both suppressed — but note this alone doesn't
   fully explain a frozen dashboard issue that *previously* updated
   successfully; if it's Silent, the open question is *when* it flipped.
2. **Per-repo run history for `next-web-boilerplate`.** The dashboard/run-log
   view for this specific repo — look for: any run logged after
   2026-07-22T21:26:35Z at all; if runs exist, what their outcome was (error,
   rate-limited, skipped, silent success with no diff); if no runs exist,
   that confirms the scheduler isn't reaching this repo.
3. **GitHub App installation status** — installed on "Only selected
   repositories" (does it still list this repo?) vs "All repositories";
   confirm it wasn't suspended, uninstalled, or hit a token/permission error
   (GitHub sends the installing org an email on suspension — worth checking
   that inbox too).
4. **Live test:** tick the dashboard issue's own checkbox — "☐ Check this
   box to trigger a request for Renovate to run again on this repository"
   (issue #1, bottom). This is the cheapest possible experiment: if a run
   fires and the issue updates within a normal cycle, the scheduler/cron path
   is broken but on-demand triggering still works (points at a schedule/quota
   issue); if nothing happens, the app isn't reaching this repo at all
   (points at installation/suspension).

## 4 · Fallback (only if step 3 finds no fixable cause, or the owner prefers not to chase it)

Self-host via `renovatebot/github-action` on a weekly cron:

- New `.github/workflows/renovate.yml` — `on: schedule` (weekly, matching the
  existing `"on monday"` intent) + `workflow_dispatch` for on-demand runs.
- Reuses the already-committed `.github/renovate.json` as-is (validated
  above) — no config changes needed, only the execution path changes.
- Auth: a PAT or GitHub App with repo write scope, stored as a repo secret
  (`RENOVATE_TOKEN`); document which in `DEPLOYMENT.md`.
- Removes the Mend GitHub App dependency entirely once proven green for a
  couple of cycles — update `MAINTENANCE.md`'s "Install the Renovate (Mend)
  GitHub App" onboarding bullet to point at the self-hosted Action instead.
- Template-surface: new `.github/workflows/**` file ⇒ contrarian pass +
  sign-off before merge, per `CLAUDE.md`.
- Verification: first scheduled/dispatched run actually opens a `renovate/*`
  PR against a real outdated dependency (there are ~66 outdated per the last
  audit, so no shortage of real material).

## 5 · Recommendation

Do **not** build the fallback yet. Steps 3.1–3.4 are all read-only or
single-checkbox owner actions with no build cost, and step 3.4 in particular
is a fast, conclusive experiment. Only fall through to §4 if the owner
reports the app is confirmed suspended/misconfigured beyond an easy fix, or
explicitly prefers to stop depending on Mend.
