# Renovate B1 diagnosis — plan (draft, pending sign-off)

**Backlog row:** `docs/BACKLOG.md:74` (B1, Tooling/deps). **Watch item:**
`docs/MAINTENANCE.md` → Watch items → "Maintenance-only" bullet, Renovate
sub-thread.

## 0 · What's already established (carried from prior sessions)

- Config widening shipped 2026-07-22; `docs/MAINTENANCE.md`/`BACKLOG.md`
  document zero `renovate/*` branches through the 2026-08-17 window
  (re-checked 2026-08-19 doc audit). **Freshly re-verified this session,
  2026-08-30T13:57 UTC:** `git ls-remote --heads origin 'refs/heads/renovate/*'`
  is still empty — so the 08-24 window (not previously written up in either
  doc) and the run-up to 08-31 are both confirmed empty too, not assumed.
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

In order — cheapest first, **not** most-likely-first; #1 is checked early
because it's a one-click glance, not because it's the leading suspect (see
its own caveat below):

1. **Org mode: Silent vs Interactive.** Org settings page. If Silent, the
   dashboard issue and PRs are both suppressed — but this alone doesn't
   explain a dashboard issue that *previously* updated successfully going
   silent mid-life; Silent is normally an onboarding-time default (set when
   installing on "All repositories"), not something that self-triggers
   later. If it's Silent, check the org's audit log / settings-change
   history for a mode flip **around or after 2026-07-22** — a pre-existing
   Silent setting wouldn't fit the evidence (the dashboard issue *did*
   update successfully before that date).
2. **Mend account/org-level job queue and history — not just this repo's
   dashboard.** Mend's hosted free tier caps at **one concurrent job on a
   4-hour cycle with a 30-minute timeout**, account-wide, not per-repo. A
   stuck or repeatedly-timing-out job (on this repo or any other repo on the
   same Mend account) can starve the single concurrency slot silently — no
   suspension email, no per-repo error, no dashboard edit, no branch —
   which matches every symptom observed here. This is more mundane and more
   likely than an App suspension and is easy to miss if only the per-repo
   view gets checked. Check whether other repos share this Mend account.
3. **Per-repo run history for `next-web-boilerplate`.** The dashboard/run-log
   view for this specific repo — look for: any run logged after
   2026-07-22T21:26:35Z at all; if runs exist, what their outcome was (error,
   rate-limited, skipped, silent success with no diff); if no runs exist,
   that confirms the scheduler isn't reaching this repo.
4. **GitHub App installation status** — installed on "Only selected
   repositories" (does it still list this repo?) vs "All repositories";
   confirm it wasn't suspended, uninstalled, or hit a token/permission error
   (GitHub sends the installing org an email on suspension — worth checking
   that inbox too).
5. **Live test:** tick the dashboard issue's own checkbox — "☐ Check this
   box to trigger a request for Renovate to run again on this repository"
   (issue #1, bottom). This is the cheapest possible experiment: if a run
   fires and the issue updates within a normal cycle, the scheduler/cron path
   is broken but on-demand triggering still works (points at a schedule/quota
   issue); if nothing happens, the app isn't reaching this repo at all
   (points at installation/suspension/queue-starvation above).

## 4 · Fallback (only if step 3 finds no fixable cause, or the owner prefers not to chase it)

Self-host via `renovatebot/github-action` on a weekly cron:

- New `.github/workflows/renovate.yml` — `on: schedule` (weekly, matching the
  existing `"on monday"` intent) + `workflow_dispatch` for on-demand runs.
- Reuses the already-committed `.github/renovate.json` as-is (validated
  above) — no config changes needed, only the execution path changes.
- Auth: a **classic PAT with `repo` + `workflow` scope** (or a fine-grained
  PAT/App token with Contents, Issues, Pull Requests, and Workflows write),
  stored as a repo secret (`RENOVATE_TOKEN`); document which in
  `DEPLOYMENT.md`. `workflow` scope specifically is required because
  `.github/renovate.json` extends `helpers:pinGitHubActionDigests`, which
  writes to `.github/workflows/*.yml` — a plain `repo`-scoped token would
  let every other update PR open fine while digest-pinning PRs silently fail,
  a partial-failure mode that's easy to miss. **Do not use the ambient
  `GITHUB_TOKEN`** — it cannot trigger downstream CI runs on PRs it opens
  (GitHub's anti-recursion guard), which would open `renovate/*` PRs with
  zero CI, defeating this repo's whole "every dependency PR passes the full
  gate" discipline.
- **No dual-run with Mend.** Before the self-hosted cron's first live run,
  either disable/uninstall the Mend App or confirm it's already inert —
  running both against the same repo risks Renovate failing to find the
  existing Dependency Dashboard issue #1 (bot-identity-keyed lookup) and
  opening a second, duplicate dashboard issue plus duplicate/conflicting
  `renovate/*` branches — a documented Renovate failure mode, not
  hypothetical. If overlap is wanted for a trial window, say so explicitly
  and accept the duplicate-dashboard risk rather than leaving it unstated.
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
