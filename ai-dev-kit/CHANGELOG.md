# ai-dev-kit changelog

## 0.4.2 — 2026-07-18

Trial follow-up: the template side of finding U2 shipped (a commented `PRODUCT.md`
placeholder row under the agent-onboarding context-doc table), and the skill now
uses it.

- `skills/project-init` (0.1.2): the register-the-brief step prefers the
  pre-seeded commented placeholder row — uncomment it (delete the wrapper lines)
  instead of authoring a row; appending a shape-matched row stays the fallback
  for repos without one.

## 0.4.1 — 2026-07-18

Live-trial mends (project-init program, step 3 — the full flow driven on a fresh
degit consumer copy; sample product "Potluck", a recipe-sharing SaaS).

- `skills/project-init` (0.1.1): the scaffold guard now requires `{name}` to be
  substituted as a **lowercase npm-safe slug** — the reference scaffold
  (`init-app`) silently skips its rename step on an invalid npm name, so an
  unslugged "Potluck" would have shipped un-renamed (trial finding).
- `skills/project-init` (0.1.1): sign-off now includes **committing the inception
  output** (adapter `commit` style) before the pipeline enters row 1 — the skill
  never said so, and a fresh adopter agent would have left the scaffold + docs
  uncommitted (trial finding).
- Adapter schema: `init.scaffold` description documents the slug requirement.
- Trial verdict, everything else green on the consumer copy: installer `--check`,
  intake re-run safety, fresh-scaffold guard, slim's removal contract, discovery →
  one batched round (a skipped answer correctly became a marked assumption) →
  brief → context-doc mends → regenerated status/backlog with walking-skeleton
  row 1 + Upstream candidates. Template-level findings (leftover-mention tidy,
  PRODUCT.md index placeholder) went to the template backlog, not the kit.

## 0.4.0 — 2026-07-18

The inception skill — the pipeline gains its one-time entry point (project-init
program, step 1 of 3).

- `skills/project-init/` — turns an idea into a signed-off build program: intake
  (plan docs and/or a raw idea) → mechanical scaffold (adapter `init.scaffold`,
  confirm-gated because doc-slim removes files) → extended-thinking discovery (gap
  analysis; value-add candidates split *free-in-template* vs *new build*;
  competitive landscape scan, `--deep` fans out subagents; template fit-map) → one
  batched clarifying-question round (skipped answers become marked assumptions) →
  product brief at adapter `init.productBrief` carrying the product-specific
  feature groups + bar that future `project-audit` passes score against →
  context-doc mends with template-level gaps logged as backlog "Upstream
  candidates" → regenerated status doc + banded backlog whose completion is the
  100 score → plan sign-off → the lifecycle pipeline starts at row 1. Writes no
  product code.
- Adapter contract gains an optional `init` block (`scaffold` with `{name}`
  substitution, `productBrief`).
- Reviewed and deliberately NOT hook-automated: a post-scaffold nudge belongs in
  the template's getting-started text, not machinery.
- `docs/PLAYBOOK.md` gains technique 10 — **inception discipline** (restate first,
  honest value-add split, date-stamped competitive claims, marked assumptions,
  walking-skeleton row 1); the deck adds the seventh skill card + the inception
  pipeline stage and re-stamps at 0.4.0.

## 0.3.0 — 2026-07-17

Step 3: playbook + catalog deck. The program's three steps are complete.

- `docs/PLAYBOOK.md` — the why-layer: nine non-skill techniques (pipeline,
  plan-gate, context tiers, memory discipline, cheapest-sufficient-probe, fan-out
  research, archive pattern, resume prompts, automation review), each with
  what/why/practice/automation/composes-with, pointing into skills rather than
  duplicating them.
- `docs/pitch-deck.html` — self-contained catalog/pitch deck (no external assets,
  light/dark token theming): the pipeline, six skill cards with auto-trigger chips,
  the hooks + advise-never-block policy, playbook at a glance, the adapter/install
  story, and the roadmap.
- manifest gains a `docs` section.

## 0.2.0 — 2026-07-17

Step 2: automation hooks. All hooks **advise, never block** — they inject context;
the agent decides.

- `hooks/` — three cross-platform Node handlers, installed to
  `.claude/hooks/ai-dev-kit/` (drift-guarded like skills):
  - `dep-check-nudge.mjs` (PostToolUse: Edit|Write|Bash) — fires on package.json
    edits and package-manager add/update/install-with-args commands.
  - `live-verify-reminder.mjs` (PreToolUse: Bash, `if: "Bash(git *)"`) — fires
    before any `git commit` (compound commands included).
  - `skill-drift-guard.mjs` (PostToolUse: Edit|Write) — fires on direct edits to
    `.claude/skills/` or `.claude/hooks/` (installer output; edit the kit instead).
- `hooks/hooks.json` — the settings snippet; `install.mjs --hooks` merges it
  idempotently into `.claude/settings.json`, replacing only kit-owned entries
  (identified by the handler-path marker).
- Reviewed and deliberately NOT hook-automated: a Stop-hook checkpoint nag and a
  tidy/cache hook (standing cadence + husky pre-push already cover them; a nag
  would be noise).

## 0.1.0 — 2026-07-17

Initial extraction from next-web-boilerplate.

- Skills: `checkpoint`, `doc-audit` (dual-home), `project-audit`, `tidy` — generalized
  from the repo-specific originals (behavior preserved; mechanical params moved to the
  adapter config). New: `dep-check`, `live-verify`.
- Cross-platform installer (`install.mjs`): copy, `--check` drift guard, `--global`
  dual-home sync, `--adapter` config install. Pure Node fs, no symlinks, idempotent.
- Adapter contract: `adapters/project.schema.json`; reference adapter for
  next-web-boilerplate.
- Not yet: automation hooks (Step 2), playbook + pitch deck (Step 3).
