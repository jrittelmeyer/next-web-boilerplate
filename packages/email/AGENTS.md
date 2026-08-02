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
- **Event-zone rendering only** (`formatEventWhen`) — the event's own time, in the event's
  own zone, named. **Reader-relative formatting stays in `apps/web`**, where next-intl and
  `user_preferences` live; this package can never know a reader's locale. It lives here
  because the `@repo/jobs` reminder sweeper is a second caller that cannot reach `apps/web`.
  Emails are en-GB for every recipient — accepted, in DECISIONS.md, not a bug to fix here.
- This package imports only `@repo/validators` + `@repo/db`.
