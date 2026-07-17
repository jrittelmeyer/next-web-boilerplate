---
name: dep-check
description: Registry-verify a dependency before adding or upgrading it — check the real published version, dist-tags, and release age; enforce a release-age window; exact-pin frequent publishers; sanity-check peers and maintenance. Use whenever adding a dependency, bumping a version, choosing a version to install, or triaging a Renovate/Dependabot PR. Never pick versions from blog posts, tutorials, or model memory.
---

# dep-check

Model memory and blog posts are stale the day they're written; the registry is the
only source of truth for what a package's current version is. This skill front-loads
a two-minute check that prevents the expensive failure modes: installing a
just-published broken release, a prerelease masquerading as current, an abandoned
package, or a silent breaking major.

Adapter config: `.claude/ai-dev-kit.config.json` → `depPolicy` (`releaseAgeDays`,
`exactPin`) and `packageManager`. Defaults: 7-day window, judgment-based pinning.

## 1. Query the registry, not the web

- Current version + tags: `<pm> view <pkg> version` and `<pm> view <pkg> dist-tags`
  (pnpm/npm; Yarn: `yarn npm info <pkg>`). Dist-tags matter: `latest` can lag or
  lead, and `next` / `beta` / `canary` must never be installed by accident.
- Release age: `<pm> view <pkg> time` — when was the candidate version published?
- One registry query beats any number of web searches for "what's the latest X".

## 2. Apply the release-age window

- Prefer the newest version **older than the window** (default ~7 days, adapter
  `depPolicy.releaseAgeDays`). A just-published release can still be unpublished,
  yanked, broken, or — worst case — hijacked; a week of ecosystem soak is cheap
  insurance.
- Exception: the newer release contains a fix you specifically need → take it and
  say so explicitly in the commit/PR body.

## 3. Pin policy

- Exact-pin packages that publish frequently (adapter `depPolicy.exactPin`, plus
  judgment: multiple releases per month → pin exact) — a caret range on a fast
  publisher makes every fresh install a lottery.
- Otherwise follow the project's prevailing range style (read a few neighbors in
  `package.json`).

## 4. Sanity checks before installing

- **Peers:** the package's peer ranges vs the project's installed framework/runtime
  versions.
- **Deprecation:** the registry deprecation field — a deprecated package needs a
  replacement, not an install.
- **Maintenance:** last-publish date and repo activity as an abandonment proxy.
- **Graceful degradation:** if the dep introduces an env-gated integration, the
  project must still build and run with that env unset — verify it.

## 5. Renovate / Dependabot PR triage

- Re-check release age *at merge time*, not PR-open time.
- Read the changelog/release notes for breaking changes on any major (and on
  fast-moving minors).
- **Check the project's memory/docs for standing holds** before merging a major —
  some majors are deliberately gated on an upstream event (a framework release, an
  API landing); merging them early re-breaks a settled decision.

## 6. Record the decision

State in the commit/PR body: the version chosen, the pin style, the release date,
and why (window respected / fix-needed exception / hold respected).
