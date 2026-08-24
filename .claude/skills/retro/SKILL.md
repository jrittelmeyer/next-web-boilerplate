---
name: retro
description: Harvest a finished milestone or painful session into durable harness improvements — corrections, surprises, and re-derived knowledge become candidate skill edits, hooks, adapter fields, or memory/instruction lines, each behind the normal sign-off gate. Use after a milestone, after repeated failed attempts, or on "retro" / "make sure this doesn't happen again".
---

# retro

A lesson that stays in the transcript is lost when the session ends; the
compounding move is writing it back into the surface the *next* session loads.
This skill closes that loop deliberately — after the work, not during it.

Adapter: `.claude/ai-dev-kit.config.json` (`docs` block); a missing field →
derive it from the repo and say so.

## 1. Collect the signals

Sweep the just-finished work for the four signal types — from the session
itself, the diff, and any review feedback:

- **Corrections** — places the user redirected you, or you redirected
  yourself after wasted work.
- **Surprises** — behavior that contradicted an assumption (an API, a build
  quirk, an environment fact) and cost time to discover.
- **Re-derivations** — knowledge rebuilt from scratch that some session had
  already learned (the strongest memory-candidate signal).
- **Repetitions** — any manual step performed 3+ times this program
  (automation candidate).

## 2. Route each lesson to its cheapest durable home

One lesson, one home — pick the *lightest* surface that reaches the next
session that needs it:

- **Project memory** — non-derivable project facts and recipes (ports,
  seeds, gotchas). Cheapest; no repo change.
- **Instruction file** (`AGENTS.md`/`CLAUDE.md`) — only rules every future
  session must hold; respect the budget (the context-economy skill polices
  it).
- **Adapter field** — a mechanical per-project parameter a skill should read
  instead of re-deriving.
- **Skill edit** — the procedure itself was wrong or incomplete (route to
  the skill's source repo when it's installed from a kit).
- **Hook candidate** — a reminder that must fire *at a moment* rather than
  be remembered; honor the project's automation policy (advise, never
  block) and record rejected hook ideas too.
- **Test/gate** — a failure class that verification should catch next time.
- **Drop** — one-off noise; say so, so it isn't re-proposed.

## 3. Propose, don't apply

Present the routed list — lesson · home · concrete edit — with effort marks.
Each accepted item enters the project's normal flow (plan → sign-off →
build, or a backlog row for later); memory-only items may apply immediately
after sign-off. Record explicit rejections wherever the project keeps its
decision log, so the same lesson isn't re-harvested next retro.
