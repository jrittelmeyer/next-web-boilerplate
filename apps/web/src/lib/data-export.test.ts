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
import { describe, expect, it } from "vitest";
import { buildDataExport, type RawExportData } from "./data-export";

const D1 = new Date("2026-01-01T00:00:00.000Z");
const D2 = new Date("2026-02-02T00:00:00.000Z");
const EXPORTED_AT = new Date("2026-07-09T12:00:00.000Z");

// Sentinel secret values — the test asserts NONE of these reach the serialized export.
const SECRETS = [
  "SECRET-password-hash",
  "SECRET-access-token",
  "SECRET-refresh-token",
  "SECRET-id-token",
  "SECRET-session-token",
  "SECRET-totp-secret",
  "SECRET-backup-codes",
  "SECRET-passkey-publickey",
  "SECRET-passkey-credentialid",
];

function raw(): RawExportData {
  const user: User = {
    id: "u1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    emailVerified: true,
    image: "https://cdn.example.com/ada.png",
    role: "user",
    twoFactorEnabled: true,
    banned: false,
    banReason: null,
    banExpires: null,
    createdAt: D1,
    updatedAt: D2,
  };
  const account: Account = {
    id: "acc1",
    accountId: "gh-123",
    providerId: "github",
    userId: "u1",
    accessToken: "SECRET-access-token",
    refreshToken: "SECRET-refresh-token",
    idToken: "SECRET-id-token",
    accessTokenExpiresAt: null, // exercises iso()'s null branch
    refreshTokenExpiresAt: D2,
    scope: "read:user",
    password: "SECRET-password-hash",
    createdAt: D1,
    updatedAt: D2,
  };
  const session: Session = {
    id: "sess1",
    expiresAt: D2,
    token: "SECRET-session-token",
    ipAddress: "203.0.113.5",
    userAgent: "Mozilla/5.0",
    userId: "u1",
    activeOrganizationId: "org1",
    impersonatedBy: null,
    createdAt: D1,
    updatedAt: D2,
  };
  const post: Post = {
    id: "post1",
    authorId: "u1",
    organizationId: "org1",
    title: "Hello",
    content: "World",
    createdAt: D1,
    updatedAt: D2,
  };
  const revision: PostRevision = {
    id: "rev1",
    postId: "post1",
    authorId: "u1",
    title: "Hello v1",
    content: "World v1",
    createdAt: D1,
  };
  const upload: Upload = {
    id: "up1",
    userId: "u1",
    key: "key-abc",
    name: "photo.png",
    url: "https://x.ufs.sh/f/key-abc",
    size: 1024,
    type: "image/png",
    createdAt: D1,
    updatedAt: D2,
  };
  const subscription: Subscription = {
    id: "sub_123",
    userId: "u1",
    stripeCustomerId: "cus_123",
    status: "active",
    priceId: "price_123",
    currentPeriodEnd: null,
    createdAt: D1,
    updatedAt: D2,
  };
  const tf: TwoFactor = {
    id: "tf1",
    secret: "SECRET-totp-secret",
    backupCodes: "SECRET-backup-codes",
    userId: "u1",
    verified: true,
    createdAt: D1,
    updatedAt: D2,
  };
  const passkey: Passkey = {
    id: "pk1",
    name: "MacBook Touch ID",
    publicKey: "SECRET-passkey-publickey",
    userId: "u1",
    credentialID: "SECRET-passkey-credentialid",
    counter: 3,
    deviceType: "singleDevice",
    backedUp: false,
    transports: "internal",
    aaguid: "aaguid-1",
    createdAt: D1,
    updatedAt: D2,
  };
  // Two memberships: one whose org IS in `organizations` (join hit) and one whose org is
  // missing (join miss → name/slug null) — covers both branches of the org lookup.
  const memberWithOrg: Member = {
    id: "m1",
    organizationId: "org1",
    userId: "u1",
    role: "owner",
    createdAt: D1,
    updatedAt: D2,
  };
  const memberOrphan: Member = {
    id: "m2",
    organizationId: "org-gone",
    userId: "u1",
    role: "member",
    createdAt: D1,
    updatedAt: D2,
  };
  const organization: Organization = {
    id: "org1",
    name: "Acme",
    slug: "acme",
    logo: null,
    metadata: null,
    createdAt: D1,
    updatedAt: D2,
  };
  const invitation: Invitation = {
    id: "inv1",
    organizationId: "org1",
    email: "invitee@example.com",
    role: "member",
    status: "pending",
    inviterId: "u1",
    expiresAt: D2,
    createdAt: D1,
    updatedAt: D2,
  };
  const audit: AuditLog = {
    id: "aud1",
    action: "user.signed_in",
    actorId: "u1",
    targetId: "u1",
    metadata: { ip: "203.0.113.5", userAgent: "Mozilla/5.0" },
    createdAt: D1,
  };

  return {
    user,
    accounts: [account],
    sessions: [session],
    posts: [post],
    postRevisions: [revision],
    uploads: [upload],
    subscriptions: [subscription],
    twoFactor: [tf],
    passkeys: [passkey],
    memberships: [memberWithOrg, memberOrphan],
    organizations: [organization],
    invitations: [invitation],
    auditEvents: [audit],
  };
}

describe("buildDataExport", () => {
  it("stamps a manifest with the injected clock, schema version, and user id", () => {
    const out = buildDataExport(raw(), EXPORTED_AT);
    expect(out.manifest).toEqual({
      exportedAt: "2026-07-09T12:00:00.000Z",
      schemaVersion: 1,
      userId: "u1",
    });
  });

  it("NEVER serializes any secret / verification-material field", () => {
    const serialized = JSON.stringify(buildDataExport(raw(), EXPORTED_AT));
    for (const secret of SECRETS) {
      expect(serialized).not.toContain(secret);
    }
    // And the redacted KEYS themselves must be absent from the shaped sections.
    const out = buildDataExport(raw(), EXPORTED_AT);
    expect(out.accounts[0]).not.toHaveProperty("password");
    expect(out.accounts[0]).not.toHaveProperty("accessToken");
    expect(out.accounts[0]).not.toHaveProperty("refreshToken");
    expect(out.accounts[0]).not.toHaveProperty("idToken");
    expect(out.sessions[0]).not.toHaveProperty("token");
    expect(out.twoFactor[0]).not.toHaveProperty("secret");
    expect(out.twoFactor[0]).not.toHaveProperty("backupCodes");
    expect(out.passkeys[0]).not.toHaveProperty("publicKey");
    expect(out.passkeys[0]).not.toHaveProperty("credentialID");
  });

  it("shapes the profile and normalizes dates to ISO strings (null stays null)", () => {
    const out = buildDataExport(raw(), EXPORTED_AT);
    expect(out.profile).toEqual({
      id: "u1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      emailVerified: true,
      image: "https://cdn.example.com/ada.png",
      role: "user",
      twoFactorEnabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-02T00:00:00.000Z",
    });
    // iso() null branch: account with no accessTokenExpiresAt.
    expect(out.accounts[0]?.accessTokenExpiresAt).toBeNull();
    expect(out.accounts[0]?.refreshTokenExpiresAt).toBe("2026-02-02T00:00:00.000Z");
    // subscription with no currentPeriodEnd.
    expect(out.subscriptions[0]?.currentPeriodEnd).toBeNull();
  });

  it("keeps the user's own non-secret data (posts, uploads, subscriptions, audit)", () => {
    const out = buildDataExport(raw(), EXPORTED_AT);
    expect(out.posts[0]).toMatchObject({ id: "post1", title: "Hello", content: "World" });
    expect(out.postRevisions[0]).toMatchObject({ id: "rev1", postId: "post1" });
    expect(out.uploads[0]).toMatchObject({ key: "key-abc", size: 1024 });
    expect(out.subscriptions[0]).toMatchObject({ stripeCustomerId: "cus_123", status: "active" });
    expect(out.invitationsSent[0]).toMatchObject({ email: "invitee@example.com" });
    expect(out.auditEvents[0]).toMatchObject({
      action: "user.signed_in",
      metadata: { ip: "203.0.113.5", userAgent: "Mozilla/5.0" },
    });
  });

  it("joins memberships to organizations, tolerating a missing org", () => {
    const out = buildDataExport(raw(), EXPORTED_AT);
    expect(out.organizations).toEqual([
      {
        organizationId: "org1",
        name: "Acme",
        slug: "acme",
        role: "owner",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        organizationId: "org-gone",
        name: null,
        slug: null,
        role: "member",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});
