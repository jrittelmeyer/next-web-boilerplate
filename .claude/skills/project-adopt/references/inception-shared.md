# Inception conventions — shared by project-init and project-adopt

This file is intentionally byte-identical in both skills (each stays
self-contained; CI enforces the copies never drift).

## Contents
- Scaffold guard
- The one batched question round
- The product brief shape
- Context-doc registration
- Regenerating the living docs
- Sign-off gate → the pipeline begins

## Scaffold guard

If the adapter defines `init.scaffold`, run it once the app name is known — but
a scaffold's doc-slim step *removes files*, so unless the repo is an obviously
fresh scaffold (foundation journey docs intact, no product commits yet), get
explicit confirmation first. Substitute `{name}` with a slug in the ecosystem's
package-name shape (for JS scaffolds: a lowercase npm-safe slug — a scaffold
may silently skip its rename step on an invalid name). Name still unknown →
fold it into the question round and scaffold after.

## The one batched question round

Turn every open decision into a clarifying question with 2–4 concrete options
and a recommendation — batched into **one round**, one sitting for the human
(multiple tool calls if the ask-user machinery caps questions per call;
consecutive sets within that moment still count as the one round). Answers the
user skips → adopt the recommendation and **mark it as an assumption** wherever
it lands; smaller calls resolved by recommendation without being asked get the
same marking in the brief's decision log. Don't iterate rounds — a wrong
assumption gets caught at the sign-off gate.

## The product brief shape

Write the brief to `init.productBrief` — the durable product definition every
later session loads instead of re-deriving:

- Vision, problem, users; competitive positioning (date-stamped, sourced)
  where researched.
- The converged feature set: MVP vs later, accepted value-adds, and **explicit
  out-of-scope** (rejected candidates stay visible so they aren't re-proposed).
- **Feature groups + the bar** — the product-specific groups a future
  `project-audit` scores /100, and the calibration bar ("the most competently
  executed <category> product available today"). This is what makes "100" mean
  something for this repo.
- Decision log: each question, the chosen option, every marked assumption.

## Context-doc registration

Register each durable inception doc in the repo's context-doc index (the
agent-onboarding doc's load-when table) so future sessions find it on demand:
append a row matching the table's shape. (Some foundations pre-seed a
commented placeholder row directly below the table — where one exists,
uncomment it instead: delete the wrapper lines, keep the row.)

## Regenerating the living docs

- **Status doc** (adapter `docs.status`): the product's identity + links to
  the inception docs, the integration on/off map, the feature groups, and
  state = "inception complete — awaiting sign-off".
- **Backlog** (adapter `docs.backlog`): forward-only, banded (B1 do-next → B4
  pivot-only). Every row: area · title · what it delivers · which
  feature-group score it lifts · effort (S/M/L) · verification expectation.
  Completing the backlog *is* the 100 score; a row that lifts no group doesn't
  belong. Close with the Upstream candidates section where one exists.

## Sign-off gate → the pipeline begins

Present the whole thing and **wait for explicit sign-off** (plan → sign-off →
build; inception is the biggest plan there is). On sign-off, commit the
inception output (adapter `commit` style) so the pipeline starts from a clean
tree, then enter the lifecycle pipeline at the first B1 row: orient →
plan-gate per row → build → live-verify → checkpoint at every boundary. On
rejection, fold the feedback in and re-present — one more round, not a failure.
