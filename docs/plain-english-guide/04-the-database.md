# Chapter 4 — The Database: where the data lives, and how it survives

[← The Foundation](03-the-foundation.md) · [Guide index](README.md) · [Next: Accounts & Identity →](05-accounts-and-identity.md)

---

If the application vanished tomorrow, it could be rebuilt from the code. If the
**data** vanished — the users, the orders, the history — the business might not
survive. This chapter is about the most conservative part of the whole project,
and deliberately so.

## PostgreSQL — the filing system

**Technical name:** `PostgreSQL` (commonly "Postgres"), a relational database
([Chapter 2](02-how-web-apps-work.md) explains what that means).

**Why Postgres over the alternatives:**

- **vs. MySQL** (the other big open-source relational database): both are fine;
  Postgres has become the modern default — richer features, famously strict
  correctness, and the strongest momentum among new projects and hosting
  providers.
- **vs. MongoDB and other "NoSQL" databases:** those store free-form documents
  instead of structured tables. Flexible early, painful later — business data
  *is* relational (customers have orders; orders have items), and giving up
  enforced structure and iron-clad multi-step transaction guarantees to avoid a
  little upfront design is a trade most teams regret at scale.
- **vs. rented proprietary databases** (e.g., Firebase): fast to start, but your
  data lives in someone else's proprietary system with their pricing and their
  rules — the definition of vendor lock-in. Postgres is free, open, and runs
  anywhere, including every major cloud's managed offerings.

A theme to notice: later chapters show this project *reusing Postgres* for jobs
that would otherwise each demand a separate specialized service (background job
queues, live notifications, rate-limit tracking). One boring, excellent tool doing
four jobs means four fewer systems to pay for, secure, monitor, and explain.

## Drizzle — the translator between code and database

**Technical name:** `Drizzle ORM`. An **ORM** ("object-relational mapper") is a
translator: the app is written in TypeScript, the database speaks SQL, and the ORM
lets engineers work with the database in ordinary TypeScript — with the type
system checking every query against the *actual shape of the tables*.

**Plainly:** if the database has a `users` table with an `email` column, and
someone writes code asking for `user.emial`, the typo is flagged *the moment it's
typed* — not discovered by a customer. The database's structure becomes part of
the end-to-end type safety net from [Chapter 3](03-the-foundation.md).

**Why Drizzle over Prisma** (the most popular alternative, and a documented,
honestly-weighed decision): Prisma is excellent but heavier — it historically
required an extra code-generation step on every change and carried a larger
runtime engine. Drizzle is leaner, stays visibly close to real SQL (which keeps
engineers honest about what the database is actually being asked to do), and
plugs into modern build tooling with no extra steps. The decision log notes
Prisma's newest version closed much of the gap — and keeps the reasoning on file
for honest re-evaluation. That candor is typical of the project.

## Migrations — renovating the filing cabinet without losing a file

**Technical name:** schema **migrations** (16 of them committed so far).

**The problem they solve:** the database's structure evolves — new tables, new
columns. In production, those changes must be applied to a *live database full of
real data*, in the right order, identically in every environment. Doing this by
hand is how data gets destroyed.

**The solution:** every structural change is captured as a small, numbered,
replayable script, stored in the repository like any other code. Any fresh copy of
the project can replay the full sequence and arrive at exactly the right
structure; any running copy applies only the new ones. The database's blueprint
has version control and an audit trail, just like the code. A newcomer (or an AI
assistant) runs one command and has a correct database.

## Backups and the rehearsed disaster drill

The project ships ready-made **backup and restore** commands, documentation
pointing to **point-in-time recovery** (the ability to rewind a database to, say,
3:59 p.m. yesterday, just before the bad thing happened), and — the part worth
repeating in any pitch — **a disaster-recovery runbook whose restore procedure was
actually rehearsed, and the rehearsal recorded.**

An unrehearsed backup plan is a hope, not a plan. The industry is littered with
companies that discovered *during* the disaster that their backups were empty,
incomplete, or unrestorable. "The restore drill has been run" is a sentence most
production systems — let alone free starter kits — cannot say.

## The worked example: the `posts` feature

The project includes one small, deliberately generic feature — "posts," think
mini blog entries — that exists purely as a **copy-me template** demonstrating
every data pattern a real feature will need, wired end-to-end and tested:

- **Fast pagination** ("keyset pagination" — the technique for browsing page 400
  of a huge list as fast as page 1; the naive approach that most tutorials teach
  gets slower the deeper you go).
- **Indexes** — the database equivalent of a book's index, pre-built for exactly
  the queries the feature runs, so lookups stay instant at a million rows.
- **A multi-step transaction** — an all-or-nothing group of changes (editing a
  post also archives the old version; both happen or neither does).
- **Optimistic UI** — the screen updates instantly on a user's action while the
  server confirms in the background, with automatic rollback if it fails
  ([Chapter 6](06-screens-and-servers.md)).
- **Team scoping** — posts can belong to an organization
  ([Chapter 5](05-accounts-and-identity.md)) — and **search indexing**
  ([Chapter 8](08-connected-services.md)).

Why this matters: the first real feature a team builds sets the pattern for all
the rest. Giving them a professionally built exemplar to copy is how a starter kit
transmits *standards*, not just parts. There's even a seed script (pre-filled
sample data) so the app is never an empty, untestable shell, and a documented
tuning knob for database connections under heavy load (`DB_POOL_MAX`) with
guidance on when to touch it.

**Business value of the chapter in one line:** the part of the system where
mistakes are unrecoverable is the part built with maximum conservatism — proven
technology, type-checked access, versioned structural changes, and a recovery plan
that's been fired in anger at least once, on purpose.

---

[← The Foundation](03-the-foundation.md) · [Guide index](README.md) · [Next: Accounts & Identity →](05-accounts-and-identity.md)
