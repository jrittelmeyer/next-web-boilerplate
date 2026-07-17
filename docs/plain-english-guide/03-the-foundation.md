# Chapter 3 — The Foundation: framework, language, and how the code is organized

[← How Web Apps Work](02-how-web-apps-work.md) · [Guide index](README.md) · [Next: The Database →](04-the-database.md)

---

Think of this chapter as the car's chassis, engine, and factory layout — the
choices everything else bolts onto. Each section follows the same pattern: the
technical name, what it is in plain terms, why it's useful, and why it was chosen
over the alternatives.

## React — the way screens are built

**Technical name:** `React 19`, an open-source **UI library** ("user interface" —
the screens and controls people interact with), created and maintained by Meta
(Facebook's parent company).

**What it is.** React is a way of building screens out of **components** —
self-contained, reusable building blocks. A "button" component, a "search box"
component, a "user profile card" component made *of* buttons and boxes. Like Lego:
build small pieces once, snap them together into pages.

React's second big idea: when data changes, you don't hand-write instructions for
updating the screen ("find the counter, change the 4 to a 5"). You declare what
the screen *should look like for any given data*, and React efficiently updates
whatever changed. This eliminates an entire species of bug — screens showing stale
or inconsistent information.

**Why React over alternatives** (Vue, Angular, Svelte — all respectable): React
has the largest ecosystem, talent pool, and corporate backing in the industry. It
is the default choice of modern web development in the way Excel is the default
spreadsheet. For a foundation meant to be built on by unknown future teams — and
understood by AI assistants trained on the world's code, which have seen more
React than anything else — the mainstream choice is the strategic one.

**Business value:** easiest hiring, most transferable knowledge, longest expected
lifespan, best AI-assistant fluency.

## Next.js — the framework around React

**Technical name:** `Next.js 16`, an open-source **framework** built on React by
a company called Vercel. A *framework* is the difference between a pile of
excellent parts and a drivable car: it supplies the structure, wiring, and
factory-standard answers to questions React deliberately leaves open — how pages
map to web addresses, how the backend and frontend share code, how pages load
fast.

**What it gives you, in plain terms:**

- **One project, both halves.** The dining room *and* the kitchen
  ([Chapter 2](02-how-web-apps-work.md)) live in one codebase, in one language,
  with the framework managing the boundary. Historically these were separate
  projects, separate teams, and endless coordination overhead.
- **Speed by default.** Next.js pre-builds as much of every page as possible
  *ahead of time*, so visitors get an instant response, with the personalized
  parts streaming in immediately after. This project turns on the newest version
  of this machinery (technically: **Cache Components** with **Partial
  Prerendering** — every page gets an instantly-served static shell with the
  dynamic holes filled in live, and the **React Compiler**, which automatically
  optimizes screen code that engineers previously had to hand-tune). The plain
  meaning: pages feel fast without anyone spending effort making them fast, and
  the project demonstrates the *current* way of doing this, not the 2022 way.
- **Search-engine friendliness.** Because pages are rendered on the server, Google
  can read them properly — vital for any public-facing product. (The industry term
  is **SEO**, "search engine optimization.")

**Why Next.js over alternatives** (Remix, plain single-page React, SvelteKit…):
Next.js is the most widely deployed React framework by a wide margin, with a
full-time company behind it and first-class support from every hosting provider.
Same strategic logic as React: the mainstream, best-supported path.

**Worth knowing:** Vercel (the company) also sells hosting, and many Next.js
starters quietly lock you into it. This one deliberately does not — it deploys in
a portable format that runs anywhere ([Chapter 10](10-shipping-and-running.md)).

## TypeScript — the language, with a safety net

**Technical name:** `TypeScript 6`, in `strict` mode. An open-source programming
language from Microsoft.

**What it is.** The native language of web browsers is **JavaScript** — powerful,
ubiquitous, and famously permissive: it lets you write obvious nonsense (add a
number to a customer record, ask for a field that doesn't exist) and only explodes
*later, when a user hits it*. TypeScript is JavaScript plus **types**: every piece
of data declares what it is ("this is a number", "this is a customer with a name
and an email"), and a checking program reads the entire codebase and refuses to
accept contradictions — *before the code ever runs*.

Analogy: writing JavaScript is drafting a contract with no lawyer review — errors
surface when the deal goes wrong. TypeScript is having every clause
cross-checked against every other clause automatically, on every edit.

**"Strict mode"** means every optional safety check is switched on, maximum
strictness — this project opts into all of it, everywhere.

**Why it matters more than it sounds:** an entire category of production failures
simply cannot ship. And there's a compounding effect you'll see throughout this
guide: this project chooses tools that let types flow *unbroken* from the database
all the way to the screen — so if someone renames a database field, every screen
that used it instantly flags red until fixed. The industry phrase is **end-to-end
type safety**. It's also a super-power for AI assistants: the type checker
instantly catches an assistant's mistakes, making AI-generated changes far safer
([Chapter 11](11-built-with-ai-agents.md)).

**Why TypeScript over plain JavaScript:** at this point, essentially no serious
new project chooses otherwise; TypeScript is the professional standard. (One
honest footnote from the decision log: a brand-new, much faster version 7 of
TypeScript exists, but it doesn't yet plug into Next.js's build machinery — so the
project stays on version 6 and tracks the upgrade as a dated to-do item rather
than jumping early. That's the project's dependency philosophy in miniature.)

## Node.js — the engine the backend runs on

**Technical name:** `Node.js 24 (Active LTS)`.

**What it is.** JavaScript/TypeScript originally only ran inside browsers. Node.js
is the program that runs it *on servers* — the engine for the kitchen half of the
app. Using one language on both halves means one hiring pool, one set of tools,
and shared code (the same validation rules run in the browser *and* on the server
— see [Chapter 6](06-screens-and-servers.md)).

**"Active LTS"** means "Long-Term Support": the version officially designated for
stability and years of security updates — the Toyota Camry choice, deliberately
neither bleeding-edge nor stale.

## The monorepo — one well-organized factory

**Technical names:** a **monorepo** managed by `pnpm workspaces` and
`Turborepo 2`.

**What a monorepo is.** Software this size is really several distinct pieces: the
web application itself, the database layer, the email templates, the shared
design components, the background-job worker… Two ways to organize them: separate
repositories for each (like independent suppliers shipping parts to each other —
with all the versioning and coordination pain that implies), or **one repository
containing all of them as cleanly separated internal packages** — a "monorepo,"
like a single factory with well-organized departments.

This project is a monorepo with a deliberate layout: one `apps/web` (the
application), plus internal packages for the database (`db`), sign-in system
(`auth`), email (`email`), background jobs (`jobs`), shared screen components
(`ui`), shared validation rules (`validators`), and monitoring configuration
(`observability`) — plus shared tooling configuration. The boundaries force clean
separation (the database package knows nothing about screens; the email package
can be lifted out whole), while everything still moves together in one history —
one change can update the database *and* the screens *and* the tests atomically.

**The supporting tools, briefly:**

- **`pnpm`** — the package manager: the tool that fetches and organizes the
  hundreds of open-source dependencies ([Chapter 2](02-how-web-apps-work.md)).
  Chosen over the default (`npm`) and older alternative (`yarn`) because it's
  faster, dramatically more disk-efficient (packages stored once, shared
  everywhere), *stricter* — packages must declare what they use, no silent
  borrowing, which prevents a whole class of "works on my machine" failures — and
  it can enforce a security rule you'll meet in
  [Chapter 9](09-quality-and-trust.md): refusing to install any package version
  less than 7 days old, so a hijacked release is caught by the community before it
  ever reaches this project.
- **`Turborepo`** — the build orchestrator. It understands the dependency order
  between the internal packages, runs work in parallel, and — its headline trick —
  **caches** everything: if nothing changed in a package since the last build, it
  replays the stored result in milliseconds instead of rebuilding. Turns
  ten-minute rebuilds into seconds. Chosen over the main alternative (`Nx`) as the
  simpler tool that fits Next.js naturally (both are made by companies in the same
  ecosystem; Turborepo is Vercel's).

**Business value of the whole section:** the foundation choices are aggressively
mainstream *on purpose* — biggest talent pools, best documentation, longest
horizons, deepest AI fluency — while the organization (strict types everywhere,
enforced package boundaries, cached builds) is what keeps a growing team fast at
month 24, not just at week 2.

---

[← How Web Apps Work](02-how-web-apps-work.md) · [Guide index](README.md) · [Next: The Database →](04-the-database.md)
