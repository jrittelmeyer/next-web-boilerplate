---
name: checkpoint
description: Commit and push pending work, then either continue to the next backlog step (context still healthy) or emit a paste-ready resume prompt plus a recommended relaunch model + reasoning effort for a fresh session (context tight). Use when the user says "checkpoint", "commit and continue", "wrap this step up", or asks whether to keep going vs. clear context.
disable-model-invocation: true
---

# checkpoint

Commit + push whatever is pending, then decide: continue to the next step in this
session, or hand off cleanly with a resume prompt. Never do half of both.

Adapter: `.claude/ai-dev-kit.config.json` (`commit`, `ci`, `cache`, `docs`); a
missing field → derive it from the repo and say so.

## 1. Commit & push

- `git status` first; stage only the files that belong to the finished work (no blind
  `git add -A` if anything unrelated is dirty). If the tree is clean, say so and go to
  step 2.
- Message: conventional style matching `git log` (`feat(web): …` / `chore: …`), body =
  what/why + one-line verification note. Respect the adapter's `commit` block:
  `trailers: false` means **no `Co-Authored-By` trailers**; `useFileFlag: true` means
  write the message to a scratchpad file and `git commit -F <file>` (inline `-m`
  quoting breaks on PowerShell 5.1).
- Push. **If this checkpoint ends the session** (step 2 says hand off), watch CI to
  green now — provider recipes (find the run for this exact sha → watch → confirm
  the conclusion via a JSON query, never the stream alone) are in
  [references/ci-watch.md](references/ci-watch.md), keyed on the adapter's
  `ci.provider`. If instead you're continuing with more work that ends in its own
  watched CI run, one watch at the end covers the tree.
- **Housekeeping (after push):** run the adapter's `cache.prune` command if defined —
  local build caches often have no TTL or size cap and grow by gigabytes per build, so
  pruning at every checkpoint bounds them at the exact cadence they grow (a pre-push
  hook may backstop it too). No-op when under cap. For a deeper local pass (orphaned
  dev servers, stale e2e users, dangling Docker images), use the `tidy` skill.

## 2. Context-health check

Estimate how much of the window the session has consumed (weigh: count/size of tool
results, file dumps, images, long live-verification transcripts) against what the next
step costs end-to-end. A full backlog item = re-verify findings → build → full gate →
live loop → docs → commit → CI watch: typically a third to half of a *fresh* window.

- **Healthy:** the entire next step fits in the remaining window with ~2× margin →
  continue (respect plan → sign-off: only build if the plan is already approved).
- **Not healthy / in doubt:** hand off. A resume prompt costs a paragraph; a
  mid-verification compaction costs quality. Borderline counts as not healthy.
- **Three strikes:** a session that has failed the *same obstacle* three times is
  unhealthy regardless of remaining window — the window is now full of failure
  and poisons further attempts. Hand off with a diagnosis of the wrong
  assumption (the fix is to the spec or the context, not another retry); never
  coach it out in-window — and suggest a `retro` pass so the obstacle becomes
  a codified lesson, not a rerun.

State the verdict and the rough numbers behind it — don't decide silently.

## 3. Handoff (when stopping)

Update the project-state memory (what shipped, plan-approval status of the next item),
then write the **resume prompt to disk** and point at it — disk survives everything,
a scrollback paste doesn't, and a fresh session reads a file in targeted chunks
instead of ingesting a wall of text:

1. Write the full resume prompt (structure below) to the adapter's `docs.handoff`
   path if set, else into the agent memory directory as `resume-prompt.md` (one
   file, overwritten each handoff, index line: "standing resume prompt from the
   last checkpoint — read when resuming mid-program"). Keep a repo-path handoff
   out of version control unless the project tracks it deliberately.
2. Emit the seed — one line: "fresh session: Read <path>, then continue" — plus
   the same prompt as a fenced paste-ready block for convenience.
3. End the response with the launch recommendation (rubric below) as the literal
   last line — `Launch: <model> @ <effort> — <why>` — it is what the user reads
   when picking the model for the relaunch. Mirror the same line at the top of
   the handoff file, right under the title, so it still reaches the user when
   only the file survives.

Assume the next session starts cold with only CLAUDE.md + memory — anything not in
the handoff file, a doc, or memory is lost. The prompt must contain, in order:

1. **Orientation** — read the project's status doc + forward backlog (adapter
   `docs.status` / `docs.backlog`); what's shipped, last commit sha(s), CI state.
2. **The next item** — id, title, scope, and its sign-off status: if the plan was
   already approved say so explicitly ("do NOT re-present for sign-off; re-verify the
   carried findings against the installed dists, then build"); otherwise "present the
   plan and wait for sign-off".
3. **Carried findings** — every load-bearing fact with `file:line`, each marked
   *verified-where* (installed dist vs. read-in-session vs. assumed — the next session
   re-verifies the assumed ones first instead of rediscovering everything).
4. **Verification expectations** — the full gate + the exact live-loop shape, env facts
   (live keys, Docker containers, free ports, origin-exactness), and which memories to
   read before editing (name them).
5. **Close-the-loop checklist** — docs to tick/update, commit style (per the adapter's
   `commit` block), push, the CI-watch commands, and what to propose next before
   stopping.

### The launch recommendation (model × effort)

Spend capability where judgment lives, not where the plan already decided. From
the step shape §2 estimated, recommend the cheapest configuration that executes
the next step *well* — name a tier of the harness's current ladder (e.g.
Haiku < Sonnet < Opus < Fable, late-2026 — an aging example: verify against the
lineup the session actually offers) and a reasoning effort (low → max):
<!-- lint-ok: dated — deliberate example ladder; re-checked each harness-audit -->


- **Mechanical** — an approved plan with named files, docs/config-only edits,
  release chores, gate re-runs: smallest tier that drives the tools reliably,
  low effort. The plan is the intelligence; the session just executes it.
- **Standard build** — a signed-off S/M item around a known design (build →
  tests → gate → live loop): mid tier, medium effort — high when the diff
  touches concurrency, authz, or money paths.
- **Judgment** — planning or design, audits and scoring, debugging an unknown,
  adversarial verification of findings: top tier, high effort or above.
- A mixed next step splits by session: a plan-only session is Judgment; its
  approved execution relaunches as Mechanical — recommend for the first
  session-sized chunk and say what the one after relaunches as.
- In doubt between tiers on work that ships product code or scores quality,
  take the higher: an oversized model wastes tokens, an undersized one ships
  plausible-but-wrong work a later session must unwind.
