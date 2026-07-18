---
name: project-init
description: Initialize a new product on this template — ingest detailed plan docs or a raw idea prompt, run deep discovery (clarifying questions, gap analysis, value-add candidates, competitor/adjacent-product research), converge on a product brief, mend context-doc gaps, and regenerate the living docs (status + prioritized backlog targeting a 100 audit score) before starting the build pipeline. Use on a fresh scaffold from the template, when the user says "init this project" / "here's my idea for an app", or when they hand over plan documents to turn into a build plan.
---

# project-init

The one-time inception pass that turns an idea into a signed-off, documented build
program. Input: one or more plan documents, an inline idea prompt, or both. Output: a
converged product brief, mended context docs, and a regenerated status doc + banded
backlog whose completion **is** a 100/100 `project-audit` score for *this product* —
then the lifecycle pipeline begins at row 1.

Project parameters come from the adapter config `.claude/ai-dev-kit.config.json`:
`init.scaffold` (mechanical scaffold command; `{name}` → the app name),
`init.productBrief` (default `docs/PRODUCT.md`), plus the `docs` block for
status/backlog/context paths. Where a field is absent, derive it from the repo and say
so. Flags: `--deep` (research fan-out), `--name <app-name>`. On a repo with no
template heritage, skip the scaffold and fit-map — the rest applies unchanged.

Everything here is analysis and docs until the final gate — **this skill writes no
product code.**

## 1. Intake

- Read every provided plan document fully; restate an inline idea in your own words.
  Neither provided → ask for one (the only unconditional stop).
- Re-run safety: if the product brief already exists, this is a resume/revision — diff
  the new input against it and confirm scope with the user instead of starting over.
- **Scaffold guard:** if the adapter defines `init.scaffold`, run it once the app name
  is known — but a scaffold's doc-slim step *removes files*, so unless the repo is an
  obviously fresh scaffold (template journey docs intact, no product commits yet), get
  explicit confirmation first. Name still unknown → fold it into the question round
  and scaffold after.

## 2. Discovery (extended thinking)

Think hard and produce one **discovery brief** (in-conversation — it becomes the
product brief only after the question round):

- **Restatement** — problem, target users and their jobs-to-be-done, what success
  looks like. A wrong restatement is cheapest to catch here.
- **Gap analysis** — the decisions the input never made: core data entities and
  ownership, auth shape and tenancy (solo / teams / orgs), pricing and monetization,
  permission tiers, realtime/offline needs, compliance surface, launch scope — plus
  missing flows and edge cases in the flows it *did* describe.
- **Value-add candidates** — features that would strengthen the product, split
  honestly: *already free in the template* (map each to a shipped integration) vs
  *genuinely new build*. Value/effort per item; don't pad the list.
- **Competitive landscape** — web-search the market as of today: ~5 direct
  competitors plus the adjacent products users actually compare against, their
  table-stakes features (absence = instant credibility loss), the gaps worth
  differentiating on, pricing norms. With `--deep`, fan out research subagents
  (per-competitor + market overview) and keep only conclusions. Date-stamp and source
  every claim — this section rots fastest.
- **Template fit-map** — for each integration the template ships: needed as-is / not
  needed (a removal candidate — point at the template's removal checklists) / needed
  beyond what's shipped (an extension row for the backlog).

## 3. One batched question round

Turn every open decision from the brief into a clarifying question with 2–4 concrete
options and a recommendation — batched into **one round**, one sitting for the human
(multiple tool calls if the ask-user machinery caps questions per call; a numbered
brief section otherwise). Cover at minimum: the app name (if still unknown), the MVP
cut-line, monetization, auth shape, and every fit-map removal. Answers the user skips
→ adopt the recommendation and **mark it as an assumption** wherever it lands. Don't
iterate rounds — a wrong assumption gets caught at the sign-off gate.

## 4. Converge: the product brief

Write the brief to `init.productBrief` — the durable product definition every later
session loads instead of re-deriving:

- Vision, problem, users; competitive positioning (date-stamped, sourced).
- The converged feature set: MVP vs later, accepted value-adds, and **explicit
  out-of-scope** (rejected candidates stay visible so they aren't re-proposed).
- **Feature groups + the bar** — the product-specific groups a future `project-audit`
  scores /100, and the calibration bar ("the most competently executed <category>
  product available today"). This is what makes "100" mean something for this repo.
- Decision log: each question, the chosen option, every marked assumption.

Register the brief in the repo's context-doc index (the agent-onboarding doc's
load-when table) so future sessions find it on demand.

## 5. Mend the docs & methodology

Sweep the context docs (adapter `docs.contextDir`) against the product's needs:

- Local mends now: integrations being removed → apply or point at the removal
  checklists; extensions → note the divergence in the relevant context doc;
  conventions the product changes (tenancy, locales, compliance) → update them where
  they're stated.
- Every gap that is really a *template* defect (missing doc, wrong claim, absent
  methodology for this product class) → an **Upstream candidates** section in the
  regenerated backlog, each row phrased as a ready-to-file issue/PR against the
  template. The derived project never blocks on upstream.

## 6. Regenerate the living docs (the plan-to-100)

- **Status doc** (adapter `docs.status`): the product's identity + a link to the
  brief, the integration on/off map, the feature groups, and state = "inception
  complete — awaiting sign-off".
- **Backlog** (adapter `docs.backlog`): forward-only, banded (B1 do-next → B4
  pivot-only). Every row: area · title · what it delivers · which feature-group score
  it lifts · effort (S/M/L) · verification expectation. B1 opens with the **walking
  skeleton** — the thinnest end-to-end slice of the core flow, live-verified.
  Completing the backlog *is* the 100 score; a row that lifts no group doesn't
  belong. Close with the Upstream candidates section from step 5.

## 7. Sign-off gate → the pipeline begins

Present the whole thing — brief summary, doc mends, the backlog's shape, the top B1
rows — and **wait for explicit sign-off** (plan → sign-off → build; inception is the
biggest plan there is). On sign-off, enter the lifecycle pipeline at the first B1
row: orient → plan-gate per row → build → live-verify → checkpoint at every boundary.
On rejection, fold the feedback into the brief and re-present — that's one more
round, not a failure.
