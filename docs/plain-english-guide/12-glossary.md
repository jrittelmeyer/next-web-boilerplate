# Chapter 12 — Glossary

[← Built With AI Agents](11-built-with-ai-agents.md) · [Guide index](README.md)

Every technical term used in this guide, alphabetized. Each entry is deliberately
short; the linked chapter has the full story.

---

**a11y** — Shorthand for *accessibility* (11 letters between a and y): making software usable by people with disabilities. Machine-checked in this project. [Ch. 7](07-look-feel-and-languages.md)

**Agentic coding / AI agent** — An AI tool that doesn't just suggest code but performs multi-step engineering work: reading the project, writing code, running tests, reacting to failures — under human direction. [Ch. 11](11-built-with-ai-agents.md)

**AGENTS.md** — The standardized "onboarding file for AI agents" at the project root: rules of engagement, stack summary, map of the repository. [Ch. 11](11-built-with-ai-agents.md)

**API (application programming interface)** — The agreed menu of requests one program accepts from another, and the exact format of each. [Ch. 2](02-how-web-apps-work.md)

**Audit log** — A permanent record of sensitive administrative actions (who did what, to whom, when). Required for most compliance regimes. [Ch. 5](05-accounts-and-identity.md)

**Authentication / Authorization** — "Who are you?" / "What are you allowed to do?" — the two halves of identity. [Ch. 5](05-accounts-and-identity.md)

**Backend (server side)** — The half of an app running on the company's computers: the kitchen. Where all real enforcement lives. [Ch. 2](02-how-web-apps-work.md)

**Better Auth** — The open-source, self-hosted identity framework used here; account data stays in the project's own database. [Ch. 5](05-accounts-and-identity.md)

**BetterStack** — Service used for centralized logging, uptime monitoring, and the worker heartbeat. [Ch. 8](08-connected-services.md)

**Biome** — The fast, modern tool enforcing code formatting and mechanical bug-pattern checks (replaces the older ESLint + Prettier pair). [Ch. 9](09-quality-and-trust.md)

**Boilerplate / starter kit / template** — A pre-built, reusable foundation containing everything every app needs, so teams start at month four, not day zero. [Ch. 1](01-the-big-picture.md)

**CAPTCHA** — A "prove you're human" challenge gating sign-up against bots. Here: Cloudflare Turnstile, opt-in. [Ch. 5](05-accounts-and-identity.md)

**CI (continuous integration)** — Machines that automatically build and test every proposed change, blocking it until all checks pass. [Ch. 9](09-quality-and-trust.md)

**Claude Code** — Anthropic's agentic AI coding tool; the one that built this project. [Ch. 11](11-built-with-ai-agents.md)

**Cloud, the** — Professionally run computers rented from someone else (AWS, Google, etc.). [Ch. 2](02-how-web-apps-work.md)

**CodeQL** — GitHub's deep code analyzer that hunts for exploitable security patterns on every change. [Ch. 9](09-quality-and-trust.md)

**Component** — A self-contained, reusable screen building block (button, dialog, profile card). React's core idea. [Ch. 3](03-the-foundation.md)

**Context window / context engineering** — An AI agent's finite working memory / the craft of curating exactly what it needs per task. The organizing principle of this repo's documentation. [Ch. 11](11-built-with-ai-agents.md)

**Coverage (test coverage)** — The proportion of code exercised by automated tests; enforced here with thresholds that fail the build if it drops. [Ch. 9](09-quality-and-trust.md)

**CSP (content security policy)** — A browser-enforced allowlist of where a page's code may come from; primary defense against script-injection attacks. [Ch. 10](10-shipping-and-running.md)

**CSS** — The web's styling language (colors, spacing, layout). [Ch. 7](07-look-feel-and-languages.md)

**Database** — The permanent, guarantee-backed filing system for an app's data. [Ch. 4](04-the-database.md)

**Dependency / package / library** — A ready-made open-source building block pulled into a project. Modern apps use hundreds. [Ch. 2](02-how-web-apps-work.md)

**Deployment** — The process of putting software onto the internet for real users. [Ch. 10](10-shipping-and-running.md)

**Docker / container / image** — The standardized "shipping container" for software: an app sealed with everything it needs, running identically on any computer. [Ch. 10](10-shipping-and-running.md)

**Drizzle (ORM)** — The type-safe translator between the app's TypeScript and the database's SQL. [Ch. 4](04-the-database.md)

**Dunning** — Handling failed subscription-renewal payments (retries, status changes, emails). Wired and test-verified here. [Ch. 8](08-connected-services.md)

**End-to-end (E2E) tests** — Automated tests where a robot drives a real browser through real user journeys. [Ch. 9](09-quality-and-trust.md)

**End-to-end type safety** — Types checked in an unbroken chain from database to screen, so a change anywhere flags every affected spot instantly. [Ch. 3](03-the-foundation.md), [6](06-screens-and-servers.md)

**Environment variables** — Settings and secrets an app reads at startup, kept outside the code. This app boots with just two. [Ch. 2](02-how-web-apps-work.md), [8](08-connected-services.md)

**Feature flags** — Switching features on/off for chosen users without redeploying; enables gradual rollouts and kill switches. [Ch. 8](08-connected-services.md)

**Frontend (client side)** — The half of an app running on the user's device: the dining room. Never trusted with enforcement. [Ch. 2](02-how-web-apps-work.md)

**GDPR** — Europe's data-privacy law (with spreading global equivalents): consent, data export, deletion rights. Supported here. [Ch. 5](05-accounts-and-identity.md), [8](08-connected-services.md)

**Git / GitHub** — The change-tracking system for code / the dominant hosting service for Git repositories. [Ch. 2](02-how-web-apps-work.md)

**Git hooks** — Checks that run on the engineer's own machine at commit/push time, catching problems before CI. [Ch. 9](09-quality-and-trust.md)

**Graceful degradation** — The design rule that every integration is optional: unconfigured features switch off politely instead of breaking the app. [Ch. 8](08-connected-services.md)

**Health endpoint** — A built-in "all systems OK" URL (`/api/health`) that monitoring tools and hosting platforms check. [Ch. 8](08-connected-services.md)

**i18n (internationalization)** — Building software to speak multiple languages and formats. English + Spanish wired here. [Ch. 7](07-look-feel-and-languages.md)

**Index (database)** — A pre-built lookup structure (like a book's index) keeping queries instant at scale. [Ch. 4](04-the-database.md)

**JavaScript / TypeScript** — The web's native programming language / Microsoft's safety-checked superset of it, used here in maximum-strictness mode. [Ch. 3](03-the-foundation.md)

**Keyset pagination** — The technique for browsing huge lists where page 400 loads as fast as page 1. [Ch. 4](04-the-database.md)

**Linting** — Mechanical scanning of code for suspicious patterns and common bug shapes. [Ch. 9](09-quality-and-trust.md)

**Meilisearch** — The self-hosted search engine providing typo-tolerant, instant, ranked search. [Ch. 8](08-connected-services.md)

**Migration (database)** — A small, numbered, replayable script capturing one structural change to the database; the database's version control. [Ch. 4](04-the-database.md)

**Monorepo** — One repository containing an app and its supporting packages as cleanly separated departments of a single factory. [Ch. 3](03-the-foundation.md)

**Mutation** — Any operation that changes data (create, edit, delete). Here, always a Server Action. [Ch. 6](06-screens-and-servers.md)

**Next.js** — The React-based framework this project is built on; supplies structure, routing, and speed machinery. [Ch. 3](03-the-foundation.md)

**Node.js** — The engine that runs JavaScript/TypeScript on servers. [Ch. 3](03-the-foundation.md)

**npm registry** — The "app store" of open-source JavaScript packages. [Ch. 2](02-how-web-apps-work.md)

**OAuth** — The standard behind "Sign in with Google/GitHub": the app receives proof of identity, never the password. [Ch. 5](05-accounts-and-identity.md)

**Open source** — Software whose code is public and free to use; the substrate of the modern industry. [Ch. 2](02-how-web-apps-work.md)

**OpenTelemetry** — The software industry's vendor-neutral monitoring language; the app can optionally export its performance traces in it to any compatible vendor or a self-hosted collector. [Ch. 8](08-connected-services.md)

**Optimistic UI / optimistic updates** — The screen reflects a user's action instantly while the server confirms in the background, rolling back on failure. [Ch. 6](06-screens-and-servers.md)

**ORM (object-relational mapper)** — See Drizzle. [Ch. 4](04-the-database.md)

**Passkeys / WebAuthn** — Passwordless sign-in via fingerprint/face/security key; unphishable; the industry's intended successor to passwords. [Ch. 5](05-accounts-and-identity.md)

**PCI DSS** — The card-industry security standard; minimized here by never touching card numbers (Stripe-hosted checkout). [Ch. 8](08-connected-services.md)

**pg-boss** — The background-job queue that lives inside PostgreSQL — no extra infrastructure. [Ch. 8](08-connected-services.md)

**Playwright** — Microsoft's browser-automation tool used for the end-to-end tests. [Ch. 9](09-quality-and-trust.md)

**pnpm** — The fast, strict package manager used here; also enforces the 7-day package quarantine. [Ch. 3](03-the-foundation.md)

**PostgreSQL (Postgres)** — The gold-standard open-source relational database; also reused here as the job queue, realtime bulletin board, and rate-limit store. [Ch. 4](04-the-database.md)

**PostHog** — The product-analytics and feature-flag service, chosen over Google Analytics on privacy and fit; consent-gated. [Ch. 8](08-connected-services.md)

**Production / development** — The live version real users touch / the safe workshop copy on an engineer's machine. [Ch. 2](02-how-web-apps-work.md)

**Progressive enhancement** — Building so core functions (like forms) still work even if fancy browser code fails to load. [Ch. 6](06-screens-and-servers.md)

**Rate limiting** — Capping how often an action can be attempted (e.g., sign-in tries per minute); throttles attackers and bots. [Ch. 5](05-accounts-and-identity.md)

**RBAC (role-based access control)** — Permissions via roles (admin, member…); here checked fresh from the database so demotions bite instantly. [Ch. 5](05-accounts-and-identity.md)

**React** — Meta's dominant library for building screens out of components. [Ch. 3](03-the-foundation.md)

**React Email / Resend** — Typed, componentized email templates / the modern delivery service that sends them. [Ch. 8](08-connected-services.md)

**React Hook Form** — The standard library handling form mechanics (state, errors, submission). [Ch. 6](06-screens-and-servers.md)

**Realtime** — Data appearing on screen the moment it changes, no refresh. Done here with SSE + Postgres, zero new infrastructure. [Ch. 6](06-screens-and-servers.md)

**Renovate** — The robot that continuously proposes dependency updates as CI-tested changes. [Ch. 9](09-quality-and-trust.md)

**Repository (repo)** — A project's complete, history-tracked collection of code and documents. [Ch. 2](02-how-web-apps-work.md)

**SBOM (software bill of materials)** — The published ingredients list of every package inside a build; increasingly demanded in procurement. [Ch. 9](09-quality-and-trust.md)

**Seed script** — Pre-filled sample data so a fresh copy of the app isn't an empty shell. [Ch. 4](04-the-database.md)

**Sentry** — The error-tracking service capturing every crash with full context. [Ch. 8](08-connected-services.md)

**SEO (search engine optimization)** — Making pages readable and rankable by search engines; helped here by server rendering and per-language URLs. [Ch. 3](03-the-foundation.md), [7](07-look-feel-and-languages.md)

**Server** — A computer whose job is answering requests over the internet. [Ch. 2](02-how-web-apps-work.md)

**Server Actions** — The Next.js mechanism used for all data *changes*; falls back gracefully to plain form submission. [Ch. 6](06-screens-and-servers.md)

**shadcn/ui** — The component catalog whose source is copied into (and owned by) the project, built on accessibility-focused Radix primitives. [Ch. 7](07-look-feel-and-languages.md)

**Skills (agent)** — Reusable, checked-in procedures an AI agent invokes by name: standard operating procedures for the AI. [Ch. 11](11-built-with-ai-agents.md)

**SLSA provenance** — A cryptographic attestation of where and how a software artifact was built; anti-tampering proof. [Ch. 9](09-quality-and-trust.md)

**SPF / DKIM / DMARC** — The three DNS-level standards proving email really comes from your domain; the difference between inbox and spam. [Ch. 8](08-connected-services.md)

**SQL** — The near-English language for querying relational databases. [Ch. 2](02-how-web-apps-work.md)

**SSE (server-sent events)** — A standard, built-into-browsers one-way live channel from server to screen; powers the realtime notifications. [Ch. 6](06-screens-and-servers.md)

**State** — A running app's short-term memory; disciplined here into three homes (server/client/URL) with a litmus test. [Ch. 6](06-screens-and-servers.md)

**Storybook** — The component showroom displaying every screen piece in every state, in isolation. [Ch. 7](07-look-feel-and-languages.md)

**Stripe** — The payments company; handles cards, fraud, and compliance via hosted checkout and webhooks. [Ch. 8](08-connected-services.md)

**Supply-chain attack** — Slipping malicious code into a popular package that downstream projects then install; defended here by quarantine, scanning, and pinning. [Ch. 9](09-quality-and-trust.md)

**Tailwind CSS** — The utility-based styling system enforcing a consistent design vocabulary. [Ch. 7](07-look-feel-and-languages.md)

**TanStack Query** — The library that caches and synchronizes all server data in the browser; home of optimistic updates. [Ch. 6](06-screens-and-servers.md)

**Test clocks (Stripe)** — Stripe's "time machine" for testing what happens to subscriptions months in the future; used in this project's verification. [Ch. 8](08-connected-services.md)

**TOTP / 2FA** — Time-based one-time passwords (authenticator-app codes) / two-factor authentication generally. [Ch. 5](05-accounts-and-identity.md)

**Transaction (database)** — An all-or-nothing group of changes; never half-happens. [Ch. 4](04-the-database.md)

**Trivy** — The scanner checking built container images for known vulnerabilities on every change. [Ch. 9](09-quality-and-trust.md)

**tRPC** — The tool making the backend's API directly visible to the frontend's type checker; used for all *reads*. [Ch. 6](06-screens-and-servers.md)

**Turborepo** — The build orchestrator that caches and parallelizes work across the monorepo. [Ch. 3](03-the-foundation.md)

**Type / type checker** — A declared data shape ("this is an email") / the program that refuses contradictions across the whole codebase before it runs. [Ch. 3](03-the-foundation.md)

**Uploadthing** — The file-upload service; browsers upload straight to cloud storage, with fail-closed deletion. [Ch. 8](08-connected-services.md)

**Vendor lock-in** — When leaving a service is so painful you're effectively trapped; a recurring thing this project designs against. [Ch. 1](01-the-big-picture.md)

**Visual regression testing** — Pixel-comparing screenshots of every component against approved baselines to catch accidental visual breakage. [Ch. 7](07-look-feel-and-languages.md)

**Vitest** — The fast, modern unit-test runner used across every package. [Ch. 9](09-quality-and-trust.md)

**Webhook** — An API call in reverse: an external service (e.g., Stripe) calls *your* app when something happens. [Ch. 8](08-connected-services.md)

**XSS (cross-site scripting)** — An attack where a page is tricked into running an attacker's script with the user's powers; countered by the CSP. [Ch. 10](10-shipping-and-running.md)

**Zod** — The library for writing validation rules once, shared by browser and server, feeding the type system. [Ch. 6](06-screens-and-servers.md)

**Zustand** — The deliberately tiny library holding ephemeral screen state (e.g., "is the sidebar open?"). [Ch. 6](06-screens-and-servers.md)

---

[← Built With AI Agents](11-built-with-ai-agents.md) · [Guide index](README.md)
