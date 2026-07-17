# Chapter 10 — Shipping & Running: getting on the internet and staying healthy there

[← Quality & Trust](09-quality-and-trust.md) · [Guide index](README.md) · [Next: Built With AI Agents →](11-built-with-ai-agents.md)

---

## Docker — the standard shipping container

**Technical name:** `Docker`, via a multi-stage `Dockerfile` and `docker-compose`
configurations for both development and production.

**The problem it solves** is old enough to have a catchphrase: *"works on my
machine."* Software behaves differently on different computers — different
operating systems, different installed versions of everything. Docker fixes this
with the same idea that revolutionized physical shipping: the standardized
container. An application is packed — with its exact engine version,
dependencies, and settings — into an **image**, a sealed, self-sufficient box
that runs *identically* on any computer that can run Docker, which is effectively
all of them, everywhere, from a laptop to any cloud.

**What's built here:** production-grade images for both the web app and the
background worker (the **multi-stage** technique — build tools stay in the
factory; only the finished product ships — is why the worker image is 169 MB
instead of 1.57 GB); a one-command development environment (a newcomer types
`docker compose up` and has PostgreSQL and the search engine running locally —
onboarding measured in minutes); health checks wired in so hosting platforms can
automatically detect and replace a sick copy; and — per
[Chapter 9](09-quality-and-trust.md) — the images are rebuilt, booted, health-
checked, and security-scanned by CI on every change.

**The strategic point — why Docker-first is a documented decision:** most
Next.js starters assume Vercel, the framework maker's own (excellent, premium)
hosting — convenient until the bill or the constraint arrives, and then you're
locked in. A Docker image runs on **any** host: AWS, Google Cloud, Azure, Fly.io,
Railway, a $10 rented server, or your own hardware. Deployment flexibility is
kept in your hands, with platform conveniences treated as optional additions.
This is the anti-lock-in philosophy at the infrastructure layer.

**And it's proven, not theoretical:** a real copy was deployed to **Fly.io** (a
hosting provider) with a managed production database — deploy, migrations,
secrets, health checks, sign-up creating a real user row — and the step-by-step
runbook from that live deployment is in the docs. Paths for Vercel, Railway, and
self-hosting are documented as well (honestly marked as authored-but-not-
exercised).

## Configuration and secrets

All deployment settings flow through environment variables
([Chapter 2](02-how-web-apps-work.md)), validated at startup **with a schema** —
misconfiguration fails immediately with a clear message, not mysteriously at 2
a.m. A committed example file documents every variable with working local
defaults; real secrets are structurally excluded from the repository (and GitHub's
secret-scanning + push-protection are enabled as a second net — a leaked key gets
blocked at the door). The two-variable minimum boot and graceful degradation
([Chapter 8](08-connected-services.md)) are what make this section painless.

## Security posture at the front door

Every response the app serves carries a hardened set of **security headers** —
standing instructions to browsers that shut down whole attack categories. The
headline one is the **CSP** ("content security policy"), an allowlist of where
code and content on the page may come from — the primary defense against **XSS**
("cross-site scripting"), where an attacker tricks a page into running their
script with the user's logged-in powers. Also present: clickjacking protection,
cross-origin isolation (COOP), a standardized security-researcher contact file
(`security.txt`, per RFC 9116 — so vulnerability reports reach you, not
Twitter), opt-in violation reporting, and the app-level rate limiting from
[Chapter 5](05-accounts-and-identity.md) (with a plug-in path to a distributed
limiter — Upstash Redis — for multi-server deployments, including properly
hardened client-address detection behind proxies, a subtle thing that's usually
done wrong).

One decision here is a window into the project's engineering honesty, worth
telling as a story: the *absolute gold-standard* CSP variant (per-request
"nonce" tokens) **conflicts** with the instant-page-speed machinery from
[Chapter 3](03-the-foundation.md) — cryptographically unique per-visit tokens
can't be baked into pages pre-built once for everyone; adopting it means giving
up some of that speed. Many projects would silently pick one and never mention
the other. This project ships the sensible fast default — and, as of July 2026,
the gold standard is a **fully supported second mode**, not just a documented
idea: flip one build-time switch and every page carries its own per-visit
token, with a dedicated automated-test lane proving the strict policy holds
across real user journeys (that lane runs on every change to this repository).
Leave the switch off and the default build is untouched byte-for-byte; the
documentation spells out exactly what turning it on costs. Trade-offs surfaced,
priced, and left to the owner — that's the pattern everywhere.

## Staying fast: performance budgets

An opt-in CI lane enforces **performance budgets** (`size-limit`): hard caps on
how much code the browser must download. Web apps gain weight the way people do
— invisibly, a little per decision, until suddenly the product feels slow and
nobody can say when it happened. A budget turns "the app got slower" from a
vague quarterly complaint into a specific failed check on the specific change
that crossed the line. Bundle-analysis tooling for investigating *why* is wired
in alongside.

## Living maintenance

Running software is an ongoing practice, and the repository operationalizes it:
Renovate ([Chapter 9](09-quality-and-trust.md)) streams in pre-tested dependency
updates; monitoring ([Chapter 8](08-connected-services.md)) watches the deployed
app and its worker; a maintenance guide (`MAINTENANCE.md`) defines the recurring
regimen; and periodic documentation-vs-reality audits keep the written word
true ([Chapter 11](11-built-with-ai-agents.md)). The public repository itself is
run with hardening on: protected main branch, secret scanning, vulnerability
alerts, code scanning.

**Business value of the chapter:** the last mile — hosting, secrets, front-door
security, speed, upkeep — is where projects historically stall for weeks after
being "done." Here it's a rehearsed, documented, provider-agnostic path with the
evidence attached, and the freedom to change hosts remains permanently yours.

---

[← Quality & Trust](09-quality-and-trust.md) · [Guide index](README.md) · [Next: Built With AI Agents →](11-built-with-ai-agents.md)
