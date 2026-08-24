# live-verify — web-app / api-service mechanics

Serve a **fresh prod build on the dedicated verify port** (`verify.ready.port` —
never the dev port): dev servers mask prod-only failures — env inlining,
CSP/security headers, minification, caching, route pre-rendering. Never
repurpose or disturb a standing dev server.

- **Live integrations:** load the project's real env into the session first
  (`verify.notes` records the env facts; project memory often holds the full
  recipe — check before improvising).
- **Drive headlessly or in a browser:** the signup form, the webhook endpoint,
  the API query, the email send — curl with the right headers, or a real
  browser for anything rendering-dependent.
- **Origin exactness:** auth-guarded flows commonly check `Origin` **exactly**
  — a missing or mismatched header fails in prod mode where dev was lenient.
- **Observe state, not status:** a 200 proves routing; the response body, the
  DB row, the rendered page, the delivered webhook prove behavior. A
  client-side "refresh after fetch" can race and never commit — assert on
  observable state, not on a refresh having happened.
- **E2E flakes** usually trace to env leaking from the shell, a stale build
  being served, or keyed-vs-keyless mode differences — rebuild clean with
  CI-shaped env before debugging the test.
