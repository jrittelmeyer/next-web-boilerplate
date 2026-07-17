# Chapter 9 — Quality & Trust: the automated safety net

[← Connected Services](08-connected-services.md) · [Guide index](README.md) · [Next: Shipping & Running →](10-shipping-and-running.md)

---

Everything in this chapter answers one question: **how does a codebase stay
trustworthy as people — and AI agents — keep changing it?** The answer is never
"everyone is careful." It's layers of automation that make carelessness fail
loudly before it can reach users. This is also the chapter that makes
[Chapter 11](11-built-with-ai-agents.md)'s story credible: these machines are
precisely what lets AI-written code be held to the same standard as human-written
code.

## Automated testing — the specification that can't go stale

An **automated test** is a small program that exercises the real product and
verifies an expected outcome: *"create a user, ban them, confirm they can no
longer sign in."* Hundreds of them run in minutes, identically, on every change,
forever. The deeper value isn't catching today's bug — it's that the whole suite
**re-verifies everything on every future change**, converting "I hope this
didn't break anything" into a machine's answer. Tests are also executable
documentation: unlike a spec document, they *cannot* drift from reality, because
they fail the moment reality changes.

Three layers, in this project:

- **Unit and component tests** (`Vitest 4`) — hundreds of fast, small checks on
  individual functions and screen components, in every package of the monorepo,
  with **coverage thresholds enforced**: if the *proportion* of code exercised by
  tests drops below the configured bar, the build fails — quality that can only
  ratchet upward. Vitest is the modern successor to the old standard (Jest):
  same style, dramatically faster, native to this toolchain.
- **End-to-end tests** (`Playwright` — Microsoft's browser-automation tool, the
  modern leader over the older Cypress): a robot drives a *real browser* through
  real journeys against a really-running app — full sign-up/sign-in/2FA/passkey
  lifecycles (passkeys via a simulated authenticator!), the security headers,
  both languages, and the accessibility scans from
  [Chapter 7](07-look-feel-and-languages.md).
- **Integration tests** against a real database, plus the visual screenshot
  tests from [Chapter 7](07-look-feel-and-languages.md).

Grace note, consistent with [Chapter 8](08-connected-services.md): the entire
unit suite runs **with zero API keys and no database** — so anyone, and any CI
machine, can verify most of the project instantly.

## CI — the robot gatekeeper

**Technical name:** **CI** ("continuous integration"), implemented with **GitHub
Actions** — machines that automatically run checks on every single proposed
change, with merging **blocked** until all pass.

The lanes, in plain terms: code-quality checks and type checking and build
(including a **dead-code detector** — `knip` — which fails the build if unused
files, exports, or dependencies accumulate; the day it was adopted it caught two
real defects, and its "gate, don't just report" stance is a documented
philosophy: report-only checks rot); the full test suites; a security audit of
dependencies; and — notably — the **shipping containers themselves are built and
smoke-tested on every change**: CI assembles the deployable images, boots them
against a throwaway database, confirms health, and scans them for known
vulnerabilities. Plus the gated extra lanes: the visual screenshot tests and
CodeQL deep analysis (both switched on and live for this repository), and
opt-in performance budgets.

Locally, **git hooks** (checks that run on the engineer's own machine at the
moment of saving/pushing work) catch formatting, type, and message problems
before they even reach CI — seconds instead of minutes of feedback.

**Why this matters commercially:** CI converts code review from archaeology
("does this even work?") into judgment ("is this the right approach?"), makes
Friday-afternoon deploys boring, and is the mechanism that lets a team — human
or AI — move fast *without* accumulating silent breakage.

## Code consistency — Biome, and formatting as a solved problem

`Biome` (a fast modern replacement for the traditional pair of ESLint + Prettier)
enforces **formatting** (code laid out one canonical way — ending, permanently,
the style debates that waste real engineering hours) and **linting** (mechanical
detection of suspicious patterns — unused variables, common bug shapes, misused
React hooks). A minimal ESLint remains only for Next.js-specific rules Biome
doesn't cover — a documented, deliberately narrow exception. Beyond tidiness:
uniform code is *cheaper to review*, and — recurring theme — uniformity is what
makes AI-generated code indistinguishable in style from human code, reviewable on
substance alone.

## Supply-chain security — trusting the ingredients

[Chapter 2](02-how-web-apps-work.md) introduced the threat: this project, like
all modern software, is assembled from hundreds of open-source packages, and
criminals actively hijack popular ones to smuggle malicious code into whoever
updates next. This project's defenses are unusually complete — and several exist
at *two* independent layers, so no single mistake is fatal:

- **The 7-day quarantine.** No package version less than seven days old is
  accepted — enforced both by the update robot *and* by the package manager
  itself at install time. Hijacked releases are typically discovered and pulled
  by the community within hours or days; the quarantine means this project
  simply never ingests them. (The discipline is real enough that the decision
  log records a case of pinning an *older* version of a tool because the newest
  was hours old.)
- **`Renovate`, the update robot.** Dependencies rot — unpatched versions
  accumulate known vulnerabilities. Renovate continuously proposes updates as
  reviewable changes, each of which must pass the entire CI gauntlet above.
  Staying current stops being a neglected chore and becomes a stream of
  pre-tested suggestions.
- **Vulnerability scanning at every layer:** the dependency list (`pnpm audit`),
  the built container images (`Trivy`), and GitHub's own alerts; plus **CodeQL**,
  GitHub's deep static analyzer, hunting for exploitable patterns in the
  project's own code on every change.
- **An ingredients list and a notarized seal:** every build publishes an **SBOM**
  ("software bill of materials" — the exact list of every package and version
  inside, the thing that lets you answer *"are we affected?"* in minutes when
  the next industry-wide vulnerability lands) and **SLSA provenance** (a
  cryptographic attestation of exactly where and how the artifact was built —
  proof it came from this repository's pipeline and not from a tampered
  machine). Both are increasingly *demanded* in enterprise and government
  procurement — since 2021 a matter of US federal executive order — and almost
  never found in starter kits.
- **Pinned build instructions:** even the CI machinery itself is locked to exact
  fingerprinted versions (SHA-pinned actions), closing the loop of "the build
  robot's own tools got hijacked."

## The honesty layer

Woven through all of it, and worth naming as a feature: **known limitations are
documented, not hidden.** A "known non-issues" list tells maintainers which
warnings are cosmetic and why (saving every future person the same
half-day investigation); deferred work sits in a public backlog with reasons;
and the decision log records what was tried and rejected, with evidence. Trust
comes from the combination: machines enforce what machines can check, and
writing covers what they can't.

**Business value of the chapter in one line:** quality here isn't a phase or a
person — it's infrastructure, running on every change, forever; it's what makes
velocity *sustainable*, external scrutiny (audits, procurement, due diligence)
survivable, and AI participation safe.

---

[← Connected Services](08-connected-services.md) · [Guide index](README.md) · [Next: Shipping & Running →](10-shipping-and-running.md)
