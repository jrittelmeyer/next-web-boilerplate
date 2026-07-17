---
name: doc-audit
description: >-
  Audit and optimize a project's documentation, agent-context files, persistent memory,
  and showcase docs (pitch decks, plain-English guides, slide decks) for agent accuracy
  and token efficiency. Finds code↔doc drift (claims that no longer match the code),
  culls duplication/bloat on the agent hot path, archives stale detail without losing
  it, slims persistent memory, keeps human-narrative showcase docs — including
  local-only/gitignored ones — current with shipped work, and surfaces undocumented
  backlog gaps. Use when asked to review/clean up docs, context, or memory — or as a
  periodic maintenance pass to keep them lean and accurate. Plan → sign-off → build
  (sign-off may be pre-authorized by the invoking request).
---

# Documentation / Context / Memory Audit

A periodic, sign-off-gated pass that keeps a project's docs, agent-context files,
persistent memory, and showcase docs **accurate** and **token-efficient**. Use extended
thinking — this is an analysis task before it's an editing task.

## Operating principles (the "why")

- **Optimize the hot path first.** The most expensive tokens are in files the agent
  loads *every turn* (`CLAUDE.md`/`AGENTS.md`, the memory index) or *every resume* (a
  status/handoff file). Slimming those beats slimming an on-demand reference doc.
  Triage every file by load frequency: always-loaded → on-resume → on-demand → archival.
- **Spend audit tokens the same way.** Read hot-path files fully; spot-check on-demand
  files against their drift-prone claims; review archives at index level only. Reuse
  the project's own doc map (a docs README, a memory doc-map file) instead of
  re-deriving the landscape. Verify with the cheapest sufficient probe — grep for the
  symbol instead of reading the file; query the registry for a version instead of a
  changelog.
- **Accuracy beats completeness.** A doc that contradicts the code actively misleads
  the agent. Never trust a doc's claim about code; verify it against source.
- **Preserve, don't destroy.** Cull verbose detail by *moving* it to an
  archive/history file, and record in the archive's index what was preserved where.
  Keep a compact one-line-per-item record in the hot-path file; the prose lives in the
  archive.
- **One source of truth.** If two files state the same fact, the hot-path file
  *defers* (links) to the authoritative one instead of duplicating it.
- **Respect the project's cadence.** Follow documented working agreements (plan →
  sign-off → build, verify-by-running). Default: present findings + plan, get
  sign-off, then execute. If the invoking request already authorized the full pass
  end-to-end (or the session is non-interactive), proceed — and record in the final
  report the decisions a sign-off would have covered.
- **Measure.** Quantify the savings (word counts before → after; tokens ≈ words ×
  1.35) so the win is concrete.

## Process

### 1 — Discover & read

- Map the landscape: `README`, `CLAUDE.md`/`AGENTS.md`, everything under `docs/**`,
  any status / handoff / backlog / changelog / decision-log files, and the agent
  **memory** directory + its index.
- **Hunt for local-only docs.** Check `.gitignore` and `.git/info/exclude` for
  doc-shaped exclusions (a private explainer directory, a pitch deck, an internal
  guide) and check the project's memory for designated doc sets. These never appear
  in `git status`, so they are the easiest to forget and the fastest to rot.
- Classify each file by **load frequency** (always / on-resume / on-demand /
  archival) and by **audience**:
  - **agent-facing** — context the agent loads to do work;
  - **outward-facing** — README, quickstart, contributing: read by human adopters at
    the moment of adoption, where a wrong claim costs trust, not just tokens;
  - **showcase** — pitch decks, plain-English guides, slide decks: persuasion and
    comprehension docs for non-technical readers, often local-only.
- Read at the tiered depth above. Don't skim the hot path — you can't spot
  duplication or drift you haven't read.

### 2 — Analyze (change nothing yet)

Hunt for six things:

1. **Code↔doc drift.** List the doc claims most likely to rot: file/function/flag
   names, config values, env vars, schema shapes, command names, route/endpoint
   lists, version pins, "we do X" architectural claims. **Spot-check the drift-prone
   ones against the actual code** (grep/read it — don't trust the doc). Record each
   confirmed mismatch.
2. **Duplication / bloat.** The same fact stated in multiple files; a per-step
   "append-log" that has regrown inside a status file **or a persistent-memory
   file**; a backlog that re-describes already-shipped work; a memory file that
   duplicates a living doc. Flag the worst offenders on the hot path.
3. **Archivable / irrelevant content.** Completed plans, superseded audits, finished
   migrations, history that isn't normal task context — candidates to move to an
   archive.
4. **Backlog gaps.** Things the codebase lacks that aren't tracked: scattered
   `TODO`s, known-but-unfiled issues, "deferred" notes. Candidates to add to the
   backlog.
5. **Currency & status drift.** Claims that rot with **zero repo changes**:
   "current / latest / the <year> default", "blocked on upstream X",
   "maintenance-only / feature-complete", external links, version claims. Spot-check
   the decision-gating ones (did the upstream gate lift? did a major ship?). For
   outward-facing docs, verify the *runnable* claims too — quickstart commands
   against the real scripts, badges, links.
6. **Showcase-doc lag.** Find the set's "Current as of" stamp (or file mtimes) and
   run `git log --oneline --since=<then>` — every feature shipped since is a
   candidate gap. Spot-check the **numeric and superlative claims** (counts, quality
   scores, "N of 100", version numbers, "the only starter that…") — those rot with
   every release. For an HTML deck, grep the headings/stat markup for claims rather
   than reading the whole file.

Litmus tests:
- *"Would an agent that loaded only this file be misled?"* → drift, or it needs a
  pointer.
- *"Is this fact already derivable from the code, git history, or CLAUDE.md?"* → it
  probably shouldn't be repeated in docs or stored in memory.
- *"If two files disagree, which is authoritative?"* → that one stays; the other
  defers to it.

### 3 — Plan + sign-off

Present findings grouped (drift / bloat / archive / backlog / showcase), each with a
**concrete fix** and a recommendation. Use a question prompt for the genuine
decisions only, e.g. how aggressively to slim, whether to add each proposed backlog
item, archive vs delete for borderline content. Wait for sign-off before editing —
unless the run was pre-authorized (see principles), in which case take the
recommended option and say so in the report.

### 4 — Execute

- **Fix drift first** — point every stale claim at what the code actually does.
- **Slim hot-path files** — remove duplicated prose; keep a compact, scannable
  record (one line per item); move the verbose detail **verbatim** into an
  archive/history file. Then refresh any index / map / "where docs live" files so
  they still describe reality.
- **Add the agreed backlog items.**
- **Refresh showcase docs in-register.** Fold newly shipped work into the right
  chapter/slide in the doc's own voice: a plain-English guide defines every term at
  first use and never leaks jargon from the technical docs; a deck updates its
  numbers everywhere they appear (prose, stat blocks, the closing pitch). Keep HTML
  edits surgical. Then **stamp the set** ("Current as of <date>, commit
  <short-sha>") so the next audit can diff cheaply from that point.
- **Repair memory** — collapse per-step changelogs into a short high-level pointer
  that defers to the living docs; keep only durable, non-derivable facts; delete
  ones that are now wrong; fix cross-links. Preserve each file's frontmatter; keep
  one fact per file; convert relative dates to absolute.

### 5 — Verify

- Confirm internal links/anchors resolve (the targets exist; heading anchors match).
- Confirm the change scope is exactly what you intended (`git status`); no code
  touched unless intended. **Local-only files never show there** — re-list the ones
  you touched and confirm content/mtime directly.
- Report the measured savings (before → after) and the showcase claims you updated.
- If anything code-adjacent changed, run the project's gate (lint · type-check ·
  build). Markdown is usually outside the lint gate — the link/scope/measurement
  checks above are the real verification.
- **Commit/push only when asked**, following the repo's branching convention.
  Local-only showcase docs are saved, never committed.

## Notes & gotchas

- **Agent memory lives outside the repo** (typically
  `~/.claude/projects/<project-slug>/memory/` with a `MEMORY.md` index). It is
  **not** in git — edit it directly; it won't appear in `git status`. The index is
  loaded every session; individual files are recalled on relevance, so the index
  line and each file's `description` must stay accurate.
- **The biggest recurring win** is a status/handoff file — or a persistent-memory
  file — that has quietly regrown a verbose per-step log. The fix pattern: keep a
  compact build-progress table as the record, move the prose into the history
  archive, and (re)state the rule "don't reintroduce the append-log."
- **Dual-home rule:** this skill's canonical source lives in the ai-dev-kit
  (`ai-dev-kit/skills/doc-audit/`); the project copy (`.claude/skills/doc-audit/`)
  and the global copy (`~/.claude/skills/doc-audit/`) are both installer output —
  edit the kit source and re-run `node ai-dev-kit/install.mjs --global`, never edit
  the installed copies (`install.mjs --check` guards against drift). Project-specific
  designations — *which* files form the showcase set, where they live — belong in
  that project's memory, not in this file.
- **Never name a project's local-only docs inside committed files** (including the
  in-repo copy of this skill). The exclusion usually exists precisely to keep them
  out of a public repo; the project's memory carries the pointer.
