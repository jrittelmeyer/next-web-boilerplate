# RBAC, admin plugin & audit log

> When to load: platform roles, the `/admin` operator console, ban + impersonation, the `audit_log` trail. Canonical home of the admin-plugin **staleness crux** (DECISIONS.md and SECURITY.md point here).

## RBAC (Step 21)

A minimal, hand-rolled role model — and, deliberately, **the authoritative authorization
boundary** even now that the Better Auth `admin()` plugin is wired in. The plugin is
**adopted to _augment_ this model, not replace it**: `lib/rbac.ts`'s
fresh-DB `requireAdmin`/`adminProcedure` and the audited `setUserRole` action stay the
role-setter and gate, and the plugin is taken only for the two capabilities it uniquely
adds — user **ban** and **impersonation** (see [Admin plugin — ban &
impersonation](#admin-plugin--ban--impersonation-tier-4--band-4) below). Why augment rather
than hand the whole gate to the plugin: every `admin()` endpoint authorizes off the
**cookie-cached session role** (≤5 min stale via the
[session cookie cache](core.md#session-cookie-cache)), whereas this model reads the role
**fresh from the DB** on every check — so the fresh path stays the boundary and the
plugin rides on top for the session-cookie mechanics only it can do. (This is the
**platform** role layer; the org-membership layer is orthogonal — see
[core.md → Two role layers](core.md#two-role-layers-this-is-the-key-model).)

### The `role` column

`user.role` is a plain `text` column (typed to `Role` in Drizzle) — **not** a
Postgres enum — `NOT NULL DEFAULT 'user'`. The role set is defined once in
`packages/db/src/schema/auth.ts`:

```typescript
export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];
```

`text` (over `pgEnum`) so adding a role later is a one-line edit with no `ALTER TYPE`
migration. `@repo/validators` keeps a matching `z.enum(["user","admin"])`
(`setUserRoleSchema`) — it can't import `@repo/db` (that package stays import-pure),
so the literal list is duplicated there with a sync comment.

### Authoritative role read (not the session)

The role check reads **fresh from the DB**, never from `session.user.role`. The
session `cookieCache` (5 min — [core.md](core.md#session-cookie-cache)) means a role on
the session can be stale that long, so we treat the cookie-cached session as proof of
*identity* and read the role from Postgres for *authority*. A demotion takes effect on
the **next request**, not up to 5 min later.

Consequently `role` is **not** in Better Auth's `additionalFields`: no auth API can
read or write it, so the only role writers are direct DB access and the admin-gated
`setUserRole` action. `packages/auth` is untouched by the RBAC layer itself.

`apps/web/src/lib/rbac.ts` (`server-only`) holds the helpers:

- `getUserRole(userId): Promise<Role | null>` — the authoritative DB read.
- `requireAdmin(): Promise<{ session, role } | null>` — resolves the session, then
  reads the role; `null` unless the caller is an admin. For Server Components /
  Server Actions.

### Where the check lives (three layers)

| Surface | Guard | On failure |
| --- | --- | --- |
| tRPC | `adminProcedure` (builds on `protectedProcedure`) | `UNAUTHORIZED` / `FORBIDDEN` |
| Server Action | `requireAdmin()` (e.g. `setUserRole`) | typed `{ error: "Forbidden" }` |
| Page (`/admin`) | `requireAdmin()` in the Server Component | `notFound()` (404) |
| Proxy (`proxy.ts`) | cookie presence only (optimistic) | redirect to `/login` |

The proxy can't know a role at the edge (no DB), so it only does the cookie-present
redirect for `/admin` (fast UX); a signed-in non-admin passes it and is then 404'd by
the page. **Authorization is always the DB-backed check**, never the proxy.

The `/admin` page lives under the `(dashboard)` route group, so it inherits the
app shell (header / nav / user menu); the URL stays `/admin`. The shell renders an
**Admin nav link only for admins** — `getUserRole(session.user.id)` in the layout, the
same fresh DB read `requireAdmin()` trusts, so a demotion hides the link on the next
request. The page lists users and changes each one's role through the `setUserRole`
Server Action via the client `RoleControl` — optimistic (React 19 `useOptimistic`: the
button flips immediately, then `revalidatePath("/admin")` reconciles the row, reverting
on a typed error). It's the Server-Action flavour of optimistic UI, distinct from
`/posts`, which patches the TanStack infinite-query cache around tRPC mutations.

### Promoting an admin (never self-service)

Every new user is `role = 'user'`. The **first** admin is promoted out-of-band —
direct SQL against the DB (the
[`db:seed` helper](../DATABASE.md#seeding-dbseed) exists but seeds the example `posts`
entity, not roles):

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'you@example.com';
```

Once a first admin exists, they can promote others via the `setUserRole` Server
Action. There is no API or sign-up path that lets a user set their own role.

**Anti-lockout:** `setUserRole` refuses to change the *caller's own* role
(typed `{ error }`), and the UI renders "(you)" instead of a button on that row. A
demotion is therefore always performed by a *different* admin, so the last admin
can't accidentally strip the app of every admin and lock everyone out of `/admin`.

**Audit log:** every applied role change emits a structured
`log.info("admin.setUserRole", { actorId, targetId, oldRole, newRole })` through the
existing `@logtail/next` pipeline (BetterStack when configured, console otherwise —
see SERVICES.md), so privileged mutations are traceable. IDs only — no email PII in
the log sink. The pre-update role read also surfaces a nonexistent target as a typed
`{ error: "User not found" }` instead of silently "succeeding" on a zero-row update.
Denied attempts aren't logged (they return typed errors); a fork wanting a fuller
audit posture adds a `log.warn` on the deny paths.

### Persisted audit trail — `audit_log` (B2)

The `log.info` line above is fire-and-forget to an external sink — good for real-time
alerting, but **not queryable** ("show me every role change for user X" / "every sign-in
for this account"). The queryable counterpart: a persisted **`audit_log`** table
(`@repo/db`, migration 0011) written by a single shared helper,
**`recordAuditEvent({ action, actorId?, targetId?, metadata? })`**, exported from `@repo/db`
so both the app and the `@repo/auth` callbacks can call it (auth can't import from
`apps/web`). The security-relevant events recorded:

| `action` | Where it's written | `metadata` |
| --- | --- | --- |
| `user.role_changed` | `setUserRole` action (alongside the `log.info`) | `{ oldRole, newRole }` |
| `user.deleted` | `deleteUser.afterDelete` (auth.ts) | — |
| `user.email_changed` | `afterEmailVerification` hop-2 branch (auth.ts) | `{ oldEmail, newEmail }` |
| `user.signed_in` | `databaseHooks.session.create.after` (auth.ts) | `{ ip, userAgent }` |
| `user.banned` | `banUser` action (Admin plugin) | `{ reason? }` |
| `user.unbanned` | `unbanUser` action (Admin plugin) | — |
| `user.impersonated` | `impersonateUser` action (Admin plugin) | — |
| `user.impersonation_stopped` | `stopImpersonating` action (Admin plugin) | — |

`user.role_changed` upgrades a pre-existing `log.info` emit site; **sign-in** is a genuinely
new signal (a session row is inserted on every real sign-in — email/OAuth/post-2FA — while a
cookie-cache refresh reuses the row, so it doesn't fire on idle refreshes); the four
Admin-plugin rows are written by the `server/actions/admin.ts` mutations (see
[Admin plugin — ban & impersonation](#admin-plugin--ban--impersonation-tier-4--band-4)).

Two design choices worth knowing:

- **`recordAuditEvent` is best-effort by contract** — it swallows its own failures to
  stderr and returns, so a slow or down audit write can never fail a role change or block a
  login. Callers don't wrap it.
- **`actor_id` / `target_id` are FK-less `text`, on purpose.** An audit record must outlive
  the users it references: a cascading FK would erase the trail on account deletion (the
  opposite of the point), and the `user.deleted` row is written *after* the `user` row is
  gone, so an FK insert would fail its own constraint. See
  [DATABASE.md](../DATABASE.md#audit-log-audit_log--security-event-trail-migration-0011)
  for the table shape.

Unlike the external log sink (IDs only), `audit_log` lives in the app's **own** Postgres —
which already stores `user.email` — so recording old→new email on a change is safe and is
the point of that record. `action` is open `text` (typed to an `AuditAction` union in the
helper, but not a `pgEnum`) so a fork adds an event with a one-line edit and no `ALTER TYPE`.
An admin-only read surface lives at **`/admin/audit`** (`app/[locale]/(dashboard)/admin/audit/page.tsx`)
— the trail newest-first, keyset-paginated exactly like `/admin` (reuses `lib/keyset-cursor`;
served by `audit_log_created_at_idx`). It resolves `actor_id`/`target_id` to an email via two
aliased `LEFT JOIN`s on `user`, falling back to the raw id when the user is gone (the whole
point of the FK-less columns). `lib/audit-format.ts`'s pure `describeAuditEvent()` maps each
event to a label + one-line detail (`Role changed · user → admin`, `Signed in · from <ip>`, …).
Same `requireAdmin()` guard as `/admin` (non-admins 404). The raw table is still there for
SQL / export; filters (by action/actor) are the obvious next extension.

### Graceful degradation

With no admin promoted (the default for a fresh clone), `adminProcedure` returns
`FORBIDDEN` for everyone and `/admin` 404s — the app still builds, signs up, and runs
normally on the default `user` role.

## Admin plugin — ban & impersonation (Tier 4 · Band 4)

The Better Auth **`admin()`** plugin is wired in `packages/auth/src/auth.ts`
(`admin({ adminRoles: ["admin"] })`, kept **above** the must-be-last `nextCookies()`), with
the matching `adminClient()` in `client.ts`. It's adopted to **augment** the [RBAC](#rbac-step-21)
model, **not replace it** — `requireAdmin()` + the audited `setUserRole` action stay the
authoritative gate and role-setter — and is taken only for the two capabilities it uniquely
adds: user **ban** and **impersonation**. It manages the existing `user.role` column and adds
four columns (shapes reconciled against the installed dist; `db:generate` emitted migration
0014 — four columns, no new table): `user.banned` / `banReason` / `banExpires` +
`session.impersonatedBy` (see
[DATABASE.md](../DATABASE.md#admin-plugin-columns-ban--impersonation)). `adminRoles: ["admin"]`
matches `ROLES` exactly, so the plugin's default access-control roles (`admin`/`user`) fit with
**no custom `ac`**. Defaults kept: `defaultRole "user"`, impersonation session 1 h, and
`allowImpersonatingAdmins` **false** (an admin can't impersonate another admin — no lateral
privilege capture). create-user / set-password / set-email / remove-user / admin-session
management + custom AC are documented, unused extensions — kept off so the augment surface
stays minimal.

**The staleness trade-off (the crux).** Every `/admin/*` endpoint authorizes off the
**cookie-cached session role** (`getSessionFromCtx`, ≤5 min stale via the
[session cookie cache](core.md#session-cookie-cache)), not a fresh DB read. Handing the
whole gate to the plugin would regress the repo's boundary in both directions — a demotion
would take up to 5 min to bite, and a *just-promoted* admin would be wrongly refused. That
single fact shapes both features differently:

### Ban / unban — fresh-gated *direct DB writes* (not the plugin endpoint)

`banUser` / `unbanUser` (`server/actions/admin.ts`) gate with the fresh-DB `requireAdmin()` and
write the ban columns **directly**, rather than calling `auth.api.banUser`. Why not the endpoint:
it re-authorizes off the stale session role, which would wrongly **forbid a just-promoted admin**
whose session still says `role:"user"` (verified — a promote-then-ban E2E failed exactly that
way). `requireAdmin()` already read the role fresh, so the action owns the write and keeps the
strict, fresh gate:

- `banUser` sets `banned/banReason/banExpires` **and revokes the target's live sessions
  immediately** (`db.delete(session)` — a ban must sign them out now, not only block future
  sign-ins). Anti-lockout: an admin can't ban themselves. Takes an optional `banReason`
  (surfaced in the audit trail) and an optional `banExpiresIn` in seconds (omitted = a
  permanent ban).
- The plugin's own `session.create.before` hook still enforces the ban **at sign-in** — it reads
  `banned` **fresh**, blocks with `bannedUserMessage`, and **auto-lifts** an elapsed `banExpires`
  at the next sign-in attempt. So a direct write is equivalent to the endpoint minus the stale
  re-check.
- `unbanUser` clears the columns; no self-check needed (a banned admin can't sign in to reach it).
- The `BanControl` on each `/admin` row is optimistic (React 19 `useOptimistic`), the same
  posture as `RoleControl`.

### Impersonation — the plugin's session-cookie swap (carries the ≤5-min window)

Impersonation is a **session-cookie swap** only the plugin can perform, so unlike ban it **must**
go through `auth.api.impersonateUser` — and therefore inherently carries the ≤5-min
stale-session-role window. It's wrapped in a fresh-gated, audited Server Action to keep the
repo's posture — this transport was chosen over the raw client method because the fresh gate
blocks a just-*demoted* admin the plugin alone would keep trusting for ≤5 min, and it produces
the audit rows the raw endpoint doesn't:

- `impersonateUser` (`server/actions/admin.ts`) is `requireAdmin()`-gated + audited, then calls
  the endpoint. On success the endpoint deletes the admin's session cookie, stashes it in a signed
  `admin_session` cookie, and sets the target's — `nextCookies()` flushes that swap from the
  Server Action; the `ImpersonateControl` then does a **full navigation** (`window.location`) so
  the app reloads under the new session.
- **The residual — accepted, documented security posture.** Because the endpoint reads the
  session role, a **just-promoted admin must sign out and back in first** (their session still
  says `user`) — the action surfaces the endpoint's `FORBIDDEN` as a typed error, never a 500.
  The ≤5-min window is accepted rather than worked around (only the plugin can do the cookie
  swap); the fresh `requireAdmin()` gate still earns its place by blocking a **just-demoted**
  admin. `allowImpersonatingAdmins` stays false (no lateral privilege capture), and
  `ImpersonateControl` also hides on the caller's own row and on admin-role rows.
- While impersonating, `session.session.impersonatedBy` is set (the acting admin's id); the
  `(dashboard)` layout renders an **app-wide banner** ("Impersonating `<email>` — Stop
  impersonating"). `stopImpersonating` is the symmetric swap-back — deliberately **not**
  `requireAdmin()`-gated (during impersonation the caller session *is* the target, not an admin);
  it keys off `impersonatedBy`, restores the admin's session from the `admin_session` cookie, and
  full-navs back to `/admin`.

**Anti-lockout throughout:** an admin can't ban or impersonate themselves, and can't change
their own role — so the last admin can never lock the app out of `/admin`.

### Rate limits & audit

The `/admin/*` endpoints are already admin-gated (not an anonymous brute-force surface), so their
custom rate-limit rules are abuse-limiting for a compromised or misbehaving admin session, not a
login defense: `set-role`/`ban-user`/`unban-user` 20/min, `impersonate-user` 10/min,
`stop-impersonating` 30/min (loosest — it's the safe exit); canonical block in
[core.md → Rate limiting](core.md#rate-limiting-auth-endpoints). All four mutations record to
the [`audit_log`](#persisted-audit-trail--audit_log-b2)
(`user.banned`/`unbanned`/`impersonated`/`impersonation_stopped`).

This file is the canonical home of the augment-vs-replace + staleness decisions and the
accepted impersonation residual; [DECISIONS.md](../DECISIONS.md) and
[SECURITY.md](../SECURITY.md) point here.
