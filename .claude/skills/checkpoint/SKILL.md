---
name: checkpoint
description: Commit and push pending work, then either continue to the next backlog step (context still healthy) or emit a paste-ready resume prompt for a fresh session (context tight). Use when the user says "checkpoint", "commit and continue", "wrap this step up", or asks whether to keep going vs. clear context.
---

# checkpoint

Commit + push whatever is pending, then decide: continue to the next step in this
session, or hand off cleanly with a resume prompt. Never do half of both.

## 1. Commit & push

- `git status` first; stage only the files that belong to the finished work (no blind
  `git add -A` if anything unrelated is dirty). If the tree is clean, say so and go to step 2.
- Message: conventional style matching `git log` (`feat(web): P2-N — …` / `chore: …`),
  body = what/why + one-line verification note. **No `Co-Authored-By` trailers** —
  commits carry the repo-local git identity only.
- PS 5.1 gotcha: write the message to a scratchpad file and `git commit -F <file>`
  (see the session-tooling-gotchas memory — inline `-m` quoting breaks).
- Push. **If this checkpoint ends the session** (step 2 says hand off), watch CI to
  green now: `gh run list --commit <full 40-char sha>` (a short sha silently matches
  nothing) → the **CI** workflow run → `gh run watch <id>`, then **confirm** with
  `gh run view <id> --json status,conclusion` (watch's `--exit-status` is unreliable).
  If instead you're continuing with more work that ends in its own watched CI run, one
  watch at the end covers the tree.
- **Housekeeping (after push):** `pnpm cache:prune` — the Turbo cache has no native
  size cap and each build adds ~3.5 GB, so pruning at every checkpoint bounds it at
  the exact cadence it grows (a pre-push hook backstops it too). No-op when under cap.
  For a deeper local pass (orphaned :3000/:3100 servers, stale `@example.com` e2e
  users, dangling Docker images), use the `tidy` skill.

## 2. Context-health check

Estimate how much of the window the session has consumed (weigh: count/size of tool
results, file dumps, images, long live-verification transcripts) against what the next
step costs end-to-end. A full backlog item = re-verify findings → build → full gate →
live loop → docs → commit → CI watch: typically a third to half of a *fresh* window.

- **Healthy:** the entire next step fits in the remaining window with ~2× margin →
  continue (respect plan → sign-off: only build if the plan is already approved).
- **Not healthy / in doubt:** hand off. A resume prompt costs a paragraph; a
  mid-verification compaction costs quality. Borderline counts as not healthy.

State the verdict and the rough numbers behind it — don't decide silently.

## 3. Handoff (when stopping)

Update the project-state memory (what shipped, plan-approval status of the next item),
then produce **one paste-ready resume prompt** in a fenced code block. Assume the next
session starts cold with only CLAUDE.md + memory — anything not in the prompt or in a
doc/memory is lost. It must contain, in order:

1. **Orientation** — read `docs/PROJECT_STATUS.md` + the forward backlog in
   `docs/BACKLOG.md`; what's shipped, last commit sha(s), CI state.
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
5. **Close-the-loop checklist** — docs to tick/update, commit style (`-F`, no
   trailers), push, the CI-watch commands, and what to propose next before stopping.
