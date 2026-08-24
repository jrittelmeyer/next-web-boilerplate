# The disposition map — governing rules and bucket semantics

## Contents
- The three governing rules
- The five buckets, in full

## The three governing rules

- **The meaningful-improvement bar, two-tiered.** On the **product surface** —
  UI, flows, styles, copy, business logic, product features — keep-theirs is
  the default: a row leaves it only for a named, product-relevant improvement
  (correctness, security, accessibility, performance, maintenance burden,
  testability, operational rigor) written into its *why*, and a wash keeps
  theirs — churn is a cost. On the **foundation tier** — auth, DB layer,
  tooling, CI, security, observability — the presumption runs the other way:
  the scaffold already wires the foundation's, so *keeping theirs* is the
  churn, and it takes the same named why to unpick it. "The foundation has
  one" is never a why on either tier.
- **No wash by ignorance.** A wash verdict exists only on top of a recorded
  contested-subsystem comparison; at a weak reference grade, say what could
  not be verified instead of calling it equal.
- **Contested subsystems get a real comparison.** Where both sides implement
  the same concern (their auth vs the foundation's, their form stack vs the
  foundation's), compare tech choices *and implementation details* on the
  axes above before bucketing, and record the verdict — with what was
  actually inspected — in the migration map. The comparison is a deliverable,
  not an impression.

## The five buckets, in full

- **port-onto-foundation** — surfaces that must be **rebuilt** to run on this
  foundation: stack-incompatible UI, flows, copy, or transplants that a hard
  rule of the adopting repo forces into structural change (that rule is the
  row's why) — rebuilt on foundation idioms, pixel-faithful to the parity
  contract. Rebuilding what could transplant intact needs its own why under
  the bar.
- **replace-with-foundation** — foundation-tier subsystems under the
  presumption above; the row still names the concrete gap the swap closes,
  and names what the user visibly keeps (their data, their flows) so
  "replace" never reads as "lose".
- **keep-theirs** — the product-surface default: genuinely better, equivalent
  (a recorded wash), or load-bearing custom logic the foundation can't
  express — **transplanted intact** into foundation structure. "Intact" is
  bounded by the adopting repo's gates **and stated hard rules** (the CI gate
  plus the non-CI-enforced rules its onboarding doc carries): mechanical
  conformance is part of the transplant; a hard rule forcing structural
  change moves the row to port-onto-foundation with that rule as its why.
  Framework-agnostic material — business logic, schemas, algorithms,
  styles/tokens, copy — transplants most honestly. A keep-theirs row kept
  because it **beat** a foundation equivalent is an upstream-lesson candidate
  for the foundation.
- **light-up** — foundation features the original lacks that clear the bar
  for this product; everything else stays dark (graceful degradation is the
  default, not a removal task).
- **drop** — dead code, with the evidence that it's dead.
