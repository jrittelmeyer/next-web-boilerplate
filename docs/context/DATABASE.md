# Database

> When to load: schema changes, writing queries, running migrations, Drizzle patterns.

## Setup

- ORM: Drizzle ORM
- CLI: drizzle-kit (migrations, Drizzle Studio)
- DB: PostgreSQL (local via docker-compose, production via connection string)
- Package: `@repo/db` (`packages/db/`)

## Package Structure

```text
packages/db/
  src/
    schema/           — one file per domain; auth.ts (built) + your own (e.g. posts.ts)
      index.ts        — re-exports every schema file (the @repo/db/schema barrel)
    client.ts         — pg Pool + drizzle() instance
    index.ts          — re-exports: db client, schema, types
  drizzle/migrations/ — generated SQL migrations + meta/ journal (committed to git)
  drizzle.config.ts   — drizzle-kit config
  package.json
  tsconfig.json
```

## Schema Conventions

- Table names: `snake_case` plural (e.g., `posts`, `post_comments`)
  - **Exception:** the Better Auth tables (`user`, `session`, `account`,
    `verification` in `schema/auth.ts`) **and** the `organization()`-plugin tables
    (`organization`, `member`, `invitation` in `schema/organization.ts`) are singular
    with camelCase Drizzle keys — Better Auth's required defaults. See [AUTH.md](AUTH.md).
    Don't copy this style for your own domain tables.
- Column names: `snake_case`
- Primary keys: `id` as UUID with `defaultRandom()`
- Timestamps: `createdAt` and `updatedAt` on every table
- Foreign keys: explicit with `references()`, cascade delete where appropriate
- Indexes: declared in the schema file (array-form third argument to `pgTable`).
  Postgres auto-indexes only PKs and `unique()` columns — FK referencing columns
  and query-shaped composites are on you (see "Indexes" under the posts example)
- One domain per schema file; import and combine in `src/index.ts`

## Example Schema — `posts` (the copy-me entity, Step 28)

`posts` (`packages/db/src/schema/posts.ts`) is the worked example domain entity —
the end-to-end template to copy for your own tables. It follows the repo convention
(snake_case-plural table name, `id` UUID, `created_at`/`updated_at`) and foreign-keys
into the Better Auth `user` table (note: its `id` is `text`, not `uuid`):

```typescript
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organization";

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Multi-tenancy (Tier 4 · Band 4). NULLABLE — NULL = personal workspace, so a
    // zero-org clone behaves as before (no backfill). SET NULL on org delete orphans
    // (never nukes) the author's posts back to personal. See "Org scoping" below.
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // org_id LEADS the keyset composite — post.list is always scoped (= $1 or IS NULL),
    // both valid leading btree predicates, so one index serves filter + ORDER BY. See below.
    index("posts_org_id_created_at_id_idx").on(
      t.organizationId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("posts_author_id_idx").on(t.authorId), // FK columns aren't auto-indexed
  ],
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
```

The full vertical slice it threads through: schema + migration (here) →
cursor-paginated `post.list` tRPC query → `createPost`/`updatePost`/`deletePost`
Server Actions (which index / de-index into Meilisearch on write) → the `/posts` page
→ the `/search` demo → `db:seed`. See [API.md](API.md), [SERVICES.md](SERVICES.md), and
[ARCHITECTURE.md](ARCHITECTURE.md).

`post.list` pages by a `(createdAt, id)` **keyset cursor** (D1), not OFFSET — the
`updatedAt` column is bumped automatically by `$onUpdate` on every `updatePost`. See
[API.md](API.md#cursor-pagination-d1).

### Indexes (P1-1) — what the template teaches

- **Keyset pagination needs a composite index matching its ORDER BY.** `post.list`
  orders by `(created_at DESC, id DESC)`; the composite mirrors that exactly. Without
  it, every page seq-scans and top-N-sorts the whole table
  (measured on 10k rows: 185 buffers / 6.4 ms → 6 buffers / 0.1 ms, Sort node gone).
  Since org scoping (Tier 4 · Band 4, migration 0008) made `post.list` **always**
  filter by `organization_id` (`= $1` or `IS NULL`), the composite now **leads with
  `organization_id`** (`posts_org_id_created_at_id_idx`, superseding the old
  `posts_created_at_id_idx`): a leading equality/IS-NULL predicate lets one btree serve
  both the tenant filter and the `(created_at, id)` keyset sort, and also covers the
  org-delete SET NULL scan (so no separate `organization_id` index is needed).
  The second worked example (P3-5) is `user_created_at_id_idx` (migration 0006):
  `/admin` and `admin.listUsers` page the Better Auth `user` table with the same
  `(created_at DESC, id DESC)` keyset — the planner picks the index for the cursor
  predicate (Index Scan, Sort gone) even at a few hundred rows.
- **`.nullsFirst()` is load-bearing.** Drizzle's bare `.desc()` emits
  `DESC NULLS LAST`, but a plain `ORDER BY … DESC` means `DESC NULLS FIRST` in
  Postgres — the planner treats the mismatch as a different sort order **even on
  NOT NULL columns** (verified on PG 16) and silently ignores the index.
- **Postgres does not auto-index FK referencing columns** (only the referenced
  side's PK/unique). Migration 0005 indexes every FK — `posts.author_id`,
  `session.user_id`, `account.user_id`, `uploads.user_id`,
  `subscriptions.user_id` — without them, user-delete cascades and per-user
  lookups scan each referencing table.
- **Production-scale caveat:** drizzle-kit emits plain `CREATE INDEX`, which
  blocks writes on the table while it builds. Fine at starter scale; for a large
  live table use `CREATE INDEX CONCURRENTLY` instead — it can't run inside a
  transaction, and drizzle-kit has no per-migration transaction opt-out, so run
  it out-of-band (psql) and keep the schema/migration files in sync after.

**Reading the author name:** `post.list` joins the author in with a Drizzle
`leftJoin` on `user` (`authorName: user.name`) rather than a Drizzle `relations()`
definition — that keeps the Better Auth schema untouched. Add `relations()` in
`posts.ts` if you prefer the `db.query.posts.findMany({ with: { author: true } })`
API instead.

## Transactions — atomic multi-table writes (A15)

When one logical operation writes **more than one row that must all land or all fail**,
wrap it in `db.transaction`. The example entity's edit history is the worked case: every
`createPost` / `updatePost` writes the `posts` row **and** a `post_revisions` row
(`packages/db/src/schema/post-revisions.ts` — an append-only version log) as a single
unit, so a post can never exist without its recorded history, or a revision point at a
post that never committed.

```ts
const created = await db.transaction(async (tx) => {
  const [post] = await tx.insert(posts).values({ … }).returning({ … });
  if (!post) throw new Error("post insert returned no row");
  await tx.insert(postRevisions).values({ postId: post.id, … });
  return post;
});
```

- **Roll back by throwing.** `db.transaction` issues `BEGIN`, runs the callback, then
  `COMMIT`s its resolved value — or `ROLLBACK`s if the callback throws or any statement
  raises (e.g. an FK / `NOT NULL` violation). Both writes commit together or neither does.
- **Use `tx`, not `db`, inside.** Every statement must go through the `tx` handle to run
  in the same transaction; a stray `db.insert(…)` would open its own connection and
  escape the rollback.
- **Keep non-DB side-effects outside.** Search indexing and cache revalidation can't be
  rolled back, so they run **after** the transaction commits (see
  `apps/web/src/server/actions/post.ts`) — a search outage must never undo a committed
  DB write. The action wraps the transaction in `try/catch` and returns the typed
  `ActionResult` error (A7) on abort.
- **Read/authorize first, write in the tx.** The create's duplicate-title check and the
  update's ownership lookup run *before* `BEGIN`; keep the transaction as short as
  possible (holding it open over slow work ties up a pooled connection and invites lock
  contention — doubly so behind a transaction-mode pooler, see Connection pooling below).

Real rollback is a Postgres guarantee a mock can't reproduce, so it's proven against a
live database in `packages/db/__tests__/integration/posts.test.ts` (a revision write that
violates its `post_id` FK aborts the paired post insert — neither row survives).

## Stripe subscriptions (`subscriptions` — implemented, Phase 3 · C4)

`subscriptions` (`packages/db/src/schema/subscriptions.ts`) persists Stripe
subscription state written by the webhook handler
(`apps/web/src/app/api/stripe/webhook/route.ts`). The Better Auth `user.id` is
`text`, so the FK is `text` too; `onDelete: "cascade"` ties a subscription's
lifetime to its user.

```typescript
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(), // Stripe subscription id (sub_…)
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  status: text("status").notNull(), // active | trialing | canceled | past_due | …
  priceId: text("price_id"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

**`stripeCustomerId` lives only here — NOT on the `user` table.** The
Better-Auth-owned `user` schema (see [DECISIONS.md](DECISIONS.md)) stays untouched:
the user↔customer link is carried by this row (`userId` + `stripeCustomerId`) and
written exclusively by the webhook, so there's no Better Auth `additionalFields`
entry for it. `status` is plain `text` (not a typed enum) to keep `@repo/db` free
of any `stripe` import — the handler narrows it to the SDK's
`Stripe.Subscription.Status`.

**How it's populated** (see [SERVICES.md](SERVICES.md) for the handler walk-through):
- `checkout.session.completed` owns the **insert** — it's the only event that
  carries our `userId` (via the Checkout Session metadata that
  `createCheckoutSession` stamps on). The handler reads `userId` + the
  subscription/customer ids off the session, retrieves the subscription for its
  status/price/period, and **upserts** (`onConflictDoUpdate` on `id`, idempotent on
  redelivery).
- `customer.subscription.updated` / `deleted` **update by subscription id** only
  (they don't carry `userId`) — a no-op if no checkout row exists (e.g. a
  subscription created outside this flow). `deleted` arrives as `status: "canceled"`.

> **API-version note:** in the pinned `stripe` API version (`2026-05-27.dahlia`)
> `price` and `current_period_end` live on the subscription **item**
> (`sub.items.data[0]`), not the top-level subscription — read them from there.

**How it's read — entitlement gating (A2).** The table is now *read* for access
control, not just written. `apps/web/src/lib/subscription.ts` exposes
`hasActiveSubscription(userId)`: it reads the user's **newest** row
(`db.query.subscriptions.findFirst`, `orderBy desc(createdAt)` — the same
latest-created reuse policy as `server/actions/billing.ts`), projected to
`{ status, currentPeriodEnd }`, and applies the pure `isSubscriptionActive`
predicate — **`status ∈ {active, trialing}` AND (`currentPeriodEnd` is null OR in
the future)**. It's a **local read only** (no Stripe API call), so gating works
with no Stripe creds. The `/premium` demo route is the worked consumer (three
states: signed-out → sign-in · signed-in-unentitled → `/billing` · entitled →
content). Any Server Component / Server Action / tRPC procedure can reuse the same
call. See [SERVICES.md](SERVICES.md) (Stripe → entitlement gating).

DB-backed coverage: `packages/db/__tests__/integration/subscriptions.test.ts`
(upsert / idempotent redelivery / update-by-id / FK cascade against real Postgres).
Entitlement-logic coverage: `apps/web/src/lib/subscription.test.ts`.

## Uploaded files (`uploads` — implemented, Phase 3 · D9)

`uploads` (`packages/db/src/schema/uploads.ts`) persists Uploadthing uploads — the
upload analog of `subscriptions`. It's written by the file router's
`onUploadComplete` callback (`apps/web/src/lib/uploadthing.ts`) once a file
finishes uploading.

```typescript
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  key: text("key").notNull().unique(), // Uploadthing storage key (idempotency)
  name: text("name").notNull(),
  url: text("url").notNull(), // file.ufsUrl
  size: integer("size").notNull(), // bytes
  type: text("type"), // MIME type (nullable — sometimes empty)
  // …createdAt / updatedAt as on every table
});
```

Unlike `subscriptions` (which uses the Stripe id as its natural PK), files have no
such identifier, so this follows the dominant repo convention — a surrogate `uuid`
`id` (like `posts`). Idempotency rides on `key` (Uploadthing's stable storage key)
instead: `UNIQUE`, so the callback **upserts** (`onConflictDoUpdate` on
`uploads.key`) and a redelivered callback is a no-op rather than a duplicate row.
The callback lets DB errors propagate so a non-2xx makes Uploadthing retry —
at-least-once delivery, no-op on retry. See [SERVICES.md](SERVICES.md) (Uploadthing)
for the callback walk-through.

DB-backed coverage: `packages/db/__tests__/integration/uploads.test.ts`
(persist-and-read / idempotent redelivery / null MIME type / FK cascade against
real Postgres).

**`user.image` is also a persisted upload target** (Band-1 Tier-4, **no migration** — the
column already existed on the Better Auth `user` table). The second file-router route,
`avatarUploader`, writes the caller's avatar URL into `user.image` in its `onUploadComplete`
(and best-effort deletes the replaced file); `removeUserAvatar` (`server/actions/avatar.ts`)
nulls it. Deliberately kept off the `uploads` table — an avatar is single-valued profile
state you replace, not a listed/managed file. See [SERVICES.md](SERVICES.md) (Uploadthing →
`avatarUploader`).

## Organizations / multi-tenancy (`organization` / `member` / `invitation` — Better Auth plugin)

`schema/organization.ts` holds the Better Auth `organization()` plugin's tables. Like the
core auth tables they are **hand-maintained in `@repo/db`** (one migration history;
`@better-auth/cli` is not used — it lags core) and passed to the plugin via the
`drizzleAdapter` `schema` map (see [AUTH.md](AUTH.md) → Organizations and
[DECISIONS.md](DECISIONS.md)). Same naming exception as the auth tables: **singular**
table names + camelCase Drizzle keys; snake_case columns. Shapes match the plugin's model
(verified against the installed `better-auth` version); `updated_at` is added per the
repo's "every table" convention (a DEFAULT covers it, so Better Auth's inserts never set it).

- **`organization`** — `id` (text PK, Better-Auth-generated), `name`, `slug` (**unique**),
  `logo?`, `metadata?` (JSON string), `created_at`/`updated_at`.
- **`member`** — join of `user` ↔ `organization`: `organization_id` + `user_id` (both FK,
  **cascade**), `role` (text, default `member` — the per-org role, see below), timestamps.
  A **`UNIQUE (organization_id, user_id)`** index enforces one membership per user per org
  **and** serves the authz hot path (membership lookup) + `listMembers` (org_id prefix); a
  second `member_user_id_idx` serves `listOrganizations` (a user's orgs) + the user-delete
  cascade. FK columns aren't auto-indexed by Postgres (P1-1).
- **`invitation`** — `organization_id` (FK cascade), `email`, `role?`, `status`
  (default `pending`), `inviter_id` (FK → user, cascade), `expires_at`, timestamps.
  Indexed on `organization_id`, `email`, and `inviter_id`.
- **`session.active_organization_id`** (added to `schema/auth.ts`) — the caller's current
  org; **NULL = personal workspace**, so the app runs unchanged with zero orgs. Written
  only by the plugin (`input: false`); never a client-settable field.

**Per-org roles vs. the platform `user.role`.** `member.role` (`owner`/`admin`/`member`,
exported as `ORG_ROLES`/`OrgRole`) is the **membership** role, orthogonal to `user.role`
(`user`/`admin`, the **platform** role that gates `/admin`). Kept as plain text (Better Auth
allows comma-joined multi-roles), same posture as `ROLES`. **Teams** (`team`/`team_member` +
`session.active_team_id`) and **dynamic runtime roles** (`organization_role`) are the
plugin's optional features — **off for v1** (one-flag upgrades, see AUTH.md), so those tables
don't exist yet.

**Org-scoped data — `posts` is the worked example (migration 0008).** `posts.organization_id`
(nullable FK → `organization`, **SET NULL** on org delete) scopes a post to a tenant; **NULL =
personal workspace**, so nothing to backfill on a zero-org clone. `uploads` and `subscriptions`
stay **per-user** (avatars/personal files aren't tenant data; per-org billing is the deferred
Phase-5 upgrade). Scoping/authz logic (authoritative active-org + fresh member-role reads) lives
in `apps/web/src/lib/organization.ts`; see [API.md](API.md) → Org-scoped reads & writes.

## Two-factor auth (`two_factor` — Better Auth plugin, migration 0009)

`schema/two-factor.ts` holds the Better Auth `twoFactor()` plugin's one table, on the same
hand-maintained-in-`@repo/db` footing as the auth/org tables (singular name + camelCase keys;
snake_case columns; shape verified against the installed `better-auth`; `updated_at` added per
the "every table" rule with a DEFAULT so plugin inserts skip it). See [AUTH.md](AUTH.md) →
Two-factor authentication and [DECISIONS.md](DECISIONS.md) → Two-factor.

- **`two_factor`** — `id` (text PK), `secret` (base32 TOTP secret), `backup_codes` (encrypted,
  newline-joined single-use recovery codes), `user_id` (FK → `user`, **cascade**), `verified`
  (boolean, default `true` — set `false` between `enable()` and the first `verifyTotp()`, which
  is what makes an abandoned enrollment a no-op), `created_at`/`updated_at`. `secret` and
  `backup_codes` are plugin-side `returned: false` (never serialized to the client; the secret
  only crosses inside the one-time enroll `totpURI`). One load-bearing index —
  `two_factor_user_id_idx` — because every verify/disable/regenerate and the user-delete cascade
  resolve the row by `user_id`, and Postgres doesn't auto-index FK columns (P1-1).
- **`user.two_factor_enabled`** (added to `schema/auth.ts`, next to the RBAC `role`) — a
  plugin-managed boolean (`input: false`, default `false`); the login form's session gate reads
  it. Flipped `true` by the first successful `verifyTotp()`, back to `false` by `disable()`.

## Passkeys (`passkey` — Better Auth plugin, migration 0012)

`schema/passkey.ts` holds the `@better-auth/passkey` plugin's one table, on the same
hand-maintained-in-`@repo/db` footing as the auth/org/2FA tables (registered in the
`drizzleAdapter` schema map **aliased `passkeyTable`** — the alias avoids clashing with
the plugin's `passkey` model name). It stores each WebAuthn credential: `id` (text PK),
`name?` (user label), `public_key` (COSE verification key), `user_id` (FK → `user`,
**cascade**), `credential_id` (the authenticator's opaque id — the sign-in lookup key),
`counter` (WebAuthn signature counter), `device_type`, `backed_up`, `transports?`,
`aaguid?`, timestamps. Two load-bearing indexes: `passkey_user_id_idx` (FK columns
aren't auto-indexed, P1-1 — the cascade + per-user list) and `passkey_credential_id_idx`
(every passkey sign-in resolves the row by it). `publicKey`/`credentialID` never reach
the client (redacted in the data export too). See
[AUTH.md](AUTH.md#passkeys--webauthn-tier-4--band-3).

## Audit log (`audit_log` — security-event trail, migration 0011)

`schema/audit-log.ts` is the queryable trail behind the security-relevant events that
previously only emitted a fire-and-forget log line. Written by the shared, best-effort
`recordAuditEvent()` helper (`@repo/db`) from four sites — an admin role change, and
account deletion / email-change completion / sign-in (see
[AUTH.md](AUTH.md#persisted-audit-trail--audit_log-b2) for the event table).

- **`audit_log`** — `id` (uuid PK), `action` (text, typed to an `AuditAction` union in the
  helper but **not** a `pgEnum`, same one-line-to-extend posture as `user.role`), `actor_id`
  (who did it), `target_id` (who it happened to), `metadata` (**jsonb** — action-specific:
  `{ oldRole, newRole }`, `{ oldEmail, newEmail }`, `{ ip, userAgent }`), `created_at`.
- **`actor_id` / `target_id` are FK-less `text` — deliberately.** An audit record must
  **outlive** the users it references: a cascading FK would erase the trail when the account
  is deleted, and the `user.deleted` row is inserted in `deleteUser.afterDelete` — *after* the
  `user` row is gone — so an FK would make the audit insert fail its own constraint. The
  `@repo/db` integration test asserts exactly this (an event for a nonexistent user still
  inserts). Denormalized ids are the standard audit-table shape.
- **Indexes** — `audit_log_created_at_idx` (**DESC**) for the "recent events, newest-first"
  read (a trail/export); `audit_log_target_id_idx` for "everything that happened to user X".
  `actor_id` is left unindexed until a by-actor read exists.
- **Read UI** — the admin-only `/admin/audit` page reads this table newest-first (keyset via
  the `created_at DESC` index; resolves `actor_id`/`target_id` → email with `LEFT JOIN`s). See
  [AUTH.md](AUTH.md#persisted-audit-trail--audit_log-b2).
- **PII posture** — unlike the external `@logtail` sink (IDs only), this table is the app's
  **own** Postgres (already holds `user.email`), so recording old→new email here is safe and
  is the point of the record.

## Email suppressions (`email_suppressions` — do-not-send list, migration 0016)

`schema/email-suppressions.ts` is the do-not-send list behind bounce/complaint
handling (path-to-100 #8): written by the signature-verified `/api/resend/webhook`
route via `recordEmailSuppression()`, consulted by `@repo/email`'s `send()` via
`isEmailSuppressed()` — both helpers live in `@repo/db` (`src/email-suppressions.ts`)
because writer and reader sit in different packages, the `recordAuditEvent` precedent.
See [SERVICES.md](SERVICES.md#bounce--complaint-handling-path-to-100-8).

- **`email_suppressions`** — `id` (uuid PK), `email` (text, **NOT NULL UNIQUE**,
  stored lowercase — the helpers normalize, so the unique constraint doubles as the
  lookup index), `reason` (text, typed to the `SuppressionReason` union
  `bounce | complaint | provider` in the helper but **not** a `pgEnum` — the
  `audit_log.action` posture), `detail` (the provider's message), `email_id` (the
  Resend send id), `created_at` (FIRST suppressed), `last_event_at` (latest event —
  the upsert refreshes reason/detail/email_id/last_event_at and keeps created_at).
- **`email` is FK-less — deliberately.** A suppression is about the ADDRESS, not an
  account: it must survive user deletion, and most suppressed addresses (org invites,
  sign-up typos) never had a `user` row at all. Same denormalized posture as `audit_log`.
- **Upsert semantics** — `onConflictDoUpdate` on the unique `email`, so a redelivered
  webhook event (Resend retries on non-2xx) is idempotent. `last_event_at` uses the
  **DB clock** (`now()`), matching the column default — mixing the app clock in let
  the timestamp run backwards under clock skew (caught by the integration test).
- **Write posture** — unlike best-effort `recordAuditEvent`, `recordEmailSuppression`
  **throws** on failure: the webhook route 500s and the provider redelivers
  (at-least-once), which is what you want for a dropped suppression.
- **Un-suppress** — delete the row (recipe in SERVICES.md → Resend).
- DB-backed coverage: `packages/db/__tests__/integration/email-suppressions.test.ts`
  (case-insensitive round-trip, idempotent upsert, latest-event refresh).

## Notifications (`notifications` — realtime SSE example, migration 0015)

`schema/notifications.ts` is the **persisted backbone** of the realtime notifications
example (Tier 4 · A22). It's the durable record; the live SSE push is an enhancement on
top (see [API.md](API.md#realtime--server-sent-events-sse-tier-4--a22)), so the feature
degrades cleanly to "refresh to see new" if the stream is stripped.

- **`notifications`** — `id` (uuid PK), `user_id` (text FK → `user`, **cascade** — a
  deleted user's notifications go with them), `type` (text, typed to a
  `NotificationType` union — the `audit_log.action` precedent: add a kind with no `ALTER
  TYPE`), `body` (text), `read` (boolean, default `false`), `created_at`. **No
  `updated_at`** — a notification is immutable except for the single `read` flip, which
  `read` captures.
- **One index** — `notifications_user_id_created_at_id_idx` on `(user_id, created_at DESC
  NULLS FIRST, id DESC NULLS FIRST)`: `user_id` leads (every read is `WHERE user_id = $1`),
  then the keyset sort columns, so it serves the `notification.list` read **and** the
  user-delete cascade scan in one index. The `.nullsFirst()` matches the `posts` index —
  Drizzle's bare `.desc()` emits `NULLS LAST`, which the planner treats as a different sort
  and would skip the index (see the `posts` note above).
- **Publish** — writes broadcast via `notify()` (`SELECT pg_notify(...)`, parameterized);
  the app-side LISTEN bus fans out to open SSE streams. Transport + serverless caveats:
  [API.md](API.md#realtime--server-sent-events-sse-tier-4--a22) /
  [DEPLOYMENT.md](DEPLOYMENT.md#realtime-sse--serverless-caveat-tier-4--a22).

## Rate-limit storage (`rate_limit` — Better Auth limiter store, migration 0013)

`schema/rate-limit.ts` backs Better Auth's built-in auth-endpoint rate limiter (set via
`rateLimit.storage: "database"` in `packages/auth/src/auth.ts`) so its counters are **shared
across instances and survive a restart** — in-memory storage is per-instance and silently
stops enforcing once you scale horizontally. See
[AUTH.md](AUTH.md#multi-instance-storage) for the why.

- **`rate_limit`** — `id` (text PK), `key` (text **unique** — the `ip:path` bucket), `count`
  (integer — requests in the current window), `last_request` (**bigint** — epoch **ms**, which
  overflows a 32-bit int). Field names mirror Better Auth's model exactly; the table is
  registered in the `drizzleAdapter` schema map (aliased `rateLimitTable`).
- **Better Auth owns every read/write** — an **atomic check-and-increment** `consume` keyed by
  `key` (a guarded `UPDATE`, so enforcement is strict under concurrency, not best-effort), plus
  background pruning of expired rows. Correctness is guaranteed by the limiter exercising the
  table (the auth-schema-ownership convention — [DECISIONS.md](DECISIONS.md)), so there's no
  hand-written CRUD and no `@repo/db` test beyond the schema itself.
- **No `created_at`/`updated_at`** — the one documented exception to the timestamp convention:
  these are ephemeral, auto-pruned counter rows, not domain records, and `last_request` already
  is the only time column the limiter needs.
- **Higher throughput** → wire Better Auth `secondaryStorage` (Redis/Upstash) and it becomes
  the limiter store automatically (drop the explicit `storage: "database"`); this table is then
  unused. See [AUTH.md](AUTH.md#multi-instance-storage).

## Admin plugin columns (ban + impersonation)

The Better Auth `admin()` plugin (Tier 4 · Band 4, migration 0014) adds **no new table** — it
manages the existing `user.role` and adds four columns to `user`/`session` (added to
`schema/auth.ts`, hand-maintained like the rest of the auth schema). Adopted to **augment** the
hand-rolled RBAC (ban + impersonation only); see
[AUTH.md](AUTH.md#admin-plugin--ban--impersonation-tier-4--band-4) and
[DECISIONS.md](DECISIONS.md).

- **`user.banned`** (boolean, `NOT NULL DEFAULT false`) / **`user.ban_reason`** (text, nullable) /
  **`user.ban_expires`** (timestamptz, nullable — NULL = a permanent ban) — a live ban. The `banUser` Server Action
  writes these **directly** (fresh-gated, not via the plugin endpoint — see AUTH.md), and the
  plugin's `session.create.before` hook reads `banned` **fresh** at sign-in to block the user
  (auto-lifting an elapsed `ban_expires`). All `input: false` (plugin-/action-managed, never
  client-set). No index — the write and the sign-in check both resolve the row by `user.id` (PK).
- **`session.impersonated_by`** (text, nullable) — set on an impersonation session to the
  **acting admin's** user id (NULL on a normal session). The `(dashboard)` layout reads it to
  render the impersonation banner; `stopImpersonating` uses it to restore the admin's original
  session. FK-less `text` like the audit ids (it records *who was acting*, and the plugin, not a
  constraint, manages its lifecycle). Set by `auth.api.impersonateUser`, cleared by
  `stopImpersonating`.

## Migration Workflow

```bash
# Generate a migration after schema changes
pnpm --filter @repo/db db:generate

# Apply migrations to the database
pnpm --filter @repo/db db:migrate

# Open Drizzle Studio (visual DB browser)
pnpm --filter @repo/db db:studio

# Push schema directly (dev only, skips migration files)
pnpm --filter @repo/db db:push
```

## Backup, restore & disaster recovery

**Local dev (Dockerized Postgres).** Two scripts wrap `pg_dump` / `pg_restore`, run
**inside** the `postgres` compose service — so the client binaries always match the
server version, nothing needs installing on the host, and it's pure Node child_process
(Windows-safe):

```bash
pnpm --filter @repo/db db:backup                         # dump appdb → backups/<db>-<ts>.dump
pnpm --filter @repo/db db:restore                         # restore the NEWEST dump (overwrites appdb)
pnpm --filter @repo/db db:restore --file backups/x.dump   # restore a specific dump
pnpm --filter @repo/db db:restore --into appdb_scratch    # restore into a scratch DB (inspect safely)
```

- Dumps are **custom format** (`-Fc`), so restore is `pg_restore --clean --if-exists` —
  it **DROPs and recreates every object** in the target. `--into` creates and targets a
  *different* database instead, the safe way to inspect a backup or run a restore drill
  without touching the live dev DB.
- Backups land in the **gitignored `backups/`** dir — **never commit dumps** (they hold
  real row data).
- The dump **excludes the `pgboss` schema** (`--exclude-schema=pgboss`): pg-boss owns and
  rebuilds that schema on `boss.start()` (see below), it's transient queue state — not app
  data — and its *partitioned* tables otherwise make `pg_restore --clean` fail (it can't
  drop an inherited constraint). Your `public` (Drizzle) data is captured in full. Add more
  `--exclude-schema` flags in `src/backup.ts` if you introduce other engine-owned schemas.

**Test your restores.** A backup you've never restored is a hope, not a backup. Periodically
prove it: `db:restore --into appdb_restore_test`, check row counts / spot data, then
`DROP DATABASE appdb_restore_test`. (That exact drill is how these scripts are verified.)

**Production (managed Postgres).** The runtime image has no `drizzle-kit` and shouldn't run
the Docker-based scripts above; back up against the connection string directly with the
standard client tools:

```bash
pg_dump "$DATABASE_URL" -Fc --no-owner --no-privileges --exclude-schema=pgboss > backup.dump
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backup.dump
```

Lean on your provider's **automated backups + point-in-time recovery (PITR)** as the first
line of defense, and keep periodic `pg_dump` logical dumps as an independent, portable second
copy:
- **Neon** — history-based PITR (restore to any point in the retention window) + branch-from-timestamp; retention is plan-dependent.
- **Supabase** — daily backups on paid tiers; PITR is a WAL-archiving add-on.
- **RDS / Cloud SQL** — automated snapshots + PITR via WAL; set the retention window (and, on RDS, enable deletion protection).

Whatever the provider, set a **retention window** and ideally ship dumps **off-provider** — a
backup living only in an account you might lose access to is not disaster recovery.

**Migration rollback.** drizzle-kit migrations are **forward-only** — it generates no `down`
files by design. To undo a bad migration:
1. **Restore from the pre-deploy backup** — the reliable answer for a *destructive* migration
   (dropped column/table): take a backup **before** running `db:migrate` in production, restore
   it if the migration goes wrong.
2. **Roll forward with a compensating migration** — for an additive/reversible change, edit the
   schema back and `db:generate` a new migration that reverts it, rather than hand-editing
   history.
3. **Never** edit an already-applied migration file or delete a row from
   `drizzle.__drizzle_migrations` to "undo" one — the journal and the database would disagree
   and the next `db:migrate` would misbehave.

When a rollback re-adds indexes on a large live table, mind the `CREATE INDEX CONCURRENTLY`
caveat noted under [Indexes](#indexes-p1-1--what-the-template-teaches) (drizzle-kit emits plain
blocking `CREATE INDEX`).

## Background-jobs schema (`pgboss`) — owned by pg-boss, NOT Drizzle (D7)

The `@repo/jobs` background-jobs worker uses **pg-boss**, which creates and migrates
its **own** tables under a dedicated **`pgboss`** schema on `boss.start()` (advisory-
locked, idempotent). This is **outside Drizzle's control on purpose**:

- **No Drizzle migration manages these tables**, and there is **no conflict**:
  `drizzle.config.ts` points at `./src/schema` and drizzle-kit only manages the
  **`public`** schema, so `db:generate`/`db:push`/`db:migrate` never see `pgboss`.
- **Don't add `pgboss` to the Drizzle schema** or try to migrate it — pg-boss owns its
  shape across versions. Treat it as a managed black box (inspect with `db:studio` if
  you like, but don't hand-edit).
- First `boss.start()` (worker OR the web app's first enqueue) creates the schema, so
  it needs a role with CREATE privilege on first run; after that it's read/write only.

See [SERVICES.md](SERVICES.md) → Background jobs and [DECISIONS.md](DECISIONS.md).

## Seeding (`db:seed`)

```bash
pnpm --filter @repo/db db:seed   # idempotent — safe to re-run
```

`packages/db/src/seed.ts` populates the example `posts` entity. It inserts a
deterministic seed author into the `user` table, then **8 posts** owned by it — both
with **fixed primary keys + `onConflictDoNothing`**, so re-running is a no-op (no
duplicates). FK order matters: the author goes in before its posts. The posts carry
explicit, ascending `createdAt` values so a **fresh** seed paginates deterministically
(8 rows > the 5-per-page list ⇒ "Load more" is exercised out of the box). Caveat of
`onConflictDoNothing`: re-seeding a DB that already has these rows keeps their
*original* timestamps — only a clean DB gets the staggered dates.

- **Runner:** `tsx` (a devDep of `@repo/db`) runs the TypeScript directly so the
  seed uses the real Drizzle insert API (typed, the pattern you'd copy). `dotenv`
  loads the root `.env` first; the DB client is pulled in via dynamic `import()`
  **after** that, because the pool reads `DATABASE_URL` at construction and ESM
  hoists static imports.
- **Search:** the seed is **DB-only** — `@repo/db` stays pure Drizzle/Postgres
  (no Meilisearch import). Seeded rows aren't searchable until indexed: run the
  **"Reindex posts from database"** action on `/search`, or create posts via the
  `/posts` UI (which indexes on write). See [SERVICES.md](SERVICES.md).

## Database Client

The DB client is created once and exported from `packages/db/src/index.ts`. Always import from `@repo/db`, never instantiate Drizzle directly in the app.

```typescript
import { db } from "@repo/db";
import { user } from "@repo/db/schema";

const found = await db.query.user.findFirst({
  where: eq(user.email, email),
});
```

## Connection pooling (managed Postgres & serverless)

The client is a single node-postgres `Pool` ([`client.ts`](../../packages/db/src/client.ts)) —
**one pool per Node process**, created lazily (it connects on first query, not on construction).
Its size is `pg`'s built-in default of **`max: 10`** connections; the app never overrides it.
That default is fine for a **long-lived server** (Docker / VPS / PaaS), which reuses the pool
across every request. Two things change the calculus: your **total connection budget** and
**serverless**.

**Sizing.** Postgres enforces a hard `max_connections`, and managed tiers keep it small (Neon
free ≈ 100 with much reserved; small Supabase ≈ 60). Your budget is the **sum of every pool's
`max`, across every process and every running instance**, plus headroom for `db:migrate`,
`db:studio`, and the **pg-boss worker** (which keeps its *own* pool). Rule of thumb:
`Σ(pool.max) × instances ≤ max_connections − headroom`. To cap it, set **`DB_POOL_MAX`** — an
optional env var threaded into the `Pool` in [`client.ts`](../../packages/db/src/client.ts) as
`max`. Unset (or empty) leaves pg's built-in default, so the starter runs with zero required
config; set a positive integer to size the pool for your budget (a set-but-invalid value fails
loud at startup). It sizes **this app pool only** — the pg-boss worker keeps its own pool, so
count both in the `Σ(pool.max)` sum above.

**Serverless is the trap.** On Vercel / Lambda-style platforms each concurrent invocation is
its own process → its **own** `Pool` → up to `max` connections *each*. A burst of N cold
functions opens ≈ `N × max` connections and exhausts Postgres almost immediately. Don't point
serverless functions straight at Postgres — put a **pooler** in front (shrinking `max` only
delays the exhaustion).

**Poolers.** An external pooler (PgBouncer, or your provider's built-in) keeps a small set of
real Postgres connections and multiplexes many clients over them:
- **Neon** — use the **pooled** connection string (the `…-pooler.…` host); it's PgBouncer in
  transaction mode.
- **Supabase** — the pooler endpoint on port **`6543`** (transaction mode); `5432` is a direct
  connection.
- **Self-managed** — PgBouncer in `transaction` pool mode in front of the instance.

**Transaction-mode caveat (matters for this stack).** Transaction pooling returns the
connection to the pool after **each transaction**, so anything assuming a stable session
breaks: server-side **named prepared statements**, `LISTEN/NOTIFY`, `SET`/session GUCs, and
advisory locks held across statements. Concretely here:
- **App queries are fine.** node-postgres sends parameterized queries over the extended
  protocol *without* named prepared statements, so ordinary drizzle queries work through a
  transaction pooler. Just avoid drizzle's **`.prepare()`** unless the pooler supports it
  (e.g. PgBouncer ≥ 1.21 `max_prepared_statements`) — this template doesn't use it.
- **Point the pg-boss worker at a direct (or session-mode) connection.** pg-boss relies on
  `LISTEN/NOTIFY`, advisory locks, and a maintenance loop, which a transaction pooler breaks.
  Give the **worker** the direct `DATABASE_URL` (or a session-mode pooler port) even when the
  web app goes through the transaction pooler. See [SERVICES.md](SERVICES.md) → Background jobs.
- **The realtime SSE listener breaks the same way (Tier 4 · A22).** The web app's notification
  bus holds one dedicated `LISTEN` connection per instance (`createPgListener`, which opens a
  raw `pg` Client on the same `DATABASE_URL`) — behind a transaction pooler it silently stops
  receiving. Keep the app on a direct/session-mode string if you keep this design, or swap the
  transport — see [DEPLOYMENT.md](DEPLOYMENT.md#realtime-sse--serverless-caveat-tier-4--a22).

See [DEPLOYMENT.md](DEPLOYMENT.md) for where the pooled connection string goes at deploy time.

## Environment Variable

`DATABASE_URL` — PostgreSQL connection string. Validated at startup by `@t3-oss/env-nextjs`. See [DEPLOYMENT.md](DEPLOYMENT.md) for format.
