# Chapter 11 — Built With AI Agents: what agentic coding is, and how it actually worked here

[← Shipping & Running](10-shipping-and-running.md) · [Guide index](README.md) · [Next: Glossary →](12-glossary.md)

---

This chapter stands somewhat apart. The previous ten described *what* was built;
this one describes *how* — because this project was built almost entirely
through **agentic AI-assisted development**, and it was deliberately engineered
so that AI assistants can keep working on it indefinitely. For anyone whose
mental model of "AI coding" is autocomplete or chatbots that spit out snippets,
this chapter is the update. It's also, arguably, the most transferable lesson in
the whole repository: the product is a starter kit, but the *process* is a
working demonstration of how software gets built now.

## From autocomplete to agents: three generations in five years

**Generation 1 — smart autocomplete (circa 2021).** Tools like the original
GitHub Copilot suggested the next few lines as an engineer typed. Helpful, like
a very well-read pair of hands. The human did all the thinking, structuring,
testing.

**Generation 2 — chat (circa 2023).** ChatGPT-style assistants could write
whole functions on request. But they were sealed in a chat box: they couldn't
see your project, run your code, or check their own work. The human copied
snippets out, pasted them in, fixed the mismatches, and did all the verifying.

**Generation 3 — agents (circa 2025, and what built this project).** An
**agentic** coding tool — this project used Anthropic's **Claude Code** — is an
AI that doesn't just *suggest* work; it *performs* it, in a loop, with tools:

- It **reads the actual project** — any file, the history, the documentation.
- It **executes multi-step plans**: "add two-factor authentication" becomes
  research → schema change → backend code → screens → tests → documentation,
  sequenced and carried out.
- It **runs things and reacts**: it executes the build, the type checker, the
  test suites — *observes real failures* — and fixes them, iterating until
  everything is green. This is the qualitative leap: a Generation-2 chatbot
  guesses whether its code works; an agent *finds out*, the same way an
  engineer does.
- It **verifies beyond the code**: for this project the agent started real
  servers and drove real browsers to confirm features behaved — including,
  e.g., completing live test-mode payment flows.

The honest definition of the human's new role: less typist, more **engineering
manager of a tireless, extremely fast, occasionally overconfident staff
engineer**. Everything below is about how this project made that management
relationship rigorous instead of hopeful.

## The working agreements: how a human stays in charge

The repository's own onboarding file spells out binding rules of engagement —
worth quoting nearly verbatim, because they answer the reflexive skeptic's
question ("so the AI just… does whatever?") precisely:

1. **Plan → sign-off → build.** For every step, the agent must present a
   detailed plan *and stop*. A human reads it, questions it, amends it, and
   explicitly approves before a line of code is written. The agent is also
   forbidden from rolling on to the next piece of work unprompted. Judgment
   stays human; execution is delegated.
2. **Verify by building and running, not by assuming.** Familiar from
   [Chapter 1](01-the-big-picture.md) — but note its origin: it's an *anti-AI-
   overconfidence rule*. Language models state wrong things fluently; this rule
   converts every claim of "done" into machine-checkable evidence: the full
   quality gate must pass, and the feature must be observed working live.
3. **Version-check every dependency against the registry** — never trust
   training data or blog posts about what's current (an AI's knowledge has a
   cutoff date; the ecosystem moves weekly), and respect the 7-day quarantine
   from [Chapter 9](09-quality-and-trust.md).
4. **Keep the documentation current as part of every change** — not after,
   *as part of*. Below is why that rule is the linchpin of the whole system.

Two details from the rules capture the flavor of managing AI seriously: agents
must live-verify against a *fresh* production build (so "works in the dev
sandbox" can't masquerade as "works"), and every change must stay
Windows-compatible (an AI's muscle memory defaults to Linux conventions; this
repo is developed on Windows too, so the rule exists and is enforced).

## The context problem — and the documentation architecture that solves it

Here is the deepest idea in this chapter, and the thing this repository is
genuinely ahead of the curve on.

An AI agent has a **context window** — a working memory. It's large but finite,
and everything relevant must fit: your instructions, the code it's reading, the
rules of the project. Two naive strategies both fail: give the agent *nothing*
and it reinvents patterns, contradicts previous decisions, and re-litigates
settled questions; give it *everything* — dump the whole project in — and the
important rules drown in noise (besides not fitting). The craft that has emerged
is called **context engineering**: curating exactly what an agent needs, when.

This repository is *built around* that craft:

- **`AGENTS.md`** — a standardized agent-onboarding file at the project root
  (an emerging industry convention supported across AI tools, the way
  `README.md` is the convention for humans). It holds the working agreements
  above, the tech-stack summary, the commands, and the map of the repository.
  Every agent session starts by absorbing it. (`CLAUDE.md` is a thin
  tool-specific wrapper pointing at the same file.)
- **Fourteen focused context documents** (`docs/context/`) — one per domain:
  the database, authentication, the API layer, state, UI, testing, security,
  internationalization, deployment, services, conventions, architecture, the
  stack, and the decision log met in [Chapter 1](01-the-big-picture.md). The
  index instructs: *load the file relevant to your task* — an agent doing email
  work loads the services doc, not all fourteen. Precisely briefed, per task,
  every time — like giving a contractor the wiring diagram for the room they're
  working on, not the deed history of the whole building.
- **Each doc says when to load it** — the index maps task → document, so
  context selection is itself mechanical, not judgment the agent must get right.

Now the linchpin: **why "keep docs current" is a binding rule.** In most
software teams, documentation is a nice-to-have that rots, because humans carry
project knowledge in their heads between sessions. **An AI agent carries
nothing between sessions.** Each new session, it *is* the documentation. Stale
docs don't merely inconvenience an agent — they actively mislead it into
confidently wrong work. So this project treats documentation as **load-bearing
infrastructure**: updated in the same change as the code, audited on a schedule
(dedicated audit routines hunt "drift" between what the docs claim and what the
code does), with detail that's no longer needed day-to-day *archived* rather
than deleted — kept lean for the agent's working memory, preserved for the
historian.

And the beautiful, very defensible side effect, worth stating twice: **the best
onboarding package for an AI is indistinguishable from the best onboarding
package for a new human employee.** Every hour invested in agent-readiness came
back as the finest new-hire documentation most engineers will ever have seen.

## Skills, memory, and guardrails: the operational details

Three more mechanisms, briefly, because they show how mature this practice has
become:

- **Skills** — reusable, checked-in procedures the agent can invoke by name
  (they live in the repository like code). This repo ships seven: a
  *checkpoint* skill (commit and push work safely at each step boundary), a
  *project-audit* skill (the deep scoring audits from
  [Chapter 1](01-the-big-picture.md)), a *doc-audit* skill (the drift-hunting
  described above), a machine-hygiene (*tidy*) skill, a dependency
  version-checker, a live-verification routine, and a *project-init* skill
  that interviews you about a new product idea and turns it into a researched
  build plan. Think of them as standard operating procedures — the difference
  between an organization that has process and one that has habits. And in
  July 2026 the whole set graduated into its own open-source project:
  [ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit), a portable library
  of these procedures that any project can install. The process that built
  this repository is now itself a published, reusable product.
- **Persistent memory** — between sessions, the agent maintains its own notes:
  durable facts, hard-won gotchas (e.g., the precise quirks of driving a
  payment provider's tools headlessly), and lessons from mistakes. Session two
  doesn't re-pay session one's tuition.
- **Guardrails** — a checked-in permissions allowlist defines what the agent
  may do without asking (run tests, read files) versus what requires human
  approval; and every quality machine from
  [Chapter 9](09-quality-and-trust.md) — strict types, the full test suites,
  coverage ratchets, CI gates, dead-code detection — applies to the agent's
  output with zero sentiment. The safety net that catches careless humans
  catches careless AIs identically. That's *why* AI participation is safe here:
  not trust — verification.

## The audit loop: AI checking AI, with receipts

The quality scores from [Chapter 1](01-the-big-picture.md) (eight passes,
93 → 100, against a "best imaginable starter kit" bar) come from the audit
skill above: a full sweep that re-verifies documentation claims against actual
code, scores every feature area, and emits a prioritized backlog — which was
then worked to completion through the same plan → sign-off → build loop, and
the reports archived in the repository. The finish is a story in itself: seven
passes plateaued at 99.35, because the remaining points sat locked behind the
audits' own "won't fix" rulings. So in July 2026 the owner directed the agent
to *re-argue its own rulings*, one by one — and every single one fell. An
eleven-item closing program shipped through the same sign-off loop, and the
eighth audit — which trusts nothing, re-checking each claimed fix in the code
itself — scored it 100, noting explicitly that 100 is a state future audits
must re-earn, not a finish line. Yes, it's the same AI tooling grading
its own homework — [Chapter 1](01-the-big-picture.md) flags that honestly — but
each pass is *evidence-based* (claims checked against code, not vibes), the
bar was designed to be harsh, and the found-gaps-then-fixed-them trail is
public. It's the software equivalent of publishing your inspection reports along
with the house.

## What to take away

For a technical-leadership audience, the defensible claims are:

1. **Agentic development is real and produces production-grade output** — this
   repository, with its verification pedigree and audit trail, is the exhibit.
2. **The productivity is not free — it's purchased with discipline**: written
   working agreements, human sign-off gates, machine-enforced quality, and
   documentation treated as infrastructure. Teams that adopt the tools without
   the discipline get fast-moving chaos.
3. **"Agent-ready" is becoming a property of codebases**, like "well-tested" —
   and it compounds: this repo is faster for AI to work on *and* faster for
   humans to join, because the same investment serves both.
4. **The human role shifts up, not out**: from writing code to setting
   direction, reviewing plans, approving trade-offs, and owning judgment. The
   plan/sign-off records in this repository are what that looks like in
   practice.

---

[← Shipping & Running](10-shipping-and-running.md) · [Guide index](README.md) · [Next: Glossary →](12-glossary.md)
