import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Better Auth `passkey()`-plugin schema (Tier 4 · Band 3 — WebAuthn/passkeys),
 * hand-maintained to match the plugin's expected model — the SAME ownership convention as
 * the core auth tables (auth.ts), the org tables (organization.ts), and 2FA (two-factor.ts):
 * schema lives in `@repo/db` (one migration history), `@better-auth/cli` is NOT used, and
 * correctness is guaranteed by the passkey register/authenticate/list/delete flow exercising
 * the table (see DECISIONS.md → auth-schema ownership). Singular table name + camelCase
 * Drizzle keys are Better Auth's required defaults (the documented snake_case-plural
 * exception); SQL column names stay snake_case.
 *
 * The passkey plugin lives in its OWN package (`@better-auth/passkey`, pinned in lockstep
 * with `better-auth` core) rather than the core barrel, because it drags the `@simplewebauthn`
 * server/browser libs — see packages/auth/src/auth.ts. Field set mirrors the plugin's model
 * exactly (name/publicKey/userId/credentialID/counter/deviceType/backedUp/transports/aaguid);
 * `updatedAt` is added per the repo's "every table has created_at/updated_at" convention (the
 * plugin's model is minimal — the DEFAULT means the plugin's inserts never need to set it, and
 * the drizzle adapter's UPDATE on rename fires `$onUpdate`).
 *
 * `counter` is the WebAuthn signature counter (integer, matching the plugin's `number` field
 * and Better Auth's own generated drizzle schema). `credentialID` is the credential's opaque
 * id and `publicKey` its COSE public key — the verification material, never a secret.
 */
export const passkey = pgTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    // User-given label to tell multiple credentials apart ("MacBook Touch ID", "YubiKey").
    // Optional on the plugin side, so nullable here.
    name: text("name"),
    // COSE public key registered by the authenticator; the server verifies assertions
    // against it. Public material, not a secret.
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The authenticator's opaque credential id (base64url). Sign-in resolves the passkey row
    // by this value, so its index below is load-bearing (unlike two_factor's unused `secret`
    // index, which we omit).
    credentialID: text("credential_id").notNull(),
    // WebAuthn signature counter (0 for authenticators that don't implement one).
    counter: integer("counter").notNull(),
    // "singleDevice" | "multiDevice" — whether the credential is synced across devices.
    deviceType: text("device_type").notNull(),
    // Whether the credential is backed up (synced passkeys report true).
    backedUp: boolean("backed_up").notNull(),
    // Comma-separated transports hint (e.g. "internal,hybrid"); optional.
    transports: text("transports"),
    // Authenticator model identifier (used to look up a friendly authenticator name);
    // optional — not every attestation includes it.
    aaguid: text("aaguid"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // Postgres does NOT auto-index FK referencing columns (P1-1): the user-delete cascade and
  // per-user list read scan `user_id` without this. `credential_id` is the lookup key on every
  // passkey SIGN-IN (verify-authentication resolves the row by it), so it's indexed too — both
  // indexes the plugin itself declares.
  (t) => [
    index("passkey_user_id_idx").on(t.userId),
    index("passkey_credential_id_idx").on(t.credentialID),
  ],
);

export type Passkey = typeof passkey.$inferSelect;
export type NewPasskey = typeof passkey.$inferInsert;
