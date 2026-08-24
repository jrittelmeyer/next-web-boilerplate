---
name: project-audit
description: Deep audit of the whole repo — verify docs ↔ code alignment, score each feature group out of 100 against a best-available bar, and emit an exhaustive prioritized backlog that would bring every group to 100. Use when the user asks for a project audit, quality scores, "how good is this really", or "what's missing to make this perfect".
---

# project-audit

Audit the repo end-to-end with extended thinking: prove the docs match the code,
score every feature group /100 against the bar "the most competently executed,
robust, performant product of its kind available today" (a product brief that
defines its own groups + bar takes precedence), and turn every lost point into a
concrete backlog item. Read-only with respect to product code — outputs are
docs only (report + backlog + status pointers). Adapter:
`.claude/ai-dev-kit.config.json` (`docs` block, `projectType`); missing paths →
discover them from the repo and say so.

## 1. Inventory (docs first, then code)

- **If a prior audit report exists, bound the surface via git first**: diff the
  last-audited sha against HEAD. Code byte-identical to an already-verified tree
  carries the prior pass's per-group findings by identity — spend the pass on
  what actually changed, plus the checks below that *time alone* can invalidate
  on an unchanged tree (currency, external gates, the live public surface).
  State the bounding in the report.
- Read the project's status, backlog, and verification docs plus **every** agent
  context doc (adapter `docs.status` / `docs.backlog` / `docs.contextDir`). Note
  each doc's checkable claims (file paths, line refs, behaviors, "X is
  verified/gated/opt-in").
- Sweep the code: root configs (package manager/toolchain, task runner,
  lint/format), each entry point's source (routes/scenes/commands/modules per
  the project type), every workspace package and tooling dir, CI workflows,
  container/deploy or packaging config, test configs + coverage gates.
- Spot-check doc claims against the code as you go — especially `file:line`
  references, env-gating ("degrades gracefully"), counts (tests, scans, rules),
  and anything marked verified. Record every mismatch as **drift** (doc wrong)
  or **gap** (code missing what the doc promises).
- **Public/consumer surface (when the repo is public or a template):** audit the
  on-ramp as a first-time consumer hits it — README/getting-started quickstart
  commands match the real scripts, badges + links resolve, community files
  (CONTRIBUTING, SECURITY, CoC, issue/PR templates, FUNDING) present and current,
  and claimed repo automation **actually alive**, not just configured (CI + code
  scanning green on recent commits, dependency-update PRs actually arriving — a
  committed config with a dead app is dormant, not done). **Query the forge's
  open-alert APIs, not just workflow conclusions** — a green scan run only means
  the scan uploaded; on GitHub open findings live behind
  `gh api repos/<o>/<r>/code-scanning/alerts?state=open` (and the Dependabot
  equivalent); other forges have equivalent open-alert endpoints. Zero open
  alerts is the checkable claim; a workflow badge is not — scoring from badges
  alone has passed repos carrying open alerts.
  Untriaged issues/PRs and visibly stale dependencies are adoption-killers:
  score them.
- **Goals & gates:** re-read the repo's stated goals (README/status) against
  what the repo now is — goal drift is a finding, not a given. Re-check every
  externally-gated watch/backlog row: has the upstream gate lifted since the
  last pass (a release shipped, an issue closed)? Currency counts even on a
  byte-identical tree — the bar is "best available **today**", and the
  ecosystem moves between passes.

## 2. Feature groups & scoring

Choose the groupings that fit the repo (typically 12–16). A product brief that
defines feature groups + a bar wins; otherwise start from the per-project-type
taxonomy in [references/taxonomies.md](references/taxonomies.md) (web-app ·
api-service · cli · library · game · data · mobile/desktop, keyed on the
adapter's `projectType`) and adapt.

Score each group **/100** with this rubric (weights in parentheses; deduct
specific, named points — every deduction MUST map to a backlog item or an
explicit "won't fix because ..." note):

- **Correctness & robustness (30)** — bugs, edge cases, race conditions,
  failure modes, graceful degradation with env unset.
- **Completeness vs. today's best practice (25)** — what a top-tier production
  product of this kind ships in this area today; missing table-stakes features
  cost here.
- **Security (15)** — authz, input validation, secrets handling, abuse limits.
- **Performance (10)** — measured or structural, on the domain's hot paths
  (the taxonomy file notes the per-type perf axis).
- **Testing (10)** — meaningful coverage of this group's core paths (unit +
  integration + E2E where it matters), gates that keep it covered.
- **Docs & DX (10)** — accurate docs, discoverable conventions, copy-me
  examples, sensible defaults; doc drift found in step 1 costs here.

Calibration: 100 = nothing left that would materially benefit this product's
users (for a library/template: a majority of downstream projects); 90s = polish
items only; 80s = a real gap production use would hit; below 70 = missing
table-stakes. Do not grade on a curve against the repo's own history — grade
against the best conceivable product of its kind today.

## 3. Backlog generation

For every deduction, write a backlog item that recovers the points. Default
inclusion policy (defer to a standing owner policy recorded in the project's
docs or memory if one exists):

- Benefits a **majority** of the product's users (for a library/template:
  downstream projects) at little risk/perf cost → **include**.
- **Greatly** beneficial but moderate risk or perf cost → **include**, unless
  you strongly advise against it — then say so in the report with the reason
  and leave it out (or park it as an explicit "advised-against" row).
- Niche/minority-value features → leave out; note them in the report's
  "considered and excluded" list so the decision is visible.

Each item: one row — area · title · what it fixes/adds · which score it lifts
(group + points) · rough effort (S/M/L) · risk notes if any.

## 4. Prioritization

Order the combined backlog by **breadth of value to the product's users** (for
a library/template: downstream projects) — breadth first, then depth of value,
then effort as tiebreak. Keep
the repo's existing priority/band convention (e.g. B1 = do-next … B4 =
pivot-only) so it merges into the backlog doc without inventing a second
scheme; state the mapping.

## 5. Outputs (docs only — no product-code edits)

1. **Report** → `<archiveDir>/PROJECT_AUDIT_<date>.md` (adapter
   `docs.archiveDir`, default `docs/archive/`): method, per-group scores with
   named deductions, drift findings, considered-and-excluded list, and the full
   prioritized backlog. This is the durable record.
2. **Merge actionable items into the backlog doc**, respecting its documented
   rules (forward-only, banded table, linked detail, no shipped-item entries,
   no duplicated detail — link the report).
3. **Fix any drift found in step 1** in the affected doc(s) — doc edits only;
   if drift implies a code bug, that's a backlog item, not an inline fix.
4. **Update the status doc** — one compact pointer to the report + refreshed
   "what's next" if the priority order changed.
5. Summarize for the user: the score table, the top findings, and the
   recommended next 3–5 items. Then run `/checkpoint` (standing agreement).

Every backlog item still goes plan → sign-off → build later — this skill never
starts implementing them.
