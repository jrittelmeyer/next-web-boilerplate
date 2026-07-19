---
name: project-adopt
description: Adopt an existing codebase onto this template — survey the app end-to-end into a parity contract (routes, flows, data, auth, design tokens, copy, SEO), build an honest theirs-vs-template disposition map, converge on a product brief + migration map, and regenerate the living docs into a port program whose completion is a surface-identical app on the template foundation with the relevant template features lit up. Use when the user has an existing app or site to migrate onto the template, says "adopt this codebase" / "port my app to this boilerplate", or drops source code into the intake dir.
---

# project-adopt

The one-time inception pass for a product that **already exists as code** — the
brownfield sibling of `project-init`. Input: an existing codebase (a path, a git
URL, or the drop dir). Output: a product brief reverse-engineered from the observed
product, a **migration map** carrying the parity contract and disposition table, and
a regenerated status doc + banded backlog whose completion is *a surface-identical
app on the template foundation, with the relevant template features baked in* — then
the lifecycle pipeline begins at row 1.

Project parameters come from the adapter config `.claude/ai-dev-kit.config.json`:
`init.productBrief` (default `docs/PRODUCT.md`), `init.migrationMap` (default
`docs/MIGRATION.md`), `init.sourceDir` (drop-dir convention, default
`intake/source/`), `init.scaffold` (mechanical scaffold; `{name}` → the app name),
plus the `docs` block for status/backlog/context paths. Where a field is absent,
derive it from the repo and say so. Flags: `--deep` (survey fan-out),
`--name <app-name>`.

Everything here is analysis and docs until the final gate — **this skill writes no
product code.**

## 1. Intake

- Resolve the source: the argument (path or git URL) → the `init.sourceDir` drop
  dir → ask for one (the only unconditional stop). Clone git URLs to a short
  filesystem path — deep temp paths break installs on path-length-limited
  platforms.
- The source is a **read-only reference**: never committed to the new repo's
  history (keep the drop dir gitignored), never edited. What gets committed is the
  analysis output — brief, migration map, regenerated docs.
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

Separately record **quality signals** (tests, types, lint, vulnerabilities, dead
code) — they feed the disposition map, not the parity contract.

## 3. Disposition map

For each subsystem, an honest theirs-vs-template comparison into five buckets —
every row carries a *why*; "the template is expected to win" is a prior, not a
rule:

- **port-onto-template** — UI, flows, copy: rebuilt on template idioms,
  pixel-faithful to the parity contract.
- **replace-with-template** — infra where the template's rigor wins (auth, DB
  layer, tooling, CI, security, observability); name what the user visibly keeps
  (their data, their flows) so "replace" never reads as "lose".
- **keep-theirs** — genuinely better, or load-bearing custom logic the template
  can't express: ported intact into template structure. Each keep-theirs row is
  also an upstream-lesson candidate for the template.
- **light-up** — template features the original lacks that fit the product;
  everything else stays dark (graceful degradation is the default, not a removal
  task).
- **drop** — dead code, with the evidence that it's dead.

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

Two durable docs, both registered in the repo's context-doc index (uncomment the
pre-seeded placeholder row where the template provides one; append a shape-matched
row otherwise):

- **Product brief** (`init.productBrief`) — the same shape project-init produces:
  vision, problem, users (observed, not aspirational — restate what the product
  *is* before what it could become), the converged feature set incl. accepted
  light-ups and explicit out-of-scope, **feature groups + the bar** a future
  `project-audit` scores /100, and the decision log with marked assumptions.
- **Migration map** (`init.migrationMap`) — the port's operating document: the
  disposition table (with whys), the **parity contract** as a checkable list, the
  reference grade and what counts as parity evidence per grade, the data/user
  plan, and port-specific decisions.

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
  parity-verified against the original. Then flow-by-flow port rows, each naming
  its parity evidence per the reference grade; light-up and enhancement rows band
  behind parity. Completing the backlog *is* surface parity plus the 100 score;
  close with the Upstream candidates section.

## 8. Sign-off gate → the pipeline begins

Present the whole thing — inventory summary, the disposition map, the migration
plan's shape, the top B1 rows — and **wait for explicit sign-off** (plan →
sign-off → build). On sign-off, commit the inception output (scaffold + brief +
migration map + doc mends + regenerated docs; adapter `commit` style) so the
pipeline starts from a clean tree, then enter the lifecycle pipeline at the first
B1 row — with the parity check as the standing live-verify mode for every port
row. On rejection, fold the feedback into the brief and map and re-present — one
more round, not a failure.
