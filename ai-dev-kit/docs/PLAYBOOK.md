# The ai-dev-kit playbook

The techniques that make agentic development efficient and effective but don't fit
inside a single skill. This is the **why-layer**: each entry says what the technique
is, why it pays, how to practice it, and whether it's automated. The *how* of the
mechanized ones lives in the skills (`../skills/`) and hooks (`../hooks/`) — this
document points, it doesn't duplicate.

Format per entry: **What · Why · Practice · Automation · Composes with.**

---

## 1. The lifecycle pipeline

**What.** Every unit of work runs the same loop:

```text
orient → plan-gate → [dep-check] → build → live-verify
      → code-review / simplify → checkpoint (→ tidy)
      → periodic: doc-audit · project-audit
```

**Why.** A fixed loop turns quality from a per-task negotiation into a default. Each
stage catches the failure class the previous one can't: the plan-gate catches wrong
direction, dep-check catches supply-chain surprises, live-verify catches
compiles-but-doesn't-work, checkpoint catches context exhaustion.

**Practice.** Enter the loop at orient (cheap context load: status doc + memory
index, not the whole repo). Exit only through a checkpoint. Skip a stage only when
it has nothing to bite on (no new deps → no dep-check; docs-only diff → no live
loop) — and *say* you skipped it and why, so the record shows a decision, not an
omission.

**Automation.** The two riskiest transitions are hook-nudged: dependency changes
(dep-check nudge) and commits (live-verify reminder). The rest ride on skill
triggers and standing agreements.

**Composes with.** Everything below — the pipeline is the spine the other
techniques hang off.

## 2. Plan → sign-off → build

**What.** For any non-trivial step: present a concrete plan (files, behavior,
verification), wait for explicit sign-off, then build exactly that.

**Why.** Unprompted building is the most expensive failure mode there is — wrong
direction burns the full cost of a build *plus* the cost of undoing it, and the
review burden lands on the human at the worst time (after the fact). A plan costs a
paragraph; its rejection costs nothing.

**Practice.** The plan names the files it will touch, the observable behavior when
done, and how it will be verified. Ambiguities become explicit decision points
(2–4 options, one recommended) — not silent assumptions. Approval of one plan never
extends to the next step. Record sign-off status in memory so a fresh session knows
whether to build or re-present.

**Automation.** Deliberately none — the gate *is* the human. A hook can't approve.

**Composes with.** checkpoint (records approval state at handoff), project-audit
(whose backlog rows all enter through this gate).

## 3. Context-tier discipline

**What.** Classify every doc by load frequency and spend tokens accordingly:
**always-loaded** (CLAUDE.md/AGENTS.md, memory index) → **on-resume** (status doc)
→ **on-demand** (per-area context docs) → **archival** (never loaded, linked only).

**Why.** The always-loaded tier is paid on *every turn of every session* — a
hundred stale words there cost more than ten thousand in an archive. Token spend
should follow load frequency, not file importance.

**Practice.** Keep the hot tier lean and pointer-rich: one line per topic, linking
down-tier for detail. Load on-demand docs only when the task touches their area
(the context-doc index in AGENTS.md maps which). Never inline into the hot tier
what a link can carry. When a hot-tier file regrows an append-log, that's the
signal to run doc-audit.

**Automation.** doc-audit's periodic pass enforces the tiers; its hot-path-first
triage is this technique applied to the audit itself.

**Composes with.** doc-audit (enforcement), the archive pattern (#7, where culled
detail goes), checkpoint (whose resume prompt assumes a lean orient).

## 4. Persistent-memory discipline

**What.** A file-per-fact memory directory with an always-loaded index. Store only
what is **durable** and **non-derivable**: gotchas that cost a session to learn,
standing agreements, environment facts, program state.

**Why.** Memory is the only channel that survives a context reset — but it's also
an always-loaded cost (the index) and a staleness risk. Derivable facts (code
structure, git history) rot in memory while staying free in the repo.

**Practice.** One fact per file; a one-line index entry; cross-link with
`[[name]]`. Convert relative dates to absolute. When a fact changes, edit the file
*and* its index line in the same breath — a stale index misleads every future
session. Before saving, ask: "is this already derivable from the repo?" If yes,
don't save it. Delete memories proven wrong; memory that lies is worse than no
memory.

**Automation.** doc-audit's memory-repair pass; the skills reference memory for
per-project recipes instead of hardcoding them.

**Composes with.** checkpoint (updates program state at every boundary), all
skills (which read memory for project recipes).

## 5. The cheapest-sufficient-probe rule

**What.** Verify every claim with the least expensive probe that actually settles
it: grep for the symbol before reading the file; query the registry before
searching the web; `--json` a CI conclusion instead of trusting a watcher's exit
code; diff against the last-verified sha instead of re-auditing an unchanged tree.

**Why.** Token cost and wall-clock both scale with probe weight, but confidence
doesn't — a grep that finds the symbol settles the question as firmly as reading
the whole file. The savings compound: audits that bound their surface by git diff
run at a tenth the cost of full passes with identical findings.

**Practice.** Before any verification, name what would settle it, then pick the
smallest tool that produces that evidence. Never re-derive what the conversation
already established. The inverse rule holds too: when only the heavy probe settles
it (a live flow, a real build), pay for the heavy probe — cheap-but-insufficient
is the same failure as expensive-but-lazy.

**Automation.** Baked into the skills: project-audit's git-bounded passes,
doc-audit's tiered read depths, dep-check's registry-first rule.

**Composes with.** live-verify (which defines when the heavy probe is mandatory),
project-audit, doc-audit.

## 6. Fan-out research

**What.** Delegate broad, many-file sweeps ("where is X handled?", "which files
mention Y?") to a read-only search subagent that returns the conclusion, not the
transcript.

**Why.** A sweep's intermediate results — dozens of file excerpts — are pure
context cost to the main session; only the answer is load-bearing. Fanning out
keeps the main window for the build.

**Practice.** Use it when the answer is a conclusion (a location, a list, a
yes/no), not when you'll need the file contents next anyway (then read them
directly — delegating and re-reading pays twice). Specify the breadth explicitly.
Never fan out what a single grep answers.

**Automation.** None — a judgment call per question.

**Composes with.** cheapest-sufficient-probe (#5 — fan-out is its multi-file
form), plan-gate research.

## 7. The archive pattern

**What.** Cull verbose detail from living docs by **moving** it — verbatim — to an
archive file, leaving a one-line record and a link. Never delete history; never
let it ride the hot path.

**Why.** Preservation and token-lean are not in tension if archives exist:
the record survives (auditable, linkable) while the hot tier stays cheap.
Deleting loses the why; keeping inline pays for it forever.

**Practice.** Completed plans, superseded audits, per-step verification prose →
archive, with the archive's index noting what landed where. The living doc keeps
a compact table (one row per item). Re-state the rule "don't reintroduce the
append-log" in the doc itself — regrowth is the recurring failure.

**Automation.** doc-audit executes it; the convention lives here.

**Composes with.** context tiers (#3 — archives are the bottom tier), doc-audit.

## 8. Resume prompts / handoff

**What.** When a session ends mid-program, emit one paste-ready prompt carrying:
orientation → next item + its sign-off status → carried findings (each marked
*where it was verified*) → verification expectations → close-the-loop checklist.

**Why.** A fresh session re-derives everything not in the prompt, docs, or memory
— at full token cost and with rediscovery errors. A resume prompt is a paragraph
that replaces an hour. The verified-where markers matter most: they tell the next
session what to trust and what to re-check, instead of forcing re-verification of
everything (or worse, blind trust in everything).

**Practice.** Owned by the checkpoint skill (§3) — this entry exists so the
technique survives even where that skill isn't installed. The judgment call is
the context-health check: hand off *before* the window forces a mid-verification
compaction; borderline counts as unhealthy.

**Automation.** checkpoint structures it; the health check stays judgment.

**Composes with.** checkpoint, memory discipline (#4 — the prompt's orientation
assumes current memory).

## 9. Automation review discipline

**What.** Automation enters the system only through review: name the candidate,
weigh nudge-value against noise, and record the decision — including the
rejections. Everything that fires automatically **advises, never blocks**.

**Why.** A wrong block halts legitimate work and trains people to bypass the
system; a wrong advisory costs one sentence of context. And un-recorded rejections
get re-litigated forever — "why is there no Stop-hook?" deserves a written answer.

**Practice.** For each candidate hook: does it fire at the moment the agent can
act on it? Is the false-positive rate tolerable at that frequency? Would a
standing agreement or skill trigger cover it without machinery? Ship it as
context-injection (never a deny), keep handlers dumb and fast (the *reading agent*
is the smart part), and record active + rejected automations in the manifest.

**Automation.** The three shipped hooks passed this review; the manifest's
`automation` fields carry the active/reviewed record.

**Composes with.** the hooks, the manifest, dep-check + live-verify (the two
skills with active triggers).

## 10. Inception discipline

**What.** A new project enters the pipeline through one structured inception pass:
idea (or plan docs) → discovery (gap analysis, value-add candidates, competitive
landscape, template fit-map) → one batched question round → a product brief that
defines the feature groups and the quality bar → regenerated status + backlog whose
completion *is* the 100 score → sign-off → row 1.

**Why.** The most expensive words in a project are the ones never said at the start:
each unmade decision (tenancy, monetization, the MVP cut) costs a rebuild when it
surfaces mid-program. And a backlog derived from a scored bar makes "done" a
measurement, not a mood.

**Practice.** Restate before analyzing — a wrong restatement is cheapest to catch
first. Split value-adds honestly into *already-free* vs *new build*. Date-stamp
competitive claims; they rot fastest. Skipped answers become **marked assumptions**,
never silent defaults. The first backlog row is always the walking skeleton — the
thinnest live-verified slice of the core flow.

**Automation.** The project-init skill mechanizes the whole pass. No hook — the
template's getting-started docs point at it (a post-scaffold nudge is text, not
machinery).

**Composes with.** plan-gate (#2 — the inception sign-off is the biggest plan-gate
there is), project-audit (which scores against the brief's groups + bar ever after),
context tiers (#3 — the brief joins the on-demand tier).

---

*Part of [ai-dev-kit](../README.md) · techniques distilled from the
next-web-boilerplate program, 2026 · the machine-readable composition graph lives
in [manifest.json](../manifest.json).*
