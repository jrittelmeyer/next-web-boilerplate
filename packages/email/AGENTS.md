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
- Attachment `content` is UTF-8 **text**; the Buffer encoding happens at the Resend
  boundary (a bare string is read there as already-base64).
- **Never format a date here** — a pre-formatted string comes in from `apps/web`, where
  next-intl and `user_preferences` live.
- This package imports only `@repo/validators` + `@repo/db`.
