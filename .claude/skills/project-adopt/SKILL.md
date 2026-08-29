---
name: project-adopt
description: Adopt an existing codebase onto a template foundation — survey it into a parity contract and theirs-vs-foundation map, converge a product brief + migration map, then regenerate docs into a port program. Use to adopt, port, or migrate onto a template, add features, or when source code lands in the intake dir.
---

# project-adopt

The one-time inception pass for a product that **already exists as code** — the
brownfield sibling of `project-init`. Input: an existing codebase (a path, a
git URL, or the drop dir). Output: a product brief reverse-engineered from the
observed product, a **migration map** carrying the parity contract and
disposition table, and a regenerated status doc + banded backlog whose
completion is *a surface-identical app on the target foundation — every
carried feature working, proven by the port's parity specs and carried suites
at the adopting repo's enforced thresholds — with the foundation features that
pass the meaningful-improvement bar (§3) baked in* — then the lifecycle
pipeline begins at row 1.

Adapter: `.claude/ai-dev-kit.config.json` (`init.productBrief` default
`docs/PRODUCT.md`, `init.migrationMap` default `docs/MIGRATION.md`,
`init.sourceDir` drop dir default `intake/source/`, `init.scaffold` — `{name}`
→ the app name, `docs` block); a missing field → derive it from the repo and
say so. Flags: `--deep` (survey fan-out), `--name <app-name>`. "The
foundation" below = the template/boilerplate the port lands on. **No
foundation heritage** (adopting into a plain scaffold or bare repo)? The
survey and parity contract run unchanged; in §3 the product surface defaults
keep-theirs as usual, replace-with/light-up buckets exist only where the
chosen stack actually ships a counterpart, and everything else becomes
port-onto rows against that stack.

Shared inception conventions (scaffold guard · question round · brief shape ·
doc registration · doc regeneration · sign-off gate):
[references/inception-shared.md](references/inception-shared.md) — read it
first; the steps below call into it.

Everything here is analysis and docs until the final gate — **this skill
writes no product code.**

Inception accuracy is judgment-bound. Run the judgment steps — the disposition
map, every contested-subsystem comparison — with **extended thinking on the
most capable model available to the session**; if the session is on a lighter
tier, say so up front and recommend switching before the survey. `--deep`
enumeration fan-out may run on cheaper tiers; the verdicts stay with the most
capable model. Never bucket from a skim.

## 1. Intake

- Resolve the source: the argument (path or git URL) → the `init.sourceDir`
  drop dir → ask for one (the only unconditional stop). Clone git URLs to a
  short filesystem path — deep temp paths break installs on
  path-length-limited platforms.
- The source is a **read-only reference**: never committed to the new repo's
  history (keep the drop dir gitignored), never edited. What gets committed is
  the analysis output — brief, migration map, regenerated docs.
- If the ask arrived as "merge the template into my app": say at intake that
  the mechanism is scaffold-plus-port — the original stays a read-only
  reference, the merged result is the port completing on the foundation, and
  the parity contract is the written promise nothing is lost.
- **Best-effort boot:** try to run the original via its own README/scripts
  (containers if it ships them). Record the **reference grade** honestly —
  **live-local** (it runs here), **live-remote** (a deployed URL exists), or
  **static-only** (source inspection is all there is). The grade sets the
  parity evidence for every port row: side-by-side flow drives / deployed-URL
  comparison / checklist + verified-by-inspection, marked as such. Don't block
  on a codebase that won't boot — static-only is a grade, not a failure.
- Re-run safety: if the brief or migration map already exists, this is a
  resume/revision — diff and confirm scope with the user instead of starting
  over.
- **Scaffold guard** — per the shared conventions.

## 2. Codebase survey (extended thinking)

Think hard and produce the **product inventory** — it doubles as the **parity
contract**: the enumerated list of every human-observable surface the port
must preserve. With `--deep`, fan out survey subagents per area and keep only
conclusions. Enumerate the surfaces the product actually has — for a web app:
routes/pages with empty/error/loading states and end-to-end user flows; for a
game: scenes/levels, the core loop, progression and save surface; for a
CLI/library: the command/API surface and documented examples — plus, in every
case:

- **Data model** — entities, relationships, ownership; the auth/identity
  shape where one exists (roles, tenancy, session behavior).
- **Integrations & env** — payments, email, analytics, search, storage,
  services, and the env vars that light them.
- **Design system as shipped** — extract the real tokens (palette, type
  scale, spacing, radii, shadows, breakpoints, layout patterns), not
  impressions; parity lives or dies on these.
- **Copy & locales** — enumerate the copy surface and bind it **verbatim by
  reference** to the named source files (the retained source is the
  contract's copy appendix — spot-anchor the key strings); locale coverage.
- **Assets & distribution surface** — logos, fonts, images, audio; for web:
  meta/OG, sitemap, robots, structured data, redirects; for apps/games:
  icons, store metadata, packaging config.
- **Agentic layer** — any agent setup the codebase carries: `.claude/`
  (skills, hooks, agents, settings), instruction files (`CLAUDE.md`,
  `AGENTS.md`, editor-agent rules), agent memory, custom dev scripts. These
  are investments, not clutter — enumerate them so §3 dispositions them
  instead of silently dropping them.

Separately record **quality signals** (tests, types, lint, vulnerabilities,
dead code) — they feed the disposition map, not the parity contract. Two get
special handling: **green tests are carried assets** (candidates to port as
characterization suites, not just signals), and the **dependency manifest is
snapshotted** — every carried dependency faces the adopting repo's dependency
policy at port time.

## 3. Disposition map

For each subsystem, an honest theirs-vs-foundation comparison into five
buckets — every row carries a *why*. Read
[references/disposition-map.md](references/disposition-map.md) **before
bucketing** — it carries the three governing rules (the two-tiered
meaningful-improvement bar · no wash by ignorance · contested subsystems get
a recorded comparison) and the full bucket semantics. In one line each:

- **port-onto-foundation** — must be rebuilt on foundation idioms,
  pixel-faithful to the parity contract.
- **replace-with-foundation** — foundation-tier subsystems under the
  presumption; the row names the concrete gap the swap closes.
- **keep-theirs** — the product-surface default; transplanted intact.
- **light-up** — foundation features that clear the bar; the rest stays dark.
- **drop** — dead code, with the evidence that it's dead.

**The agentic layer gets disposition rows too.** Every incoming skill, hook,
agent, instruction file, and memory store from §2's survey lands in the same
buckets; the merged project ships the **union** of the foundation's agentic
layer and the survivors (collisions resolved by the same bar), and a dropped
agentic asset needs the same evidence as dropped code.

## 4. Data & users reality check

Does the original run in production with real users? Then the port needs a
migration plan: schema/data path, **identity migration** (credential/hash
import into the foundation's auth vs a forced reset — say which the stored
hashes allow), stored files/objects, and the cutover story (DNS/redirects or
store/update-channel handover, downtime tolerance). No production deployment →
say so; the port is data-free and this section closes in one line.

## 5. One batched question round

Per the shared conventions. Cover at minimum: the app name (if unknown),
every ambiguous disposition, which light-up features to enable, the data/user
migration reality, the port cut-line (everything vs core-flows-first), and
the parity-evidence expectation wherever the reference grade is weak.

## 6. Converge: the brief + the migration map

Two durable docs, both registered in the context-doc index per the shared
conventions:

- **Product brief** (`init.productBrief`) — the shared brief shape, with
  users/vision **observed, not aspirational** — restate what the product *is*
  before what it could become.
- **Migration map** (`init.migrationMap`) — the port's operating document:
  the disposition table (with whys and, for contested subsystems, the
  recorded comparison verdicts), the **parity contract** as a checkable list,
  the reference grade and what counts as parity evidence per grade, the
  data/user plan, and port-specific decisions.

## 7. Mend the docs & regenerate the living docs

- Context-doc sweep (adapter `docs.contextDir`): integrations going dark →
  point at the foundation's removal checklists where it has them; keep-theirs
  divergences → note them in the relevant context doc; foundation defects
  surfaced by the comparison → an **Upstream candidates** section in the
  regenerated backlog, each row a ready-to-file issue/PR. The adopted project
  never blocks on upstream.
- Regenerate status + backlog per the shared conventions, with the
  port-specific shape: **B1 opens with the port walking skeleton** — scaffold
  + the extracted design tokens + one core surface, parity-verified against
  the original. **Immediately behind it, the parity contract becomes a test
  plan**: stand up the adopting repo's test harness and enumerate the
  contract into a one-to-one **pending-spec map** — a skipped/pending spec
  per contract row, behavior named, selectors/hooks left to the row that
  builds the surface. Then flow-by-flow port rows, each naming its parity
  evidence per the reference grade **and landing with its tests** — a row
  flips its pending specs live and ports its carried green suites alongside
  its code; a row that ships functionality without them isn't done. Light-up
  and enhancement rows band behind parity. Completing the backlog *is*
  surface parity — **zero pending parity specs, the full gate and test
  suites green at the adopting repo's enforced thresholds** — plus the 100
  score; close with the Upstream candidates section.

## 8. Sign-off gate → the pipeline begins

Before presenting: check every disposition-map row's evidence label
(side-by-side flow drive / deployed-URL comparison / checklist +
verified-by-inspection) actually matches the reference grade recorded at
intake (§1) — flag and correct any mismatch rather than presenting it as-is.
Then per the shared conventions — with the adopt-specific opening: present
**in plain language what stays yours, what each replacement buys (its named
improvement), what lights up, what's dropped and why**, then the inventory
summary, the disposition map, the migration plan's shape, and the top B1
rows. On sign-off the parity check becomes the standing live-verify mode for
every port row.
