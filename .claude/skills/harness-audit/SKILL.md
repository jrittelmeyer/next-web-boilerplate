---
name: harness-audit
description: Audit a project's agent harness — skills, hooks, context, MCP servers, permissions, packaging — against the current ecosystem: re-fetch pinned specs, run dated searches, diff, emit a scored report + backlog rows. Use for a quarterly pass, after major harness releases, or when asked if the setup is current.
---

# harness-audit

The agent harness rots like any other dependency surface: authoring standards
evolve, harness events and packaging channels ship, better tools appear, and
yesterday's best practice quietly becomes debt. This skill is the periodic
currency pass — it audits the *agentic layer* the way `project-audit` audits
the product and `doc-audit` audits the docs.

Adapter: `.claude/ai-dev-kit.config.json` (`docs.archiveDir`, `docs.backlog`,
`projectType`); missing fields → derive from the repo and say so. Take
**today's date from the environment, never from memory**, and use extended
thinking — this is a judgment pass. Report-only: implementation stays behind
the sign-off gate.

## 1. Inventory the local surface

Run `scripts/inventory.mjs` first (`node .claude/skills/harness-audit/scripts/inventory.mjs [projectRoot]`
from the consumer's project root) — it measures per-skill
description chars/≈tokens, body ≈tokens, and references/scripts files, plus
every wired hook event/matcher/handler, straight from the working tree
(zero-dep, no network, report-only). Layer judgment on top rather than
hand-counting:

- Skills: the script's table, plus version (from the kit stamp or
  frontmatter) and a cost split of **always-loaded vs on-demand**.
- Hooks: the script's table, plus wiring form and handler runtimes.
- Instruction files: `AGENTS.md` / `CLAUDE.md` (root + leaves), their sizes.
- Connected tool servers (MCP config), permissions/allowlists in settings,
  subagent and command definitions, packaging (installer, plugin manifest),
  and the CI gates that police any of it.

## 2. Refresh the authorities

Read [references/sources.md](references/sources.md) — each row names what it
governs, its URL, how it was last verified, and when. **Re-fetch every row.**
A moved or dead source → find its successor and update the row *as part of
this run* (the skill repairs its own inputs). No network access → run the
mechanical steps only and stamp the report **PARTIAL** — never fabricate
ecosystem findings.

## 3. Current-dated open sweep

Web-search by **category, never by remembered product name**, embedding
today's date/quarter in the queries: skill/agent authoring guidance · the
harness's changelog since the previous audit · cross-tool instruction-file
standards · tool servers relevant to this `projectType` · distribution/
packaging channels · named emerging workflow patterns. Findings verify and
update [references/stack.md](references/stack.md) — the dated
recommended-stack file this skill maintains; tool names live there and in
reports, never in this body.

## 4. Rubric diff

Run the project's mechanical skill linter and eval runner first where they
exist, and don't re-litigate what they enforce. Then score the judgment layer
against the refreshed authorities:

- Description quality (what + when, third person, trigger phrases) and the
  always-loaded token budget.
- Disclosure structure: body size vs references/ split; scripts where
  determinism beats prose ("solve, don't defer").
- Eval presence: do nontrivial skills have testable scenarios anywhere? Where
  an eval harness exists, run its graded pass and score the behaviors it
  surfaces, not merely the fixtures' existence.
- Hook coverage: events used vs events the harness currently offers, each
  unused event a recorded accept/reject, guardrail vs noise balance.
- Tool-server leanness: each connected server's context cost vs observed use.
- Permissions: least-privilege shape, dead entries, undocumented broad grants.
- Packaging currency: how the harness ecosystem distributes this kind of
  surface today vs how this project does — skipped (not scored from memory)
  when step 2 stamped the run PARTIAL for no network access.

## 5. Report

Write `HARNESS_AUDIT_<YYYY-MM-DD>.md` into the adapter's `docs.archiveDir`:
per-area scores /100 with named deductions, the delta vs the previous
harness-audit report (diff-bounded like project-audit), every source with its
fetch date, and — decision-log style — explicit **"no change needed"**
verdicts so rejected modernizations aren't re-proposed next run.

## 6. Proposed rows + sign-off gate

Turn every deduction into a proposed forward-only backlog row (band by value,
following the repo's convention); update `sources.md` last-verified dates;
then **stop for sign-off** — this skill never implements its findings.

## Degrees of freedom

- Depth: a quick currency check (steps 1–2 + changelog scan) vs the full
  pass; say which ran.
- Scope filter on request: skills-only · hooks-only · tool-servers-only.
- **Self-staleness check:** if every `sources.md` row is more than two
  quarters old, the first finding of the run is this skill's own staleness.
