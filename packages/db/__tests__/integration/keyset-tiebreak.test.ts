import { auditLog, db, posts, user } from "@repo/db";
import { and, desc, eq, like, lt, or } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The `(createdAt, id)` keyset's same-timestamp tiebreak, against a REAL
 * Postgres (predicate-sensor long tail). Five call sites share this exact
 * shape — `admin.ts` `listUsers`, `post.ts` `list`/`listMine`, the `/admin`
 * and `/admin/audit` Server Component pages — over three underlying tables
 * (`user`, `posts`, `auditLog`). All three restated here rather than five
 * times, since the predicate and the failure mode are identical; only the
 * table differs.
 *
 * Real inserts essentially never collide to the millisecond, so this needs a
 * PLANTED same-`createdAt` fixture — the same reasoning `calendar-reminders
 * .test.ts`'s dedupe-ledger race test gives for exercising an otherwise
 * theoretical collision directly.
 */

const PREFIX = "integration-test-keyset";
const SAME_INSTANT = new Date("2027-01-01T00:00:00.000Z");

async function cleanup() {
  await db.delete(user).where(like(user.id, `${PREFIX}%`));
  await db.delete(auditLog).where(like(auditLog.actorId, `${PREFIX}%`));
}

/** The keyset predicate + ordering shared by all five call sites, restated. */
function keysetPage<TCreatedAt, TId>(
  createdAtCol: TCreatedAt,
  idCol: TId,
  cursor: { createdAt: Date; id: string } | null,
  tiebreak: boolean,
) {
  if (!cursor) return undefined;
  // biome-ignore lint/suspicious/noExplicitAny: shared across three column types.
  const c = createdAtCol as any;
  // biome-ignore lint/suspicious/noExplicitAny: shared across three column types.
  const i = idCol as any;
  return tiebreak
    ? or(lt(c, cursor.createdAt), and(eq(c, cursor.createdAt), lt(i, cursor.id)))
    : lt(c, cursor.createdAt);
}

beforeEach(cleanup);
afterAll(cleanup);

describe("user's keyset tiebreak (admin.listUsers / /admin page)", () => {
  const FIRST_ID = `${PREFIX}-user-b`;
  const SECOND_ID = `${PREFIX}-user-a`;

  beforeEach(async () => {
    await db.insert(user).values([
      {
        id: FIRST_ID,
        name: "Keyset A",
        email: `${FIRST_ID}@example.com`,
        emailVerified: true,
        createdAt: SAME_INSTANT,
      },
      {
        id: SECOND_ID,
        name: "Keyset B",
        email: `${SECOND_ID}@example.com`,
        emailVerified: true,
        createdAt: SAME_INSTANT,
      },
    ]);
  });

  async function page(cursor: { createdAt: Date; id: string } | null, tiebreak: boolean) {
    const rows = await db
      .select({ id: user.id, createdAt: user.createdAt })
      .from(user)
      .where(keysetPage(user.createdAt, user.id, cursor, tiebreak))
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(1);
    return rows.filter((row) => row.id === FIRST_ID || row.id === SECOND_ID);
  }

  it("visits both same-timestamp rows exactly once across two pages", async () => {
    const first = await page(null, true);
    expect(first).toHaveLength(1);
    const [only] = first;
    if (!only) throw new Error("expected a row");
    const second = await page({ createdAt: only.createdAt, id: only.id }, true);
    expect(second.map((row) => row.id)).not.toContain(only.id);
    expect([first[0]?.id, second[0]?.id].sort()).toEqual([FIRST_ID, SECOND_ID].sort());
  });

  it("skips the second same-timestamp row entirely under the spelling without the tiebreak — the defect", async () => {
    const first = await page(null, false);
    const [only] = first;
    if (!only) throw new Error("expected a row");
    const second = await page({ createdAt: only.createdAt, id: only.id }, false);
    // `lt(createdAt, cursor.createdAt)` alone is false for an EQUAL timestamp, so the
    // row sharing the cursor's instant never appears on any later page.
    expect(second).toHaveLength(0);
  });
});

describe("posts's keyset tiebreak (post.list / post.listMine)", () => {
  // DESC id order: the higher UUID sorts first, so FIRST_ID must be numerically larger.
  const FIRST_ID = "eeeeeeee-1111-4222-8333-000000000002";
  const SECOND_ID = "eeeeeeee-1111-4222-8333-000000000001";
  const AUTHOR_ID = `${PREFIX}-post-author`;

  beforeEach(async () => {
    await db.insert(user).values({
      id: AUTHOR_ID,
      name: "Keyset Post Author",
      email: `${AUTHOR_ID}@example.com`,
      emailVerified: true,
    });
    await db.insert(posts).values([
      { id: FIRST_ID, authorId: AUTHOR_ID, title: "A", content: "a", createdAt: SAME_INSTANT },
      { id: SECOND_ID, authorId: AUTHOR_ID, title: "B", content: "b", createdAt: SAME_INSTANT },
    ]);
  });

  async function page(cursor: { createdAt: Date; id: string } | null, tiebreak: boolean) {
    return await db
      .select({ id: posts.id, createdAt: posts.createdAt })
      .from(posts)
      .where(
        and(eq(posts.authorId, AUTHOR_ID), keysetPage(posts.createdAt, posts.id, cursor, tiebreak)),
      )
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(1);
  }

  it("visits both same-timestamp rows exactly once across two pages", async () => {
    const first = await page(null, true);
    expect(first).toHaveLength(1);
    const [only] = first;
    if (!only) throw new Error("expected a row");
    const second = await page({ createdAt: only.createdAt, id: only.id }, true);
    expect([first[0]?.id, second[0]?.id].sort()).toEqual([FIRST_ID, SECOND_ID].sort());
  });

  it("skips the second same-timestamp row entirely under the spelling without the tiebreak — the defect", async () => {
    const first = await page(null, false);
    const [only] = first;
    if (!only) throw new Error("expected a row");
    const second = await page({ createdAt: only.createdAt, id: only.id }, false);
    expect(second).toHaveLength(0);
  });
});

describe("auditLog's keyset tiebreak (/admin/audit page)", () => {
  const FIRST_ID = "ffffffff-1111-4222-8333-000000000002";
  const SECOND_ID = "ffffffff-1111-4222-8333-000000000001";

  beforeEach(async () => {
    await db.insert(auditLog).values([
      {
        id: FIRST_ID,
        action: "user.signed_in",
        actorId: `${PREFIX}-audit`,
        createdAt: SAME_INSTANT,
      },
      {
        id: SECOND_ID,
        action: "user.signed_in",
        actorId: `${PREFIX}-audit`,
        createdAt: SAME_INSTANT,
      },
    ]);
  });

  async function page(cursor: { createdAt: Date; id: string } | null, tiebreak: boolean) {
    return await db
      .select({ id: auditLog.id, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(
        and(
          like(auditLog.actorId, `${PREFIX}%`),
          keysetPage(auditLog.createdAt, auditLog.id, cursor, tiebreak),
        ),
      )
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(1);
  }

  it("visits both same-timestamp rows exactly once across two pages", async () => {
    const first = await page(null, true);
    expect(first).toHaveLength(1);
    const [only] = first;
    if (!only) throw new Error("expected a row");
    const second = await page({ createdAt: only.createdAt, id: only.id }, true);
    expect([first[0]?.id, second[0]?.id].sort()).toEqual([FIRST_ID, SECOND_ID].sort());
  });

  it("skips the second same-timestamp row entirely under the spelling without the tiebreak — the defect", async () => {
    const first = await page(null, false);
    const [only] = first;
    if (!only) throw new Error("expected a row");
    const second = await page({ createdAt: only.createdAt, id: only.id }, false);
    expect(second).toHaveLength(0);
  });
});
