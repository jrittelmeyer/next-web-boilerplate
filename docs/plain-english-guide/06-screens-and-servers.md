# Chapter 6 — Screens Talking to Servers: the app's internal nervous system

[← Accounts & Identity](05-accounts-and-identity.md) · [Guide index](README.md) · [Next: Look, Feel & Languages →](07-look-feel-and-languages.md)

---

This chapter covers the least visible and most consequential engineering in the
project: *how* the dining room and the kitchen ([Chapter 2](02-how-web-apps-work.md))
talk to each other. Get this wrong and every feature built afterward inherits the
flaws. The project's approach can be summarized as: **one clear convention for
reading data, one for changing it, one shared rulebook for validating it, and one
disciplined answer to "where does each piece of information live?"**

## Reading data: tRPC

**Technical name:** `tRPC v11` — "TypeScript Remote Procedure Call."

**What it solves.** Traditionally, the frontend and backend agree on an API
([Chapter 2](02-how-web-apps-work.md)) documented… somewhere, hopefully. When the
backend changes a detail and the frontend doesn't hear about it, the app breaks —
*at runtime, in front of users*. Entire tools and job functions exist just to keep
the two sides honest.

**What tRPC does, plainly:** because both halves live in one TypeScript codebase
([Chapter 3](03-the-foundation.md)), tRPC makes the backend's API *directly
visible to the frontend's type checker*. If the kitchen renames a dish, every menu
that mentions it turns red immediately, on the engineer's screen, before the
change can even be saved to the repository. The API documentation cannot drift out
of date because the API *is* the always-checked code. This is the keystone of the
end-to-end type safety promised in [Chapter 3](03-the-foundation.md) — database
→ backend → screen, one unbroken chain of checked types.

**Why tRPC over the alternatives:**

- **REST** (the traditional style): universal, but the contract between the halves
  lives in documentation and hope.
- **GraphQL** (Facebook's style): powerful contract, but demands its own schema
  language, its own servers, and real operational complexity — built for
  Facebook-scale problems most products don't have.
- **tRPC** delivers GraphQL's contract guarantees with near-zero ceremony — *if*
  your project is all-TypeScript in one repository, which this one is precisely to
  unlock tools like this.

Details layered on top (each one a documented decision): query results
**transparently preserve rich data types** like dates (a classic subtle-bug
source, verified working); every request passes through **telemetry** (timing and
outcome logging, flushed *after* the response is sent so users never wait on the
logging — a serverless-hosting subtlety the decision log spells out); and public
read endpoints are **rate-limited** like sign-in attempts are.

## Changing data: Server Actions

**Technical name:** React/Next.js **Server Actions**, used for all **mutations**
(the industry word for any operation that changes data — creating, editing,
deleting).

**What they are, plainly:** the newest React/Next.js machinery for form
submissions — a screen's "Save" button invokes a backend function directly, with
the framework handling the transport securely. This project's convention: **every
read goes through tRPC; every write goes through a Server Action** — one rule,
applied everywhere, so an engineer (or AI assistant) never wonders which pattern a
given feature uses.

**Why the split** (a documented decision): Server Actions have the best
**progressive enhancement** story — the technical term for "the form still works
even if the fancy browser-side code hasn't loaded or failed," because it falls
back to the browser's plain built-in form submission. Writes are exactly where
that resilience matters most. Every action returns a uniform "here's your result
*or* here's a structured, field-by-field error" shape, so screens handle failure
consistently — including which specific form field to highlight.

## The shared rulebook: Zod and React Hook Form

**The validation problem.** Rules like "email must be valid, name under 100
characters" must run in *two places*: in the browser (instant feedback — good
experience) and on the server (actual enforcement — because, per
[Chapter 2](02-how-web-apps-work.md), the browser can be tampered with and must
never be trusted). Write the rules twice and they *will* drift apart.

**The solution:** rules are written **once**, as `Zod` schemas — a library for
declaring data rules in TypeScript ("this is an email," "this is 1–100
characters") that both validates at runtime *and* feeds the type checker — and
kept in a dedicated shared package (`validators`) that both the browser code and
the server code import. One rulebook, two enforcement points, physically
incapable of drifting. Forms themselves are wired with `React Hook Form`, the
standard library for the unglamorous mechanics of form state, errors, and
submission — chosen for performance (it avoids re-rendering the whole form on
every keystroke) and its native Zod integration.

## Where information lives: the state-management discipline

**"State"** is the running app's short-term memory — everything it currently
knows. Poor state discipline is the leading cause of the bugs users describe as
"it's just glitchy": stale lists, phantom values, screens disagreeing with each
other. This project's discipline (documented with a memorable test) sorts every
piece of information into exactly one of three homes:

1. **Server state** — anything the database is the truth of (your posts, your
   notifications). Lives in `TanStack Query`, the industry-standard library that
   caches server data in the browser, keeps it fresh, deduplicates requests, and
   enables **optimistic updates** — the screen reflects your action instantly
   while the server confirms in the background, rolling back gracefully on
   failure. (Why apps feel "snappy.")
2. **Client state** — ephemeral UI facts the server doesn't care about (is the
   sidebar open?). Lives in `Zustand`, a deliberately tiny state library —
   chosen over the heavyweight legacy standard (`Redux`) as today's mainstream
   default for exactly this small-and-fast role.
3. **URL state** — anything a user might bookmark or share (current page number,
   search filters). Lives in the web address itself, so links and refreshes just
   work.

**The litmus test, verbatim from the docs:** *"If two browser tabs disagreed
about this value, is that a bug?"* Yes → server state. No → client state.
Shareable → URL. The cardinal sin — copying server data into a second home,
creating two versions that drift — is explicitly forbidden and explained. This
one page of discipline prevents entire categories of "glitchiness," and it's
exactly the kind of rule that keeps a *second* engineer (or an AI) from eroding
the first one's architecture.

## Live updates: realtime notifications without new infrastructure

The project includes a complete worked example of **realtime** — data appearing
on screen the moment it happens, no refresh — as a notifications feature with an
unread-count badge. The engineering choice is a signature of the whole project:

- **The typical approach:** rent another service (Pusher, Ably) or run another
  system (Redis + WebSocket servers) — new infrastructure, new costs, new
  failure modes.
- **This project:** PostgreSQL has a built-in bulletin board (`LISTEN/NOTIFY` —
  one part of the app posts a note, other parts subscribed to that topic hear it
  instantly). The backend listens there and streams updates to browsers over
  **SSE** ("server-sent events" — a standard, built-into-every-browser one-way
  live channel). **Zero new services, zero new dependencies** — it reuses the
  database connection the app already has, and works correctly even when the app
  runs as multiple copies.

The robustness details are all handled and documented: every notification is
*saved to the database first*, with the live push as a bonus on top — so a closed
laptop loses nothing; a dropped connection **self-heals** by re-fetching what was
missed on reconnect; and the unread badge is recomputed from the database rather
than counted on the screen, so it's never wrong. Even the limits are documented
honestly (certain serverless hosting styles cap long-lived connections; the docs
say so and name the fallbacks) — and the scale-up path to heavier tools is
sketched for the day it's needed.

**Business value of the chapter:** these conventions are invisible in a demo and
decisive over years — a codebase where every feature reads, writes, validates,
and stores state the *same* way stays cheap to change, safe to hand to new people
(or AI agents), and free of the drift that quietly turns two-day features into
two-week features.

---

[← Accounts & Identity](05-accounts-and-identity.md) · [Guide index](README.md) · [Next: Look, Feel & Languages →](07-look-feel-and-languages.md)
