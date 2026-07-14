import type {
  Account,
  AuditLog,
  Invitation,
  Member,
  Organization,
  Passkey,
  Post,
  PostRevision,
  Session,
  Subscription,
  TwoFactor,
  Upload,
  User,
} from "@repo/db/schema";

// GDPR data export (B3 · Band 3 — step 2). The pure ASSEMBLER + REDACTION, kept out of the
// Server Action so it's unit-testable in the node Vitest project (the audit-format.ts /
// posthog-identity.ts precedent) and 100% coverage-gated — this is where the security
// contract lives, so it's the thing that must be tested.
//
// Redaction posture is ALLOWLIST, not blocklist: every section maps only the explicit
// fields below into the output. A secret can't leak because it was forgotten in a
// blocklist, and a sensitive column added to a table later is excluded by default until
// someone deliberately adds it here. The dropped secrets are called out per section.

/** The raw per-user rows the action reads; the builder shapes + redacts them. */
export interface RawExportData {
  user: User;
  accounts: Account[];
  sessions: Session[];
  posts: Post[];
  postRevisions: PostRevision[];
  uploads: Upload[];
  subscriptions: Subscription[];
  twoFactor: TwoFactor[];
  passkeys: Passkey[];
  memberships: Member[];
  /** The organizations referenced by `memberships` (joined by id in the builder). */
  organizations: Organization[];
  /** Invitations the user SENT (inviterId = user). */
  invitations: Invitation[];
  /** Audit events where the user is the actor or the target. */
  auditEvents: AuditLog[];
}

/** ISO-8601 string (or null) — Dates are normalized so the export is plain JSON. */
type IsoDate = string | null;

const iso = (value: Date | null): IsoDate => (value ? value.toISOString() : null);

export interface DataExport {
  manifest: { exportedAt: string; schemaVersion: number; userId: string };
  profile: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    role: string;
    twoFactorEnabled: boolean;
    createdAt: IsoDate;
    updatedAt: IsoDate;
  };
  accounts: Array<{
    id: string;
    providerId: string;
    accountId: string;
    scope: string | null;
    accessTokenExpiresAt: IsoDate;
    refreshTokenExpiresAt: IsoDate;
    createdAt: IsoDate;
    updatedAt: IsoDate;
  }>;
  sessions: Array<{
    id: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: IsoDate;
    updatedAt: IsoDate;
    expiresAt: IsoDate;
  }>;
  posts: Array<{
    id: string;
    title: string;
    content: string;
    organizationId: string | null;
    createdAt: IsoDate;
    updatedAt: IsoDate;
  }>;
  postRevisions: Array<{
    id: string;
    postId: string;
    title: string;
    content: string;
    createdAt: IsoDate;
  }>;
  uploads: Array<{
    id: string;
    key: string;
    name: string;
    url: string;
    size: number;
    type: string | null;
    createdAt: IsoDate;
    updatedAt: IsoDate;
  }>;
  subscriptions: Array<{
    id: string;
    status: string;
    priceId: string | null;
    stripeCustomerId: string;
    currentPeriodEnd: IsoDate;
    createdAt: IsoDate;
    updatedAt: IsoDate;
  }>;
  twoFactor: Array<{ verified: boolean; createdAt: IsoDate; updatedAt: IsoDate }>;
  passkeys: Array<{
    id: string;
    name: string | null;
    deviceType: string;
    backedUp: boolean;
    transports: string | null;
    createdAt: IsoDate;
    updatedAt: IsoDate;
  }>;
  organizations: Array<{
    organizationId: string;
    name: string | null;
    slug: string | null;
    role: string;
    createdAt: IsoDate;
  }>;
  invitationsSent: Array<{
    id: string;
    organizationId: string;
    email: string;
    role: string | null;
    status: string;
    expiresAt: IsoDate;
    createdAt: IsoDate;
  }>;
  auditEvents: Array<{
    id: string;
    action: string;
    actorId: string | null;
    targetId: string | null;
    metadata: unknown;
    createdAt: IsoDate;
  }>;
}

/**
 * Shape the caller's raw rows into the downloadable export, dropping every secret /
 * verification-material field. `exportedAt` is injected (not read from a clock here) so the
 * builder stays pure and the test is deterministic.
 *
 * Redactions (never in the output):
 *  - accounts: password, accessToken, refreshToken, idToken
 *  - sessions: token
 *  - twoFactor: secret, backupCodes
 *  - passkeys: publicKey, credentialID (COSE key + opaque credential id)
 */
export function buildDataExport(raw: RawExportData, exportedAt: Date): DataExport {
  const orgById = new Map(raw.organizations.map((org) => [org.id, org]));

  return {
    manifest: {
      exportedAt: exportedAt.toISOString(),
      schemaVersion: 1,
      userId: raw.user.id,
    },
    profile: {
      id: raw.user.id,
      name: raw.user.name,
      email: raw.user.email,
      emailVerified: raw.user.emailVerified,
      image: raw.user.image,
      role: raw.user.role,
      twoFactorEnabled: raw.user.twoFactorEnabled,
      createdAt: iso(raw.user.createdAt),
      updatedAt: iso(raw.user.updatedAt),
    },
    accounts: raw.accounts.map((a) => ({
      id: a.id,
      providerId: a.providerId,
      accountId: a.accountId,
      scope: a.scope,
      accessTokenExpiresAt: iso(a.accessTokenExpiresAt),
      refreshTokenExpiresAt: iso(a.refreshTokenExpiresAt),
      createdAt: iso(a.createdAt),
      updatedAt: iso(a.updatedAt),
    })),
    sessions: raw.sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: iso(s.createdAt),
      updatedAt: iso(s.updatedAt),
      expiresAt: iso(s.expiresAt),
    })),
    posts: raw.posts.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      organizationId: p.organizationId,
      createdAt: iso(p.createdAt),
      updatedAt: iso(p.updatedAt),
    })),
    postRevisions: raw.postRevisions.map((r) => ({
      id: r.id,
      postId: r.postId,
      title: r.title,
      content: r.content,
      createdAt: iso(r.createdAt),
    })),
    uploads: raw.uploads.map((u) => ({
      id: u.id,
      key: u.key,
      name: u.name,
      url: u.url,
      size: u.size,
      type: u.type,
      createdAt: iso(u.createdAt),
      updatedAt: iso(u.updatedAt),
    })),
    subscriptions: raw.subscriptions.map((s) => ({
      id: s.id,
      status: s.status,
      priceId: s.priceId,
      stripeCustomerId: s.stripeCustomerId,
      currentPeriodEnd: iso(s.currentPeriodEnd),
      createdAt: iso(s.createdAt),
      updatedAt: iso(s.updatedAt),
    })),
    twoFactor: raw.twoFactor.map((t) => ({
      verified: t.verified,
      createdAt: iso(t.createdAt),
      updatedAt: iso(t.updatedAt),
    })),
    passkeys: raw.passkeys.map((k) => ({
      id: k.id,
      name: k.name,
      deviceType: k.deviceType,
      backedUp: k.backedUp,
      transports: k.transports,
      createdAt: iso(k.createdAt),
      updatedAt: iso(k.updatedAt),
    })),
    organizations: raw.memberships.map((m) => {
      const org = orgById.get(m.organizationId);
      return {
        organizationId: m.organizationId,
        name: org?.name ?? null,
        slug: org?.slug ?? null,
        role: m.role,
        createdAt: iso(m.createdAt),
      };
    }),
    invitationsSent: raw.invitations.map((i) => ({
      id: i.id,
      organizationId: i.organizationId,
      email: i.email,
      role: i.role,
      status: i.status,
      expiresAt: iso(i.expiresAt),
      createdAt: iso(i.createdAt),
    })),
    auditEvents: raw.auditEvents.map((e) => ({
      id: e.id,
      action: e.action,
      actorId: e.actorId,
      targetId: e.targetId,
      metadata: e.metadata,
      createdAt: iso(e.createdAt),
    })),
  };
}
