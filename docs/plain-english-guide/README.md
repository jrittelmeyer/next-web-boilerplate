# The Plain-English Guide to `next-web-boilerplate`

**Who this is for:** someone with *no* background in modern software development who
wants to genuinely understand — and be able to explain to others — what this project
is, what's inside it, why each piece was chosen, and why it's valuable.

**What this is not:** a manual for using the software. Nothing here requires you to
touch a computer. It's a guided tour, written the way you'd explain things over
coffee, with every technical term defined the moment it appears.

**Where the code lives:** the project is public at
[github.com/jrittelmeyer/next-web-boilerplate](https://github.com/jrittelmeyer/next-web-boilerplate).
Its own technical documentation — referenced throughout this guide — is the
drill-down layer beneath these pages: start at
[docs/FEATURES.md](https://github.com/jrittelmeyer/next-web-boilerplate/blob/main/docs/FEATURES.md)
(the full inventory with reasoning) and
[docs/VERIFICATION.md](https://github.com/jrittelmeyer/next-web-boilerplate/blob/main/docs/VERIFICATION.md)
(the dated, hands-on proof).

---

## The 60-second version

This project is a **starter kit for building professional web applications** — the
kind of software you use in a browser: online stores, dashboards, booking systems,
team tools. Instead of starting a new application from a blank page (which means
months of building plumbing before any real feature exists), a team starts from this
kit and gets, on day one:

- User accounts with modern sign-in security (fingerprint login, two-factor codes,
  one-time emailed sign-in links, "sign in with Google")
- A place to store data safely, with backups and a rehearsed recovery plan
- The ability to take payments, send emails, upload files, and search content
- Built-in monitoring, so the team knows about problems before customers complain
- A complete automated safety net of tests, so changes can't quietly break things
- Instructions so thorough that both a new employee **and an AI coding assistant**
  can start doing productive work immediately

Two things make it unusual even among products of this type. First, **everything in
it has been proven to work by actually running it** — real test payments were
processed, real emails were delivered, a real copy was deployed to the internet —
not just assembled and assumed to work. Second, **every design decision is written
down with its reasoning**, including the roads *not* taken, so nobody ever has to
guess why something is the way it is.

It was also built almost entirely through **agentic AI-assisted development** — a
human directing an AI coding assistant that plans, writes, tests, and documents the
work under supervision. Chapter 11 explains exactly how that works, because the
process is as noteworthy as the product.

---

## How to read this guide

The chapters build on each other, but each one also stands alone. If you read
nothing else, read chapters **1, 2, and 11**.

| Chapter | What you'll learn |
| --- | --- |
| [1. The Big Picture](01-the-big-picture.md) | What this project actually is, the problem it solves, and how to judge its quality |
| [2. How Web Apps Work](02-how-web-apps-work.md) | A ten-minute foundation: browsers, servers, databases, and code — everything later chapters assume |
| [3. The Foundation](03-the-foundation.md) | The "chassis": the framework, the programming language, and how the code is organized |
| [4. The Database](04-the-database.md) | Where the data lives, how it's kept safe, and how it survives disasters |
| [5. Accounts & Identity](05-accounts-and-identity.md) | Sign-in, passwords, fingerprint login, teams, permissions, and the audit trail |
| [6. Screens Talking to Servers](06-screens-and-servers.md) | How the part you see communicates with the part you don't — reliably and safely |
| [7. Look, Feel & Languages](07-look-feel-and-languages.md) | The design system, dark mode, accessibility, and speaking to users in their own language |
| [8. Connected Services](08-connected-services.md) | Payments, email, file uploads, search, background work, and monitoring |
| [9. Quality & Trust](09-quality-and-trust.md) | The automated safety net: tests, inspections, and defenses against poisoned software parts |
| [10. Shipping & Running](10-shipping-and-running.md) | How the app gets onto the internet, and how it stays healthy there |
| [11. Built With AI Agents](11-built-with-ai-agents.md) | What "agentic coding" means, how this project was actually built, and why that matters |
| [12. Glossary](12-glossary.md) | Every technical term in the guide, alphabetized, in one or two sentences each |

**A note on formatting:** throughout the guide, technical names appear `like this`
(the actual name a developer would use), followed immediately by a plain-English
explanation. The [Glossary](12-glossary.md) collects all of them for quick reference.

**The slide deck:** this folder also contains [`slide-deck.html`](slide-deck.html) —
a self-contained presentation covering the same ground pitch-style. GitHub shows
HTML files as source code, so to view it as slides, download the file and open it
in any browser.

---

## The one-paragraph elevator pitch, for reuse

> This is a production-grade starter kit for web applications, built on the most
> widely used modern web technology (Next.js and React). It compresses roughly the
> first several months of any serious application project — accounts, payments,
> email, search, security, testing, monitoring, deployment — into a verified,
> documented, working foundation. Every feature has been proven end-to-end against
> real services, every architectural decision is recorded with its rationale, and
> the whole repository is structured so that AI coding assistants can work on it as
> effectively as human engineers — which is also how it was built, under human
> direction and review, to a quality score that peaked at a perfect 100 out of 100
> (passes 8–9) and holds 99.65 across eleven increasingly demanding audits, the
> small dip coming not from any regressed code but from the moving "best-available"
> bar reclaiming points on maintenance currency — exactly the way the project says
> its own audits are allowed to.

---

*Current as of 2026-07-23 (repo commit `212b628` — the 100/100 peak (audit passes
8–9) has settled to 99.65 at passes 10–11 as the moving "best-available" bar
reclaimed 0.35 point on maintenance currency; no code regressed and the gaps it
flagged were closed the same week. Since the last stamp: the July 2026 Next.js
advisory batch (9 CVEs) was remediated the day after disclosure, a daily
advisory-watch pipeline that auto-files and auto-closes a security to-do ticket
went live, and image-optimization gained end-to-end test coverage. Earlier: a
second "inception door," `/project-adopt` (migrating an existing codebase onto
this foundation), shipped and completed its own live trial, the repository cut its
first tagged releases (`v1.0.0`, `v1.1.0`), and the project gained a public face —
a hosted Storybook component gallery and a screenshot tour in the README).*
