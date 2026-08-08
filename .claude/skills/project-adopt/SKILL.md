---
name: project-adopt
description: Adopt an existing codebase onto this template — survey it into a parity contract, build an honest theirs-vs-template disposition map, converge on a product brief + migration map, and regenerate the living docs into a port program. Use when the user has an existing app to migrate onto the template — or to merge/upgrade it with the template's features — says "adopt this codebase" / "port my app to this boilerplate" / "merge the boilerplate into my app", or drops source code into the intake dir.
---

# project-adopt

The one-time inception pass for a product that **already exists as code** — the
brownfield sibling of `project-init`. Input: an existing codebase (a path, a git
URL, or the drop dir). Output: a product brief reverse-engineered from the observed
product, a **migration map** carrying the parity contract and disposition table, and
a regenerated status doc + banded backlog whose completion is *a surface-identical
app on the template foundation — every carried feature working, proven by the
port's parity specs and carried suites at the adopting repo's enforced thresholds —
with the template features that pass the meaningful-improvement bar (§3) baked
in* — then the lifecycle pipeline begins at row 1.

Project parameters come from the adapter config `.claude/ai-dev-kit.config.json`:
`init.productBrief` (default `docs/PRODUCT.md`), `init.migrationMap` (default
`docs/MIGRATION.md`), `init.sourceDir` (drop-dir convention, default
`intake/source/`), `init.scaffold` (mechanical scaffold; `{name}` → the app name),
plus the `docs` block for status/backlog/context paths. Where a field is absent,
derive it from the repo and say so. Flags: `--deep` (survey fan-out),
`--name <app-name>`.

Everything here is analysis and docs until the final gate — **this skill writes no
product code.**

Inception accuracy is judgment-bound. Run the judgment steps — the disposition
map, every contested-subsystem comparison — with **extended thinking on the most
capable model available to the session**; if the session is on a lighter tier,
say so up front and recommend switching before the survey. `--deep` enumeration
fan-out may run on cheaper tiers per the kit's model-routing doctrine; the
verdicts stay with the frontier model. Never bucket from a skim.

## 1. Intake

- Resolve the source: the argument (path or git URL) → the `init.sourceDir` drop
  dir → ask for one (the only unconditional stop). Clone git URLs to a short
  filesystem path — deep temp paths break installs on path-length-limited
  platforms.
- The source is a **read-only reference**: never committed to the new repo's
  history (keep the drop dir gitignored), never edited. What gets committed is the
  analysis output — brief, migration map, regenerated docs.
- If the ask arrived as "merge the template into my app": say at intake that the
  mechanism is scaffold-plus-port — the original stays a read-only reference, the
  merged result is the port completing on the template foundation, and the parity
  contract is the written promise nothing is lost.
- **Best-effort boot:** try to run the original via its own README/scripts
  (containers if it ships them). Record the **reference grade** honestly —
  **live-local** (it runs here), **live-remote** (a deployed URL exists), or
  **static-only** (source inspection is all there is). The grade sets the parity
  evidence for every port row: side-by-side flow drives / deployed-URL comparison /
  checklist + verified-by-inspection, marked as such. Don't block on a codebase
  that won't boot — static-only is a grade, not a failure.
- Re-run safety: if the brief or migration map already exists, this is a
  resume/revision — diff and confirm scope with the user instead of starting over.
- **Scaffold guard:** identical to project-init's — if `init.scaffold` is defined,
  run it once the app name is known; confirm first unless the repo is an obviously
  fresh scaffold (a scaffold's doc-slim removes files), and substitute `{name}` as
  a **lowercase npm-safe slug**. Name still unknown → fold it into the question
  round and scaffold after.

## 2. Codebase survey (extended thinking)

Think hard and produce the **product inventory** — it doubles as the **parity
contract**: the enumerated list of every human-observable surface the port must
preserve. With `--deep`, fan out survey subagents per area and keep only
conclusions.

- **Routes & pages** — every route with its purpose, plus empty/error/loading
  states; **user flows**, signed-in and anonymous, end to end.
- **Data model** — entities, relationships, ownership; the **auth shape** (roles,
  tenancy, session behavior).
- **Integrations & env** — payments, email, analytics, search, storage, and the
  env vars that light them.
- **Design system as shipped** — extract the real tokens (palette, type scale,
  spacing, radii, shadows, breakpoints, layout patterns), not impressions; parity
  lives or dies on these.
- **Copy & locales** — enumerate the copy surface and bind it **verbatim by
  reference** to the named source files (the retained source is the contract's
  copy appendix — don't transcribe whole template trees into the map; spot-anchor
  the key strings); locale coverage.
- **Assets & SEO** — logos, fonts, images; meta/OG, sitemap, robots, structured
  data, redirects.
- **Agentic layer** — any agent setup the codebase carries: `.claude/` (skills,
  hooks, agents, settings), instruction files (`CLAUDE.md`, `AGENTS.md`,
  editor-agent rules), agent memory, custom dev scripts. These are investments,
  not clutter — enumerate them so §3 dispositions them instead of silently
  dropping them.

Separately record **quality signals** (tests, types, lint, vulnerabilities, dead
code) — they feed the disposition map, not the parity contract. Two get special
handling: **green tests are carried assets** (candidates to port as
characterization suites, not just signals), and the **dependency manifest is
snapshotted** — every carried dependency faces the adopting repo's dependency
policy at port time.

## 3. Disposition map

For each subsystem, an honest theirs-vs-template comparison into five buckets —
every row carries a *why*. Three rules govern the buckets:

- **The meaningful-improvement bar, two-tiered.** On the **product surface** —
  UI, flows, styles, copy, business logic, product features — keep-theirs is the
  default: a row leaves it only for a named, product-relevant improvement
  (correctness, security, accessibility, performance, maintenance burden,
  testability, operational rigor) written into its *why*, and a wash keeps
  theirs — churn is a cost. On the **foundation** — auth, DB layer, tooling, CI,
  security, observability — the presumption runs the other way: the scaffold
  already wires the template's, so *keeping theirs* is the churn, and it takes
  the same named why to unpick it. "The template has one" is never a why on
  either tier.
- **No wash by ignorance.** A wash verdict exists only on top of a recorded
  contested-subsystem comparison; at a weak reference grade, say what could not
  be verified instead of calling it equal.
- **Contested subsystems get a real comparison.** Where both sides implement the
  same concern (their auth vs the template's, their form stack vs the
  template's), compare tech choices *and implementation details* on the axes
  above before bucketing, and record the verdict — with what was actually
  inspected — in the migration map. The comparison is a deliverable, not an
  impression.

The buckets:

- **port-onto-template** — surfaces that must be **rebuilt** to run on this
  foundation: stack-incompatible UI, flows, copy, or transplants that a hard
  rule of the adopting repo forces into structural change (that rule is the
  row's why) — rebuilt on template idioms, pixel-faithful to the parity
  contract. Rebuilding what could transplant intact needs its own why under the
  bar.
- **replace-with-template** — foundation subsystems under the template
  presumption above; the row still names the concrete gap the swap closes, and
  names what the user visibly keeps (their data, their flows) so "replace"
  never reads as "lose".
- **keep-theirs** — the product-surface default: genuinely better, equivalent
  (a recorded wash), or load-bearing custom logic the template can't express —
  **transplanted intact** into template structure. "Intact" is bounded by the
  adopting repo's gates **and stated hard rules** (the CI gate plus the
  non-CI-enforced rules its onboarding doc carries): mechanical conformance is
  part of the transplant; a hard rule forcing structural change moves the row
  to port-onto-template with that rule as its why. Framework-agnostic material
  — business logic, schemas, algorithms, styles/tokens, copy — transplants most
  honestly. A keep-theirs row kept because it **beat** a template equivalent is
  an upstream-lesson candidate for the template.
- **light-up** — template features the original lacks that clear the bar for
  this product; everything else stays dark (graceful degradation is the
  default, not a removal task).
- **drop** — dead code, with the evidence that it's dead.

**The agentic layer gets disposition rows too.** Every incoming skill, hook,
agent, instruction file, and memory store from §2's survey lands in the same
buckets; the merged project ships the **union** of the template's agentic layer
and the survivors (collisions resolved by the same bar), and a dropped agentic
asset needs the same evidence as dropped code.

## 4. Data & users reality check

Does the original run in production with real users? Then the port needs a
migration plan: schema/data path, **auth migration** (password-hash import into
the template's auth vs a forced reset — say which the hashes allow), stored
files/objects, and the cutover story (DNS, redirects, downtime tolerance). No
production deployment → say so; the port is data-free and this section closes in
one line.

## 5. One batched question round

Same convention as project-init: every open decision becomes a clarifying question
with 2–4 concrete options and a recommendation, batched into **one round** — one
presentation moment; where the asking UI caps questions per prompt, consecutive
sets within that moment still count as the one round. Cover
at minimum: the app name (if unknown), every ambiguous disposition, which light-up
features to enable, the data/user migration reality, the port cut-line (everything
vs core-flows-first), and the parity-evidence expectation wherever the reference
grade is weak. Skipped answers → adopt the recommendation and **mark it as an
assumption**; smaller calls resolved by recommendation without being asked get the
same marking in the brief's decision log. One round; a wrong assumption gets
caught at the sign-off gate.

## 6. Converge: the brief + the migration map

Two durable docs, both registered in the repo's context-doc index (append
shape-matched rows; older template copies pre-seed a commented placeholder row —
uncomment it where present):

- **Product brief** (`init.productBrief`) — the same shape project-init produces:
  vision, problem, users (observed, not aspirational — restate what the product
  *is* before what it could become), the converged feature set incl. accepted
  light-ups and explicit out-of-scope, **feature groups + the bar** a future
  `project-audit` scores /100, and the decision log with marked assumptions.
- **Migration map** (`init.migrationMap`) — the port's operating document: the
  disposition table (with whys and, for contested subsystems, the recorded
  tech-choice comparison verdicts), the **parity contract** as a checkable list,
  the reference grade and what counts as parity evidence per grade, the
  data/user plan, and port-specific decisions.

## 7. Mend the docs & regenerate the living docs

- Context-doc sweep (adapter `docs.contextDir`): integrations going dark → point
  at the template's removal checklists; keep-theirs divergences → note them in the
  relevant context doc; template defects surfaced by the comparison → an
  **Upstream candidates** section in the regenerated backlog, each row a
  ready-to-file issue/PR. The adopted project never blocks on upstream.
- **Status doc** (adapter `docs.status`): product identity + links to brief and
  migration map, the integration on/off map, state = "adoption inception complete
  — awaiting sign-off".
- **Backlog** (adapter `docs.backlog`): forward-only, banded. **B1 opens with the
  port walking skeleton** — scaffold + the extracted design tokens + one core page,
  parity-verified against the original. **Immediately behind it, the parity
  contract becomes a test plan**: stand up the adopting repo's test harness and
  enumerate the contract into a one-to-one **pending-spec map** — a
  skipped/`fixme` e2e spec per contract row, behavior named, selectors left to
  the row that builds the surface. Then flow-by-flow port rows, each naming its
  parity evidence per the reference grade **and landing with its tests** — a row
  flips its pending specs live and ports its carried green suites alongside its
  code; a row that ships functionality without them isn't done. Light-up and
  enhancement rows band behind parity. Completing the backlog *is* surface
  parity — **zero pending parity specs, the full gate and test suites green at
  the adopting repo's enforced thresholds** — plus the 100 score; close with the
  Upstream candidates section.

## 8. Sign-off gate → the pipeline begins

Present the whole thing — **opening in plain language: what stays yours, what
each replacement buys (its named improvement), what lights up, what's dropped
and why** — then the inventory summary, the disposition map, the migration
plan's shape, the top B1 rows — and **wait for explicit sign-off** (plan →
sign-off → build). On sign-off, commit the inception output (scaffold + brief +
migration map + doc mends + regenerated docs; adapter `commit` style) so the
pipeline starts from a clean tree, then enter the lifecycle pipeline at the first
B1 row — with the parity check as the standing live-verify mode for every port
row. On rejection, fold the feedback into the brief and map and re-present — one
more round, not a failure.
