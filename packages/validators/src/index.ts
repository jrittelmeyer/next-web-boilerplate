import { z } from "zod";

/**
 * Schemas shared between client (React Hook Form) and server (tRPC input,
 * Server Actions). Keep this package framework-agnostic — no React, no Next,
 * no DB imports — so either side can depend on it.
 */

/**
 * Shared Server-Action result shape (A7). An action returns either a typed `data`
 * payload or an `error` string; the OPTIONAL `fieldErrors` map (field name →
 * message) carries PER-FIELD validation messages so a form can surface EACH failing
 * field inline (React Hook Form `setError`) instead of collapsing the server's
 * validation to the first Zod issue. Backward-compatible with the older per-file
 * `{ error } | { data }` types — `"error" in result` still discriminates and the
 * new field is optional, so actions can adopt this incrementally. The `/posts`
 * create action + form are the worked example (see API.md → Server Actions).
 */
export type FieldErrors = Record<string, string>;
export type ActionResult<T> = { error: string; fieldErrors?: FieldErrors } | { data: T };

/**
 * Collapse a `ZodError` into a `FieldErrors` map — the FIRST message per top-level
 * field. Nested paths key on their first segment (matching RHF's flat field names),
 * and form-level issues (empty `path`, e.g. an object-level `.refine`) are dropped —
 * surface those via the accompanying `error` string instead. Use in an action's
 * `safeParse` failure branch:
 *   if (!parsed.success)
 *     return { error: "Please fix the fields below.", fieldErrors: zodFieldErrors(parsed.error) };
 * (Iterates `error.issues` rather than `.flatten()` so every branch is reachable
 * for the package's 100% coverage gate.)
 */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key !== undefined && !(String(key) in fieldErrors)) {
      fieldErrors[String(key)] = issue.message;
    }
  }
  return fieldErrors;
}

/**
 * Auth UI (C1). Shared by the `(auth)` client forms (React Hook Form) — the server
 * side is Better Auth's own API, which re-validates. `min(8)` mirrors Better Auth's
 * password minimum; `z.email()` is the zod v4 top-level email format (see `z.url()`
 * in apps/web/src/env.ts).
 */
export const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or fewer"),
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be 128 characters or fewer"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Magic-link sign-in request (path-to-100 #6) — the login page's email-only
 * magic-link mode. Same shape as forgotPasswordSchema but deliberately its own
 * schema: each auth flow owns its validator, so one flow's future field never
 * leaks into another's form.
 */
export const magicLinkRequestSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export type MagicLinkRequestInput = z.infer<typeof magicLinkRequestSchema>;

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be 128 characters or fewer"),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Account page (M3). Input for the signed-in password change — the `(dashboard)`
 * `ChangePasswordForm` calls Better Auth's `changePassword` (client), which
 * re-validates server-side. `currentPassword` only needs to be non-empty (Better
 * Auth verifies it against the stored hash); `newPassword` mirrors the 8–128 bound
 * used by `signUpSchema`/`resetPasswordSchema`.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be 128 characters or fewer"),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Account page (M5). Input for the signed-in email change — the `(dashboard)`
 * `ChangeEmailForm` calls Better Auth's `changeEmail` (client), which re-validates
 * server-side. `z.email()` mirrors `signInSchema`/`signUpSchema`; Better Auth
 * lowercases + de-dupes (a no-op when the address is unchanged) on its side.
 */
export const changeEmailSchema = z.object({
  newEmail: z.email("Enter a valid email address"),
});

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

/**
 * Account page (P2-2). Input for the danger-zone account deletion when the user has
 * an email/password credential — the `(dashboard)` `DeleteAccountCard` calls Better
 * Auth's `deleteUser` (client), which verifies the password against the stored hash
 * server-side, so non-empty is the only client-side requirement (mirrors
 * `changePasswordSchema.currentPassword`). OAuth-only users have no password; the
 * card gates them on a type-to-confirm phrase instead (pure client-side intent —
 * no schema, nothing to re-validate server-side).
 */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export const updateNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or fewer"),
});

export type UpdateNameInput = z.infer<typeof updateNameSchema>;

/**
 * RBAC (Step 21). Input for the admin-only `setUserRole` Server Action. This
 * package stays DB-free (no `@repo/db` import), so the role list is duplicated
 * here as a literal — keep it in sync with `ROLES` in `@repo/db/schema/auth.ts`,
 * which is the canonical source of truth.
 */
export const setUserRoleSchema = z.object({
  userId: z.string().min(1, "User id is required"),
  role: z.enum(["user", "admin"], { message: "Invalid role" }),
});

export type SetUserRoleInput = z.infer<typeof setUserRoleSchema>;

/**
 * Admin plugin (Tier 4 · Band 4). Input for the admin-only `banUser` / `unbanUser`
 * Server Actions, which wrap Better Auth's admin() ban endpoints. `banReason` is an
 * optional operator note surfaced in the audit trail; `banExpiresIn` is an optional
 * auto-lift duration in SECONDS (omitted = a permanent ban). Kept DB-free like the
 * rest of this package.
 */
export const banUserSchema = z.object({
  userId: z.string().min(1, "User id is required"),
  banReason: z.string().max(500, "Ban reason is too long").optional(),
  banExpiresIn: z.number().int().positive("Ban duration must be positive").optional(),
});

export type BanUserInput = z.infer<typeof banUserSchema>;

export const unbanUserSchema = z.object({
  userId: z.string().min(1, "User id is required"),
});

export type UnbanUserInput = z.infer<typeof unbanUserSchema>;

/**
 * Admin plugin (Tier 4 · Band 4). Input for the admin-only `impersonateUser` Server
 * Action, which wraps Better Auth's admin() `impersonateUser` endpoint (a session-cookie
 * swap). Only the target `userId` is needed; stopping impersonation takes no input (the
 * impersonation session identifies itself). Kept DB-free like the rest of this package.
 */
export const impersonateUserSchema = z.object({
  userId: z.string().min(1, "User id is required"),
});

export type ImpersonateUserInput = z.infer<typeof impersonateUserSchema>;

/**
 * Example domain entity (Step 28). Input for the `createPost` Server Action,
 * shared by the client form (React Hook Form) and the server (the action
 * re-validates). Bounds match the `posts` table (`title`/`content` are `text`,
 * so the caps are product limits, not column limits).
 */
export const createPostSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or fewer"),
  content: z
    .string()
    .trim()
    .min(1, "Content is required")
    .max(5000, "Content must be 5000 characters or fewer"),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

/**
 * Update input for the `updatePost` Server Action (D1). The edit form reuses
 * `createPostSchema` for its title/content fields; the action validates the full
 * `{ id, title, content }` here, then authorizes the edit by `id` (author-only).
 */
export const updatePostSchema = createPostSchema.extend({
  id: z.string().min(1, "Post id is required"),
});

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

/**
 * Organizations (Tier 4 · Band 4). Shared by the org UI client forms (React Hook
 * Form) — the server side is Better Auth's `organization()` plugin API, which
 * re-validates. `name` mirrors `updateNameSchema`'s 1–100 bound; `slug` is the
 * URL-safe org identifier Better Auth stores unique — lowercase letters/digits in
 * hyphen-separated groups (no leading/trailing/double hyphens), which the create
 * form derives from the name and lets the user edit.
 */
export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or fewer"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(100, "Slug must be 100 characters or fewer")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, digits and single hyphens (e.g. acme-inc)",
    ),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

/**
 * Invite input for the org members UI — `inviteMember` (client) targets the active
 * organization. The invitable roles are the plugin's non-owner defaults (`owner` is
 * the creator and isn't handed out via invite); keep in sync with the org role set
 * Better Auth registers (owner/admin/member — see AUTH.md → Organizations).
 */
export const inviteMemberSchema = z.object({
  email: z.email("Enter a valid email address"),
  role: z.enum(["admin", "member"], { message: "Invalid role" }),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/**
 * Two-factor auth (Tier 4 · Band 2). Shared by the /account 2FA card and the sign-in
 * challenge — the server side is Better Auth's `twoFactor()` plugin API, which
 * re-validates. Enable / disable / regenerate-backup-codes are all password-gated, so
 * `password` only needs to be non-empty (Better Auth verifies it against the stored
 * hash), mirroring `changePasswordSchema.currentPassword` / `deleteAccountSchema`.
 */
export const twoFactorPasswordSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export type TwoFactorPasswordInput = z.infer<typeof twoFactorPasswordSchema>;

/**
 * The 6-digit TOTP code from an authenticator app — used both to confirm enrollment
 * and to answer the sign-in challenge. Trim-then-`\d{6}` so pasted codes with stray
 * whitespace still validate; Better Auth's default `totpOptions.digits` is 6.
 */
export const twoFactorCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
});

export type TwoFactorCodeInput = z.infer<typeof twoFactorCodeSchema>;

/**
 * A single-use recovery (backup) code, the sign-in fallback when the authenticator is
 * unavailable. Better Auth's default backup codes are alphanumeric with a hyphen
 * separator, so this only trims + requires non-empty (the server verifies the value);
 * kept separate from `twoFactorCodeSchema` because a backup code is not 6 digits.
 */
export const twoFactorBackupCodeSchema = z.object({
  code: z.string().trim().min(1, "Enter one of your backup codes"),
});

export type TwoFactorBackupCodeInput = z.infer<typeof twoFactorBackupCodeSchema>;

/**
 * Realtime notifications (Tier 4 · A22). The wire shape of a single notification —
 * the payload the SSE stream frames out to the browser AND the shape carried over
 * Postgres NOTIFY (so both legs validate against one schema). Lives here (not in
 * `@repo/db`) so the client `NotificationsFeed` can import the type without pulling
 * the DB in. `createdAt` is an ISO-8601 STRING, not a `Date`: the value round-trips
 * through `JSON.stringify` (NOTIFY payload) and `EventSource` (text frames), where a
 * `Date` would serialize to a string anyway — modelling it as a string keeps the
 * runtime value and the type honest on both sides. The `type` enum is duplicated
 * from `NOTIFICATION_TYPES` in `@repo/db/schema/notifications.ts` (canonical source)
 * — this package stays DB-free, the same convention as `setUserRoleSchema` ↔ `ROLES`.
 */
export const notificationPayloadSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  type: z.enum(["test", "system"]),
  body: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
});

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;
