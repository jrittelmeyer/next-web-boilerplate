import { db, member, organization, user } from "@repo/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * `getOrgRole`'s membership lookup, against a REAL Postgres (predicate-sensor
 * long tail). `lib/organization.ts:47-53` lives in apps/web, which this package
 * cannot depend on — restated here, as the calendar/notification suites restate
 * their siblings' router/action predicates.
 *
 * This is authorization-shaped, not just a coverage gap: `getOrgRole` is the
 * org-scoped analogue of `lib/rbac.ts` (per its own file header), and its
 * sibling `isOrgAdminRole` gates managing another member's org-scoped content.
 * Dropping the `organizationId` conjunct would let a role held in one
 * organization answer a permission check scoped to a different one.
 */

const USER_ID = "integration-test-organization-user";
const ORG_A_ID = "integration-test-organization-org-a";
const ORG_B_ID = "integration-test-organization-org-b";

async function cleanup() {
  // member cascades from both organization and user; deleting the organizations
  // (which cascades member rows) then the user is the whole cleanup.
  await db.delete(organization).where(eq(organization.id, ORG_A_ID));
  await db.delete(organization).where(eq(organization.id, ORG_B_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

beforeEach(async () => {
  await cleanup();
  await db.insert(user).values({
    id: USER_ID,
    name: "Integration Test Organization User",
    email: "integration-test-organization-user@example.com",
    emailVerified: true,
  });
  await db.insert(organization).values([
    { id: ORG_A_ID, name: "Org A", slug: "integration-test-org-a" },
    { id: ORG_B_ID, name: "Org B", slug: "integration-test-org-b" },
  ]);
  // The user is a member of ORG A ONLY, as its admin — never a member of ORG B at
  // all. This is what makes the defect below unambiguous: any answer at all for
  // ORG B means the row it found belongs to a different organization entirely.
  await db.insert(member).values({
    id: "integration-test-organization-member-a",
    organizationId: ORG_A_ID,
    userId: USER_ID,
    role: "admin",
  });
});

afterAll(cleanup);

describe("getOrgRole's organizationId conjunct (predicate-sensor long tail)", () => {
  /** `organization.ts:47-53`'s SELECT, restated. */
  async function getOrgRole(organizationId: string, userId: string, scoped: boolean) {
    const row = await db.query.member.findFirst({
      where: scoped
        ? and(eq(member.organizationId, organizationId), eq(member.userId, userId))
        : eq(member.userId, userId),
      columns: { role: true },
    });
    return row?.role ?? null;
  }

  it("answers null for an organization the caller isn't a member of at all", async () => {
    expect(await getOrgRole(ORG_A_ID, USER_ID, true)).toBe("admin");
    expect(await getOrgRole(ORG_B_ID, USER_ID, true)).toBeNull();
  });

  it("leaks org A's admin role into an org B permission check under the spelling missing the organizationId conjunct — the defect", async () => {
    // The user holds NO membership row in ORG B whatsoever — the only row `member`
    // has for this user id belongs to ORG A. Dropping the organizationId conjunct
    // means a permission check scoped to ORG B is answered by ORG A's row instead
    // of correctly finding nothing, handing admin authority to a workspace the
    // caller was never even invited to.
    expect(await getOrgRole(ORG_B_ID, USER_ID, false)).toBe("admin");
  });
});
