---
name: project-init
description: Initialize a new product — ingest plan docs or a raw idea, run discovery and competitive research, converge on a product brief, and regenerate the living docs into a build program targeting a 100 audit score. Use on a fresh scaffold from a template, when the user says "init this project" / "here's my idea for an app", or when they hand over plan documents.
---

# project-init

The one-time inception pass that turns an idea into a signed-off, documented
build program. Input: one or more plan documents, an inline idea prompt, or
both. Output: a converged product brief, mended context docs, and a
regenerated status doc + banded backlog whose completion **is** a 100/100
`project-audit` score for *this product* — then the lifecycle pipeline begins
at row 1.

Adapter: `.claude/ai-dev-kit.config.json` (`init.scaffold` — `{name}` → the
app name, `init.productBrief` default `docs/PRODUCT.md`, `docs` block); a
missing field → derive it from the repo and say so. Flags: `--deep` (research
fan-out), `--name <app-name>`. "The foundation" below = the template/starter
the repo builds on; on a repo with no foundation heritage, skip the scaffold
and fit-map — the rest applies unchanged.

Shared inception conventions (scaffold guard · question round · brief shape ·
doc registration · doc regeneration · sign-off gate):
[references/inception-shared.md](references/inception-shared.md) — read it
first; the steps below call into it.

Everything here is analysis and docs until the final gate — **this skill
writes no product code.**

## 1. Intake

- Read every provided plan document fully; restate an inline idea in your own
  words. Neither provided → ask for one (the only unconditional stop).
- Re-run safety: if the product brief already exists, this is a
  resume/revision — diff the new input against it and confirm scope with the
  user instead of starting over.
- **Scaffold guard** — per the shared conventions.

## 2. Discovery (extended thinking)

Think hard and produce one **discovery brief** (in-conversation — it becomes
the product brief only after the question round):

- **Restatement** — problem, target users and their jobs-to-be-done, what
  success looks like. A wrong restatement is cheapest to catch here.
- **Gap analysis** — the decisions the input never made: core data entities
  and ownership, auth/identity shape and tenancy where relevant, pricing and
  monetization, permission tiers, realtime/offline needs, platform targets,
  compliance surface, launch scope — plus missing flows and edge cases in the
  flows it *did* describe. Weight the axes by the product's type (a game's
  gaps are platforms, content scope, and progression, not tenancy).
- **Value-add candidates** — features that would strengthen the product,
  split honestly: *already free in the foundation* (map each to a shipped
  integration) vs *genuinely new build*. Value/effort per item; don't pad.
- **Competitive landscape** — web-search the market as of today: ~5 direct
  competitors plus the adjacent products users actually compare against,
  their table-stakes features (absence = instant credibility loss), the gaps
  worth differentiating on, pricing norms. With `--deep`, fan out research
  subagents (per-competitor + market overview) and keep only conclusions.
  Date-stamp and source every claim — this section rots fastest.
- **Foundation fit-map** — for each integration the foundation ships: needed
  as-is / not needed (a removal candidate — point at the foundation's removal
  checklists where it has them) / needed beyond what's shipped (an extension
  row for the backlog).

## 3. One batched question round

Per the shared conventions. Cover at minimum: the app name (if still
unknown), the MVP cut-line, monetization, the identity/auth shape (or the
product-type equivalent), and every fit-map removal.

## 4. Converge: the product brief

Write the brief per the shared conventions' brief shape, and register it in
the context-doc index per the shared conventions.

## 5. Mend the docs & methodology

Sweep the context docs (adapter `docs.contextDir`) against the product's
needs: integrations being removed → apply or point at the removal checklists;
extensions → note the divergence in the relevant context doc; conventions the
product changes (tenancy, locales, platforms, compliance) → update them where
they're stated. Every gap that is really a *foundation* defect (missing doc,
wrong claim, absent methodology for this product class) → an **Upstream
candidates** section in the regenerated backlog, each row phrased as a
ready-to-file issue/PR against the foundation. The derived project never
blocks on upstream.

## 6. Regenerate the living docs (the plan-to-100)

Per the shared conventions. B1 opens with the **walking skeleton** — the
thinnest end-to-end slice of the core flow, live-verified.

## 7. Sign-off gate → the pipeline begins

Per the shared conventions: present brief summary, doc mends, the backlog's
shape, and the top B1 rows; wait for explicit sign-off; commit the inception
output (scaffold + brief + doc mends + regenerated docs) on approval.
