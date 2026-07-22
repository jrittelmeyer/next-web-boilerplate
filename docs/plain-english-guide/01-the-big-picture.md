# Chapter 1 — The Big Picture

[← Guide index](README.md) · [Next: How Web Apps Work →](02-how-web-apps-work.md)

---

## What is this project?

The project's technical name is **`next-web-boilerplate`**. Each part of that name
means something:

- **Boilerplate** is an old printing-industry word that software borrowed. It means
  *the standard, repeated material you need every time before the unique part
  begins* — like the standard clauses at the top of every contract. In software, a
  "boilerplate" (also called a **starter kit** or **template**) is a pre-built
  foundation containing all the parts every application needs, so a team can skip
  straight to building what makes *their* application different.
- **Next** refers to **Next.js**, the specific framework it's built on (explained
  fully in [Chapter 3](03-the-foundation.md)). Think of it as the make and model of
  the chassis.
- **Web** means it builds applications that run in a web browser — no installation,
  works on any device, updated instantly for everyone.

So: this is a professionally engineered foundation for building browser-based
applications, published as a public template that anyone can copy and build on.

## The problem it solves

Here is something non-obvious about building software: **the feature you're
actually building is usually the smallest part of the work.**

Suppose a company wants to build, say, an online booking system. The booking logic
itself — calendars, availability, confirmations — might be a few weeks of work. But
before customers can use it, the team also needs:

- **User accounts.** Sign-up, sign-in, "forgot my password," email verification,
  protection against hackers guessing passwords, protection against automated bots
  creating fake accounts. Done properly, with modern security like two-factor
  authentication, this alone is months of specialist work — and mistakes here make
  headlines.
- **A database** — the permanent filing system for all the data — with a plan for
  backing it up and a *rehearsed* procedure for restoring it after a disaster.
- **Payments**, integrated with a payment provider, handling every messy edge case:
  failed cards, cancelled subscriptions, refunds.
- **Email** that actually reaches inboxes instead of spam folders (harder than it
  sounds — there's a whole chapter of internet plumbing involved).
- **Monitoring**, so when something breaks at 2 a.m., the team finds out from an
  alert rather than from an angry customer.
- **Automated testing**, so that fixing one thing doesn't silently break another.
- **Security hardening** against the standard catalogue of web attacks.
- **A way to actually put it on the internet** and keep it running.

None of that is the booking system. All of it is mandatory. Industry veterans
sometimes call this **undifferentiated heavy lifting**: work that is essential,
difficult, and identical across almost every project — meaning every team that
builds it from scratch is re-solving problems thousands of teams have already
solved, usually less well, because none of it is their specialty.

**This project is all of that heavy lifting, done once, done to a high standard,
verified to work, and documented.** A team that starts from it begins on day one at
the point most projects reach after four to six months — and at a quality level
most projects never reach, because "invisible" work like disaster-recovery drills
and accessibility testing is exactly what gets cut when deadlines loom.

## What makes this one different?

Free starter kits are not rare. Three properties distinguish this one, and they're
worth understanding because they're the heart of any pitch for it.

### 1. Everything is *verified*, not just assembled

Most starter kits *wire things together* and stop. The payment code exists, but
nobody has run a payment through it. This project's standing rule is **"verify by
building and running, not by assuming."** Concretely, and with dated records kept
in the repository:

- Real (test-mode) **payments** were processed end-to-end: checkout → the payment
  provider notifying the app → the app recording the subscription → the customer
  managing billing → even simulating what happens *months later* when a renewal
  card fails, using the payment provider's "time machine" testing feature.
- Real **emails** were sent through a real sending domain, with the
  inbox-deliverability plumbing configured and confirmed.
- Real **sign-ins with Google and GitHub** were performed against live accounts.
- A real copy of the application was **deployed to the public internet** on a
  hosting provider (Fly.io), with a live database, and confirmed healthy.
- The **backup-and-restore procedure was actually rehearsed**, not just written.

A useful analogy: any builder can hand you a house and a certificate. This builder
also turned on every tap, tripped every breaker, flooded the basement on purpose to
prove the sump pump works, and left you the dated inspection log.

### 2. Every decision is written down — including the rejected ones

The repository contains a **decision log**: a running record of every significant
technical choice, *why* it was made, what the alternatives were, and — unusually —
which options were **evaluated and deliberately rejected**, with the evidence.

Why does that matter to a non-engineer? Because undocumented decisions are a tax
on every future person who touches the project. "Why did they do it this way?" is
the single most common question in software maintenance, and when the answer is
lost, teams either waste time re-investigating or — worse — "fix" something that
was actually a careful trade-off, and break it. Here, the answer is always on file.
Even features that were built, tested, and then *removed* have their reasoning
recorded so the same dead end is never explored twice.

### 3. It's built for the age of AI-assisted development

The repository is deliberately structured so that an **AI coding assistant** can
work in it as effectively as a human engineer: the project's rules, conventions,
and context are written down in a form an AI can load precisely when needed. This
is genuinely novel, it's how the project itself was built, and it's the subject of
[Chapter 11](11-built-with-ai-agents.md) — for many audiences, the most important
chapter in this guide.

A happy side effect: documentation good enough to brief an AI is *also* the best
new-employee onboarding a project can have. The same pages serve both.

## How good is it, really? (The audit trail)

Quality claims are cheap, so this project measures itself. Nine separate audit
passes were run against a deliberately harsh standard — "how does this compare to
the best available starter kit imaginable?" — scoring every feature area out of
100. The scores across the audits ran **93 → 97.5 → 98.2 → 99.3 → 99.3 → 99.3 →
99.35 → 100 → 100**, with each gap found feeding a to-do list that was then worked
to completion. The audit reports themselves are preserved in the repository.

Two honest footnotes, because credibility matters more than a round number:

- The audits were performed by the same AI tooling that built the project —
  rigorous and evidence-based (each pass re-verifies claims against the actual
  code), but not an *external* certification.
- A perfect score against a "best imaginable" bar deserves suspicion, so here is
  exactly how it happened. Seven passes plateaued at 99.35 because the last few
  known imperfections had been classified "won't fix" — by definition, no amount
  of further auditing could move them. In July 2026 the owner ordered every one
  re-examined; all proved fixable after all, and an eleven-item "path to 100"
  program cleared the list one signed-off item at a time. It finished on 17 July
  2026, when the eighth audit independently re-verified each item in the code and
  scored 100. The project treats that score as **a state to maintain, not a
  trophy**: every future audit re-checks it against the moving "best available
  today" bar and can take points back. Proof that isn't just talk: a ninth pass,
  run days later once the project had settled back into ordinary maintenance (a
  dependency wave, new tooling installed), re-checked everything from scratch and
  held the same 100 — the score surviving a moving target, not just the day it
  was set.

The project is **feature-complete**: the "path to 100" effort is finished and
verified, nothing more is being added without a demonstrated need, and the
discipline for any change remains
*plan first → get human sign-off → build → verify*.

## Who would use it, and what is it worth?

- **A startup or product team** uses it to reach a first sellable product months
  faster, on a foundation that won't need to be rebuilt at the first success.
- **An agency or consultancy** uses it as the standard starting point for client
  projects, making every project consistent, auditable, and cheaper to maintain.
- **An enterprise team** uses it as a reference: a worked example of what "modern,
  secure, well-tested, AI-ready web engineering" looks like in practice, against
  which internal projects can be compared.
- **An individual developer** uses it to learn: because every decision explains
  itself, it doubles as a textbook of current best practice.

A defensible way to state the value: mid-level software engineers cost roughly
$10,000–$15,000 per month each. The foundation work this kit replaces is
realistically 4–6 months for a small experienced team — and that buys a *first
attempt*, not a hardened, audited, disaster-rehearsed one. The kit itself is free
and open; the value is the time, the risk removed, and the quality floor.

## What this project is *not*

Setting boundaries honestly is part of a defensible position:

- **It is not a finished product.** It's a foundation. It contains worked examples
  (a small "posts" feature demonstrating every pattern) but no business features.
  Someone still has to build the actual application on top.
- **It is not a no-code tool.** Using it requires software engineers (human, AI, or
  — realistically — both). It makes them dramatically faster; it doesn't replace
  them.
- **It is not locked to any vendor.** A recurring theme in its decisions is
  avoiding **vendor lock-in** — the trap where switching away from a service is so
  painful you're stuck. Its user-account system runs in its own database rather
  than a rented service; it deploys in a standard shipping-container format that
  nearly every hosting company accepts ([Chapter 10](10-shipping-and-running.md)).
- **It is opinionated.** For every category (database, styling, testing…) it picks
  *one* good tool and integrates it deeply, rather than offering a menu. The
  decision log explains each pick; a team that disagrees can swap a piece out, and
  the documentation even includes per-service "how to remove this" checklists.

---

[← Guide index](README.md) · [Next: How Web Apps Work →](02-how-web-apps-work.md)
