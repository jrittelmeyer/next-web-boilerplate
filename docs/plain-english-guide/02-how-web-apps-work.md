# Chapter 2 — How Web Apps Work (a ten-minute foundation)

[← The Big Picture](01-the-big-picture.md) · [Guide index](README.md) · [Next: The Foundation →](03-the-foundation.md)

---

This chapter is the only "theory" in the guide. It builds the small set of mental
models everything else rests on. If you already know what a server, a database, and
an API are, skim the headings and move on.

## The restaurant model

Every web application — Gmail, Amazon, your bank's website — is split into two
halves that talk to each other over the internet:

- The **frontend** (also "the client") is everything that runs *on your device, in
  your browser*: what you see, tap, and type. In the restaurant analogy, this is
  the **dining room** — menus, tables, the presentation of the food.
- The **backend** (also "the server") is everything that runs *on the company's
  computers*: checking your password, fetching your data, charging your card. This
  is the **kitchen** — where the real work happens, out of sight.

A **server** is just a computer whose job is to sit somewhere (usually in a rented
data center — that's all "the cloud" means: someone else's professionally run
computers) and answer requests. When you open a web app, your browser sends a
request — "show me my dashboard" — and the server sends back the answer.

The frontend must never be trusted with anything important. Anyone can tamper with
what runs on their own device — like a diner shouting alterations at the kitchen.
So every rule that matters ("is this person allowed to see this?", "is this credit
card valid?") is enforced in the kitchen, no matter what the dining room claims.
You'll see this principle — *enforce on the server* — recur constantly in this
project's design.

## The filing cabinet: databases

Applications need to remember things permanently: users, orders, messages. That's
the **database** — a specialized program built to store large amounts of
structured data and answer questions about it quickly and *safely*, meaning it
guarantees things like "this money transfer either fully happened or fully didn't
— never half."

The dominant kind is the **relational database**, which organizes data into tables
that look like spreadsheets — a `users` table, an `orders` table — with defined
relationships between them ("every order belongs to exactly one user"). You ask it
questions in a specialized language called **SQL** ("structured query language" —
pronounced "sequel"), which reads almost like English: *select all orders where
user is Maria*.

This project uses **PostgreSQL** (post-gress-cue-ell), a free, open-source
relational database with ~30 years of development behind it, widely considered the
gold standard. [Chapter 4](04-the-database.md) covers it in depth.

## The waiter's notepad: APIs

The dining room and kitchen need an agreed way to communicate. That's an **API**
("application programming interface") — a fancy term for **a menu of requests one
program agrees to accept from another, and the exact format of each**. "Send me
`getOrders` with a user's ID, and I'll reply with that user's orders, structured
exactly like so."

APIs matter twice in this guide:

1. **Internally** — this app's own frontend talks to its own backend through an
   API. How that's done safely is [Chapter 6](06-screens-and-servers.md).
2. **Externally** — the app talks to *other companies'* services through *their*
   APIs: it asks Stripe (a payments company) to charge cards, asks Resend (an
   email company) to deliver mail. That's [Chapter 8](08-connected-services.md).
   This is how modern apps are built: don't run your own card-processing
   infrastructure; rent the world-class one through its API.

## What code actually is

**Source code** is the application's recipe book: instructions written by humans
(or, increasingly, AI) in a **programming language** — a strict, unambiguous
notation that a computer can execute. This project's language is **TypeScript**,
explained in [Chapter 3](03-the-foundation.md).

Code lives in plain text files, organized in folders. The whole collection for a
project is called a **repository** (or "repo") — the project's single source of
truth. Repositories are managed by a tool called **Git**, which records every
change ever made, by whom, and why — like "track changes" in a document, but for
thousands of files across years, with the ability to rewind to any moment. Teams
host their repositories on **GitHub**, the world's dominant code-hosting service
(owned by Microsoft), which adds collaboration: proposing changes, reviewing them,
and — importantly for later chapters — running automatic checks on every change.
This project lives on GitHub as a public **template repository**, meaning anyone
can stamp out their own copy to build on.

## Standing on shoulders: open source and dependencies

Almost no one writes an application from absolute scratch. The software world runs
on **open source**: software whose recipe is public, free to use, and maintained
by communities (often sponsored by large companies). Everything this project is
built from is open source.

A ready-made piece of open-source software that you pull into your project is
called a **package** (or "library," or a **dependency** — because your project now
depends on it). Need to draw a calendar? There's a package. Modern projects use
hundreds of them, and the ecosystem where they're published is called the **npm
registry** — effectively the app store for JavaScript/TypeScript building blocks,
with millions of packages.

Two consequences matter for this guide:

- **Choosing dependencies is real engineering.** Every package is code written by
  strangers that runs inside your application. Is it maintained? Trustworthy?
  Fast? Will it exist in five years? A large part of this project's documented
  decision-making is exactly this ([Chapters 3–8](03-the-foundation.md)).
- **Dependencies are an attack surface.** Criminals sometimes hijack popular
  packages and slip malicious code into a new release — a **supply-chain attack**,
  the software equivalent of poisoning an ingredient at the food distributor. This
  project has unusually thorough defenses against it
  ([Chapter 9](09-quality-and-trust.md)).

## Day and night: development vs. production

The same application exists in multiple environments:

- **Development** ("dev") — running on an engineer's own machine while they work.
  Fake data, fast feedback, safe to break.
- **Production** ("prod") — the live version real users touch. Breaking this is
  what everyone works to prevent.

The journey of a change from an engineer's keyboard to production is called
**deployment**, and the modern practice is to automate the safety checks along the
way — every proposed change is automatically built and tested by machines before a
human even reviews it. That automation is called **CI** ("continuous
integration"), and it's a star of [Chapter 9](09-quality-and-trust.md).

One more term you'll meet: **environment variables**. These are the settings an
application reads when it starts — secret keys, the database's address — kept
*outside* the code, because code gets shared and secrets must not be. Think of the
app as a touring band and environment variables as the venue's tech sheet: same
band, different venue settings each night. A signature feature of this project is
that it starts and runs correctly with almost *no* settings provided, gracefully
switching off features whose settings are absent ([Chapter 8](08-connected-services.md)).

## The cast of characters, in one table

| Term | Plain meaning | Where it's covered |
| --- | --- | --- |
| Frontend / client | The part on your device — the dining room | [Ch. 6](06-screens-and-servers.md), [7](07-look-feel-and-languages.md) |
| Backend / server | The part on the company's computers — the kitchen | [Ch. 6](06-screens-and-servers.md) |
| Database | The permanent, guaranteed-safe filing system | [Ch. 4](04-the-database.md) |
| API | The agreed menu of requests between two programs | [Ch. 6](06-screens-and-servers.md), [8](08-connected-services.md) |
| Repository (repo) | The project's complete, history-tracked code | [Ch. 2](02-how-web-apps-work.md) |
| Git / GitHub | The change-tracking tool / the hosting service for repos | [Ch. 9](09-quality-and-trust.md) |
| Package / dependency | A ready-made building block pulled in from the ecosystem | [Ch. 3](03-the-foundation.md), [9](09-quality-and-trust.md) |
| Development / production | The workshop copy vs. the live copy | [Ch. 10](10-shipping-and-running.md) |
| CI | Robots that test every change automatically | [Ch. 9](09-quality-and-trust.md) |
| Environment variables | Start-up settings and secrets, kept outside the code | [Ch. 8](08-connected-services.md), [10](10-shipping-and-running.md) |

With these models in hand, everything that follows is just detail.

---

[← The Big Picture](01-the-big-picture.md) · [Guide index](README.md) · [Next: The Foundation →](03-the-foundation.md)
