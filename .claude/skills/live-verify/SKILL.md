---
name: live-verify
description: Verify a change by running it, not by assuming — full gate, fresh production-shaped build, then drive the affected flow end-to-end and observe real output. Use before committing nontrivial product changes, after wiring any integration, or whenever the question is "does it actually work?"
---

# live-verify

The gate proves the code compiles; only driving the change proves it works. Every
nontrivial change gets observed doing its job in a production-shaped run before
it's committed.

If the project has its own verify/run skill (many harnesses ship a built-in that
bootstraps one per project), defer to it for the mechanics and use this skill as
the checklist. Adapter: `.claude/ai-dev-kit.config.json` (`gate`, `verify`;
legacy `prodVerify` honored as the fallback); a missing field → derive it from
the repo and say so.

## 1. Run the full gate

Run the adapter's `gate` commands in order (lint · type-check · build, or the
project's equivalents). A green gate ≠ verified — it's the entry ticket.

## 2. Run the real artifact

Produce a fresh production-shaped artifact (`verify.build`) and run it
(`verify.run`), confirming readiness per `verify.ready.kind` (http · tcp-port ·
exit-code · log-line · file-exists · manual). Never repurpose or disturb a
standing dev process — dev modes mask production-only failures.

**Domain mechanics live in references/ — read exactly one**, keyed on the
adapter's `projectType`; absent, infer the type from the repo (manifests,
engine project files), state the inference, and use the closest fit:

- web-app / api-service → [references/web.md](references/web.md)
- game → [references/game.md](references/game.md)
- cli → [references/cli.md](references/cli.md)
- library → [references/library.md](references/library.md)
- data → [references/data.md](references/data.md)

## 3. Drive the affected flow

Exercise the change the way its real consumer would — user, caller, player,
importer, downstream job — starting from the adapter's `verify.observe` entries
plus judgment about what this change touches. Observe the **actual output**
(response body, DB row, rendered frame, exit code + stdout, artifact content) —
reaching the code path proves routing, not behavior.

## 4. Cross-domain gotchas

- Check the project's memory for per-project recipes (ports, seeds, live-mode
  toggles, golden files) before re-deriving them.
- Killing a background process can orphan children and hold ports/locks —
  tree-kill by PID and confirm release before rebinding.
- Flaky verification has look-alike causes (env leaking from the shell, a stale
  artifact being run, keyed-vs-keyless modes) — rebuild clean with CI-shaped
  env before debugging the test itself.

## 5. Report what "verified" means

State what was driven and what was observed, with verbatim evidence (the status
line, the row, the payload, the frame, the exit code) — never "should work". If
a flow could not be driven (missing key, external dependency, no display), say
so explicitly and list what remains unverified.
