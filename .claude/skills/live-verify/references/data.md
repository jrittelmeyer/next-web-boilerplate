# live-verify — data-pipeline mechanics

The production-shaped run is the pipeline executed on a **real sample slice**
(`verify.run`) — unit tests on transforms prove functions, not the pipeline.

- **Sample-slice drive:** run the affected stage(s) end-to-end on a
  representative input slice, including the ugly partitions (nulls, empty
  groups, boundary dates, malformed rows) — not just the happy sample.
- **Assert on outputs:** schema (columns/types), row counts against
  expectation, and content spot-checks — diff against a golden output where
  one exists. A completed run proves scheduling, not correctness.
- **Determinism:** fix seeds and freeze time-dependent inputs for the verify
  run; a shifting diff proves nothing.
- **Idempotence / re-run:** run the stage twice — duplicated rows, clobbered
  partitions, or non-idempotent side effects surface here, before production
  re-runs find them.
- **Backfill vs incremental:** if the change touches both paths, drive both —
  they diverge silently.
- **State cleanup:** verify runs against shared warehouses/buckets must write
  to a scratch namespace and clean up — never verify into production tables.
