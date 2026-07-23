# packages/auth — leaf rules

One imperative per line; mechanics + rationale live in
[docs/context/auth/core.md](../../docs/context/auth/core.md).

- **Plugin array order is load-bearing**: conditionally-spread plugins go LAST,
  just before `nextCookies()` — earlier placement silently erases the
  twoFactor/admin/organization `$Infer` type augmentations.
- The auth schema lives in `@repo/db` (hand-maintained) — nothing here; never
  run `@better-auth/cli`.
- Pure env helpers go in `config.ts` so they unit-test without DB/email wiring
  (the coverage include is scoped to it).
- Read env via `process.env` directly — packages can't import the app's `env.ts`.
- Every email-dependent feature gates on `isEmailConfigured()`.
- `role` is deliberately NOT in `additionalFields` — change roles only via
  `setUserRole`/direct DB write
  ([auth/rbac-admin.md](../../docs/context/auth/rbac-admin.md)).
- `@better-auth/passkey` is exact-pinned in lockstep with `better-auth` core.
