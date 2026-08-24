# The seven hunts — mechanics and fix patterns

## Contents
- Hunt 1 · Code↔doc drift
- Hunt 2 · Duplication / bloat
- Hunt 3 · Archivable / irrelevant content
- Hunt 4 · Backlog gaps
- Hunt 5 · Currency & status drift
- Hunt 6 · Showcase-doc lag
- Hunt 7 · Standing-instruction budget & placement
- Execute-phase fix patterns

## Hunt 1 · Code↔doc drift

List the doc claims most likely to rot: file/function/flag names, config
values, env vars, schema shapes, command names, route/endpoint lists, version
pins, "we do X" architectural claims. **Spot-check the drift-prone ones against
the actual code** (grep/read it — don't trust the doc). Record each confirmed
mismatch as drift.

## Hunt 2 · Duplication / bloat

The same fact stated in multiple files; a per-step "append-log" that has
regrown inside a status file **or a persistent-memory file**; a backlog that
re-describes already-shipped work; a memory file duplicating a living doc.
Flag the worst offenders on the hot path.

## Hunt 3 · Archivable / irrelevant content

Completed plans, superseded audits, finished migrations, history that isn't
normal task context — candidates to move to an archive (never delete — see the
preserve principle).

## Hunt 4 · Backlog gaps

Things the codebase lacks that aren't tracked: scattered `TODO`s,
known-but-unfiled issues, "deferred" notes. Candidates to add to the backlog.

## Hunt 5 · Currency & status drift

Claims that rot with **zero repo changes**: "current / latest / the <year>
default", "blocked on upstream X", "maintenance-only", external links, version
claims. Spot-check the decision-gating ones (did the upstream gate lift? did a
major ship?). For outward-facing docs, verify the *runnable* claims too —
quickstart commands against the real scripts, badges, links.

## Hunt 6 · Showcase-doc lag

Find the set's "Current as of" stamp (or file mtimes) and run
`git log --oneline --since=<then>` — every feature shipped since is a candidate
gap. Spot-check the **numeric and superlative claims** (counts, quality scores,
"N of 100", version numbers, "the only X that…") — those rot with every
release. For an HTML deck, grep the headings/stat markup for claims rather
than reading the whole file.

## Hunt 7 · Standing-instruction budget & placement

Measure the always-loaded set (tokens ≈ chars/4): the agent-onboarding file
(`AGENTS.md`), tool-specific files (`CLAUDE.md` and kin), the memory index,
and skill descriptions. Check against the project's budgets (adapter
`contextBudget` where present; defaults: onboarding file ~150 lines; memory
index ~700 tokens with ~120-char one-line hooks; a context doc above ~3,000
tokens is a split-candidate; a memory file above ~1,500 likewise). Budgets are
heuristics — flag-and-recommend, never churn a stable file to chase a number.

Then check *placement*, which matters as much as size:

- **Prime directive:** flag always-loaded lines the agent could infer from the
  repo itself — file trees, script lists the manifest already carries, stack
  tables duplicated from a README.
- **Thin pointers:** tool-specific files should import the onboarding doc and
  carry only genuinely tool-specific config — flag re-catalogs of content the
  harness already indexes (e.g. skill descriptions).
- **Cache stability:** flag volatile facts — dates, audit scores, deadlines,
  version litanies — in always-loaded files. They invalidate the prompt-cache
  prefix on every edit and are stale by construction; they belong in the
  status doc, pointed at rather than pasted.
- **Leaf files:** audit any leaf `AGENTS.md` for drift against its owning
  context doc (a stale leaf is worse than none) and note high-traffic packages
  with sharp package-local rules that lack one.
- **Load-when precision:** every context doc gets exactly one trigger-shaped
  row in the onboarding doc's index; flag rows that fire on everything
  ("writing any code") or span too many topics to load selectively.

## Execute-phase fix patterns

- **Hot-path slimming:** remove duplicated prose; keep a compact, scannable
  one-line-per-item record; move the verbose detail **verbatim** into an
  archive/history file; refresh any index / doc-map files so they still
  describe reality.
- **Budget & placement:** relocate volatile status facts to the status doc;
  split an oversized context doc along its heading seams into a per-topic
  directory, leaving the original as a thin index/redirect so inbound links
  keep resolving; trim tool-specific files back to thin pointers; restate the
  write-time rule (budgets + "one clause on an existing line, not a new
  paragraph") in the memory index header so prevention outlives the pass.
- **Showcase refresh, in-register:** fold newly shipped work into the right
  chapter/slide in the doc's own voice — a plain-English guide defines every
  term at first use and never leaks jargon; a deck updates its numbers
  everywhere they appear (prose, stat blocks, the closing pitch). Keep HTML
  edits surgical. Then **stamp the set** ("Current as of <date>, commit
  <short-sha>") so the next audit diffs cheaply from that point.
- **Memory repair:** collapse per-step changelogs into a short high-level
  pointer that defers to the living docs; keep only durable, non-derivable
  facts; delete ones now wrong; fix cross-links; preserve frontmatter; one
  fact per file; convert relative dates to absolute.
