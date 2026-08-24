---
name: doc-audit
description: >-
  Audit and optimize a project's documentation, agent-context files, persistent
  memory, and showcase docs for accuracy and token efficiency — code↔doc drift,
  duplication, archiving, memory slimming, showcase currency, standing-instruction
  budgets. Use when asked to review/clean up docs, context, or memory — or as a
  periodic maintenance pass to keep them lean and accurate.
---

# Documentation / Context / Memory Audit

A periodic, sign-off-gated pass that keeps a project's docs, agent-context files,
persistent memory, and showcase docs **accurate** and **token-efficient**. Use
extended thinking — this is an analysis task before it's an editing task.

## Operating principles (the "why")

- **Optimize the hot path first.** The most expensive tokens are in files the
  agent loads *every turn* (`CLAUDE.md`/`AGENTS.md`, the memory index) or *every
  resume* (a status/handoff file). Slimming those beats slimming an on-demand
  reference doc. Triage every file by load frequency: always-loaded → on-resume
  → on-demand → archival.
- **Spend audit tokens the same way.** Read hot-path files fully; spot-check
  on-demand files against their drift-prone claims; review archives at index
  level only. Reuse the project's own doc map instead of re-deriving the
  landscape. Verify with the cheapest sufficient probe — grep for the symbol
  instead of reading the file; query the registry instead of a changelog.
- **Accuracy beats completeness.** A doc that contradicts the code actively
  misleads the agent. Never trust a doc's claim about code; verify it against
  source.
- **Preserve, don't destroy.** Cull verbose detail by *moving* it to an
  archive/history file and recording in the archive's index what was preserved
  where. The hot-path file keeps a compact one-line-per-item record.
- **One source of truth.** If two files state the same fact, the hot-path file
  *defers* (links) to the authoritative one instead of duplicating it.
- **Respect the project's cadence.** Follow documented working agreements
  (plan → sign-off → build). Default: present findings + plan, get sign-off,
  then execute. If the invoking request pre-authorized the full pass (or the
  session is non-interactive), proceed — and record in the final report the
  decisions a sign-off would have covered.
- **Measure.** Quantify the savings (chars before → after; tokens ≈ chars/4)
  so the win is concrete.

## Process

### 1 — Discover & read

- Map the landscape: `README`, `CLAUDE.md`/`AGENTS.md` (including **leaf**
  copies in subdirectories — glob for them), everything under `docs/**`, any
  status / handoff / backlog / changelog / decision-log files, and the agent
  **memory** directory + its index.
- **Hunt for local-only docs.** Check `.gitignore` and `.git/info/exclude` for
  doc-shaped exclusions and check the project's memory for designated doc sets
  — these never appear in `git status`, so they rot fastest.
- Classify each file by **load frequency** (always / on-resume / on-demand /
  archival) and **audience** (agent-facing / outward-facing / showcase), then
  read at tiered depth — don't skim the hot path; you can't spot duplication
  or drift you haven't read.

### 2 — Analyze (change nothing yet)

Run the **seven hunts** — full mechanics, examples, and the
standing-instruction placement sub-rules live in
[references/hunts.md](references/hunts.md); read it before the pass:

1. **Code↔doc drift** — spot-check the rot-prone claims against source.
2. **Duplication / bloat** — the same fact in multiple files; regrown
   append-logs; backlogs re-describing shipped work.
3. **Archivable content** — completed plans, superseded audits, history.
4. **Backlog gaps** — untracked TODOs, known-but-unfiled issues.
5. **Currency & status drift** — claims that rot with zero repo changes;
   quickstart commands, badges, links, external gates.
6. **Showcase-doc lag** — stamp-vs-git-log diff; numeric/superlative claims.
7. **Standing-instruction budget & placement** — measure the always-loaded
   set against the adapter's `contextBudget` (defaults in hunts.md) and apply
   the placement rules (prime directive · thin pointers · cache stability ·
   leaf files · load-when precision).

Litmus tests: *"Would an agent that loaded only this file be misled?"* →
drift, or it needs a pointer. *"Is this fact derivable from the code, git
history, or the onboarding doc?"* → don't repeat it. *"If two files disagree,
which is authoritative?"* → that one stays; the other defers.

### 3 — Plan + sign-off

Present findings grouped (drift / bloat / archive / backlog / showcase), each
with a **concrete fix** and a recommendation. Ask about the genuine decisions
only (how aggressively to slim, archive vs delete for borderline content).
Wait for sign-off unless pre-authorized — then take the recommended option and
say so in the report.

### 4 — Execute

Fix drift first → slim hot-path files (move verbose detail **verbatim** to the
archive; refresh index/map files) → enforce budget & placement fixes → add the
agreed backlog items → refresh showcase docs in-register and stamp the set →
repair memory (collapse per-step changelogs into pointers; keep only durable
non-derivable facts; fix cross-links). Per-fix patterns are in hunts.md.

### 5 — Verify

- Internal links/anchors resolve; `git status` scope is exactly what you
  intended (local-only files never show there — re-list them directly).
- Report measured savings (before → after) and the showcase claims updated.
- Anything code-adjacent changed → run the project's gate. Markdown is usually
  outside it — the link/scope/measurement checks are the real verification.
- **Commit/push only when asked.** Local-only showcase docs are saved, never
  committed.

## Notes & gotchas

- **Budgets come from the adapter** — `.claude/ai-dev-kit.config.json` →
  `contextBudget` overrides the defaults in hunts.md; where absent, use the
  defaults and say so.
- **Agent memory lives outside the repo** (typically
  `~/.claude/projects/<project-slug>/memory/` with a `MEMORY.md` index). It is
  not in git — edit it directly; the index is loaded every session, so its
  lines and each file's `description` must stay accurate.
- **The biggest recurring win** is a status/handoff or memory file that has
  quietly regrown a verbose per-step log — keep a compact record, move prose
  to the archive, restate the "no append-log" rule where it'll be seen.
- **Dual-home rule:** this skill's canonical source is the ai-dev-kit repo's
  `skills/doc-audit/`; the project copy (`.claude/skills/doc-audit/`) and the
  global copy (`~/.claude/skills/doc-audit/`) are both installer output — edit
  kit source in a clone and re-run its installer per the kit README (installed
  versions: `.claude/ai-dev-kit.installed.json`), never edit the installed
  copies (`install.mjs --check` guards drift). Project-specific designations —
  *which* files form the showcase set, where they live — belong in that
  project's memory, not in this file.
- **Never name a project's local-only docs inside committed files** (including
  the in-repo copy of this skill) — the exclusion exists to keep them out of a
  public repo; the project's memory carries the pointer.
