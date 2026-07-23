---
name: live-verify
description: Verify a change by running it, not by assuming — full gate, fresh production build on a dedicated port, then drive the affected flow end-to-end and observe real output. Use before committing nontrivial product changes, after wiring any integration, or whenever the question is "does it actually work?"
---

# live-verify

The gate proves the code compiles; only driving the flow proves it works. This skill
codifies the verify-by-running discipline: every nontrivial change gets observed
doing its job in a production-shaped environment before it's committed.

If the project has its own verify skill (the built-in `verify` skill bootstraps one),
defer to it for the mechanics and use this skill as the checklist. Adapter config:
`.claude/ai-dev-kit.config.json` → `gate`, `prodVerify`.

## 1. Run the full gate

Run the adapter's `gate` commands in order (typically lint · type-check · build).
A green gate ≠ verified — it's the entry ticket.

## 2. Fresh production build, dedicated port

- Serve a **fresh prod build** on the adapter's `prodVerify.port` (via
  `prodVerify.build` + `prodVerify.start`) — never repurpose or disturb a standing
  dev server. Dev servers mask prod-only failures: env inlining, CSP/security
  headers, minification, caching, route pre-rendering.
- When the change touches a live integration, load the project's real env into the
  session first (adapter `prodVerify.notes` records the env facts; the project's
  memory often holds a full recipe — check before improvising).

## 3. Drive the affected flow

- Exercise the change the way a user (or caller) would: the signup form, the webhook
  endpoint, the API query, the email send — headlessly (curl with the right headers)
  or in a browser.
- Auth-guarded flows: origin checks are commonly **exact** — a missing or mismatched
  `Origin` header fails in prod mode where dev was lenient.
- Observe the **actual output**: the response body, the DB row, the rendered page,
  the delivered webhook — a 200 status alone proves routing, not behavior.

## 4. Gotchas that cost real sessions

- A client-side "refresh after fetch" can race and never commit — assert on
  observable state, not on a refresh having happened.
- Killing a background dev/prod server can orphan the process and leave the port
  held — tree-kill by PID before rebinding, and confirm with a port probe.
- E2E flakes often have several look-alike causes (env leaking from the shell, a
  stale build being served, keyed-vs-keyless mode differences) — rebuild clean with
  CI-shaped env before debugging the test itself.
- Check the project's memory for per-project recipes (ports, origin exactness,
  seeded accounts, live-mode toggles) before re-deriving them.

## 5. Report what "verified" means

State what was driven and what was observed, with verbatim evidence (the status
line, the row, the payload, a screenshot) — never "should work". If a flow could
not be driven (missing key, external dependency), say so explicitly and list what
remains unverified.
