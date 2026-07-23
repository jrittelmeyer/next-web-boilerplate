# packages/email — leaf rules

One imperative per line; mechanics + rationale live in
[docs/context/services/resend.md](../../docs/context/services/resend.md).

- **Never construct Resend at import time** — `new Resend(undefined)` throws and
  breaks the keyless build; use the lazy `getResend()` singleton.
- Every template exports BOTH: named (app usage) + default (preview CLI).
- A new template joins `templates.test.tsx` or the coverage gate trips
  ([TESTING.md](../../docs/context/TESTING.md)).
- App code calls the `send*` helpers (they own the env gate + suppression-list
  consult) — never `getResend()` directly.
- This package imports only `@repo/validators` + `@repo/db`.
