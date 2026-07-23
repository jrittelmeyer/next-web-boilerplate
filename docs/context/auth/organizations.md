# Organizations / multi-tenancy

> When to load: orgs (teams + per-org membership/roles), invitations, the active-org context, the org UI, per-org billing pointers.

## Organizations / multi-tenancy

Multi-tenancy (teams + per-org membership + per-org roles) is Better Auth's built-in
**`organization()`** plugin — **no new dependency** (it ships inside `better-auth`). The
server plugin is wired in `packages/auth/src/auth.ts` (kept **before** `nextCookies()`, the
must-be-last plugin — [core.md → Plugin tuple order](core.md#plugin-tuple-order-the-conditional-spread-gotcha))
and the matching `organizationClient()` in `packages/auth/src/client.ts`, so Client
Components get typed `authClient.organization.*` methods. The plugin's tables are
hand-maintained in `@repo/db` — see
[DATABASE.md](../DATABASE.md#organizations--multi-tenancy-organization--member--invitation--better-auth-plugin)
for shapes and [DECISIONS.md](../DECISIONS.md) for the four locked decisions.

**Two role layers.** The org `member.role` (`owner`/`admin`/`member`) is orthogonal to the
platform `user.role` — don't conflate them; the canonical table is
[core.md → Two role layers](core.md#two-role-layers-this-is-the-key-model). Org-role checks
read the `member` row **fresh from the DB** (never the cookie-cached session), and the
**creator** of an org is `owner`.

### Active organization

The plugin adds `session.activeOrganizationId` (NULL = **personal workspace**, so a fresh
clone with zero orgs behaves exactly as before). `createOrganization` sets the new org
active; `authClient.organization.setActive({ organizationId })` switches it and **re-issues
the session cookie**. One nuance (the [session cookie cache](core.md#session-cookie-cache),
5 min): a *just-changed* active org isn't visible to a read that hits the cached session —
so any server code that scopes data by active org must resolve it **authoritatively**
(bypass the cache, or take the id from a fresh `setActive`). This is why the server-layer
org context (`orgProcedure` / `lib/organization.ts` — see [API.md](../API.md)) reads
active-org authoritatively rather than trusting `getSession`'s cached value.

### Invitations degrade gracefully (email optional)

`sendInvitationEmail` renders the `@repo/email` `OrganizationInvitation` template and
sends it via Resend. Like every other email here it **degrades gracefully**: with email
unset the send no-ops (logs a skip), but **the invitation row is still created** — so the
members UI can surface a **copyable accept link** (`invitationAcceptUrl` → the app's
`/accept-invitation/[id]` route) and the invite flow works without an email provider. The
accept URL is built in `config.ts` (pure, unit-tested) from `BETTER_AUTH_URL`.

### Organizations UI (step 4)

The whole org UI is **client-driven by Better Auth's reactive hooks** — no bespoke tRPC
query. `authClient.useActiveOrganization()` returns the active org **bundled with its
`members[]` (each joined to `user.{name,email,image}`) and `invitations[]`**, and refetches
automatically after every `/organization*` mutation (create / setActive / invite / remove /
role change / accept); `useListOrganizations()` feeds the switcher; `useSession()` identifies
the caller. Components live in `apps/web/src/components/organization/`; shared shadcn
primitives (`dialog`, `select`) were added to `@repo/ui`.

- **Header workspace switcher** (`org-switcher.tsx`, mounted in the `(dashboard)` layout):
  lists orgs + "Personal", switches via `setActive({ organizationId })` (or `null` → Personal),
  and offers "Create organization…" + "Manage organization". The selected id is held in
  **optimistic local state** so the checkmark/label move instantly — never gated on
  `router.refresh()` committing
  ([core.md → the `router.refresh()` race](core.md#the-next-1629-routerrefresh-race));
  `refresh()` only reconciles server-rendered surfaces (e.g. `post.list` scoping) in the
  background.
- **Create org** (`create-org-dialog.tsx`): a modal form (RHF + `createOrganizationSchema`,
  slug auto-derived from the name) → `organization.create` → `setActive` the new org → route
  to `/organization`.
- **`/organization`** (gated, in `(dashboard)`): members list with role `Select` + remove
  (`updateMemberRole` / `removeMember`), invite form (`inviteMember`), pending invitations with
  a **Copy-link** button (the email-off accept link) + cancel, and a settings/danger zone —
  owner can rename (`update`) / delete (`delete`, type-to-confirm), any non-owner member can
  leave (`leave`). Management controls are gated on the caller's org role **for UX only**;
  Better Auth re-checks authority on every endpoint (see [orgProcedure](../API.md) /
  `lib/organization.ts`).
- **`/accept-invitation/[id]`** (public, in the `(auth)` group so it renders on the centered
  shell and works signed-out): a Server Component reads the invitation + org straight from the
  DB for display, then a client island handles four states — **signed out** (prompt sign-in/up
  as the invited email, returning here via `?redirectTo`), **email match** (Accept →
  `acceptInvitation` → `setActive` → `/organization`), **wrong account** (explain the mismatch,
  offer sign-out), and **invalid / expired / already-used**.

> **a11y gotcha (fixed):** a `DropdownMenu` item that opens a dialog must **not**
> `preventDefault()` its `onSelect` — keeping the modal menu open leaves its `aria-hidden` on
> the rest of the layout after you navigate away (the menu never closes to restore it),
> hiding the destination page from assistive tech until a reload. Let the menu close, then
> open the dialog on the next tick (`org-switcher.tsx`); likewise defer the post-create
> navigation a tick so the dialog's own close commits first (`create-org-dialog.tsx`).

### Caveats & scope

- **Deleting a user does not delete the orgs they belong to.** `organization` has no user
  FK (an org can have many members), so a user delete cascades their `member` +
  `invitation` + `session` rows but **leaves the `organization` row** — an org can outlive
  any single member. A real app that wants sole-owner orgs cleaned up adds that to the
  `deleteUser.beforeDelete` hook — the same pattern the Uploadthing-file and
  Stripe-subscription cleanups use ([account-page.md](account-page.md)); the boilerplate
  leaves the org case as a documented caveat.
- **v1 scope: teams OFF, dynamic runtime roles OFF.** The plugin's `teams` (sub-orgs:
  `team`/`team_member` + `session.activeTeamId`) and `dynamicAccessControl` (runtime custom
  roles: `organization_role`) features are one-flag upgrades (`organization({ teams: {
  enabled: true } })` / `{ dynamicAccessControl: { enabled: true } }` + their tables); left
  off to keep the org-scoped-`posts` example and the members UI clean.
- **Per-org billing is built** (pointers only — mechanics live in
  [SERVICES.md → Stripe](../SERVICES.md) · [DATABASE.md → Stripe subscriptions](../DATABASE.md)):
  `subscriptions` rows are owned by exactly one of user/org; with an active org, `/billing` +
  `/premium` follow the org context and only org owners/admins may check out / open the portal
  (fresh-read role gate via `lib/organization.ts`). **Deleting an org cancels its Stripe
  subscriptions** the same way user deletion does —
  `organizationHooks.beforeDeleteOrganization` captures the ids,
  `afterDeleteOrganization` enqueues the `cancel-stripe-subscriptions` job
  (`packages/auth/src/auth.ts`).
