import { db, emailSuppressions, isEmailSuppressed, recordEmailSuppression } from "@repo/db";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * DB-backed integration test for the suppression helpers (path-to-100 #8) against a
 * REAL Postgres — no mocks — proving the properties the mocked unit tests can't: the
 * lowercase normalization is CONSISTENT between writer and reader (case-insensitive
 * round-trip), the upsert is idempotent on the unique `email` constraint (a
 * redelivered webhook event never errors or duplicates), and a conflict refreshes
 * reason/detail/lastEventAt while keeping createdAt (first-suppressed-at semantics).
 *
 * All rows use the `integration-test-suppress` address prefix so cleanup removes
 * exactly this suite's rows (nothing cascades here — no FK by design; see the schema).
 */
const PREFIX = "integration-test-suppress";

async function cleanup() {
  await db.delete(emailSuppressions).where(like(emailSuppressions.email, `${PREFIX}%`));
}

describe("email suppressions (integration)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("records an address and finds it case-insensitively", async () => {
    await recordEmailSuppression({
      email: `${PREFIX}-Bounced@Example.COM`,
      reason: "bounce",
      detail: "550 5.1.1 user unknown",
      emailId: "resend-email-1",
    });

    // Stored lowercase…
    const [row] = await db
      .select()
      .from(emailSuppressions)
      .where(eq(emailSuppressions.email, `${PREFIX.toLowerCase()}-bounced@example.com`));
    expect(row?.reason).toBe("bounce");
    expect(row?.detail).toBe("550 5.1.1 user unknown");
    expect(row?.emailId).toBe("resend-email-1");
    expect(row?.createdAt).toBeInstanceOf(Date);

    // …and looked up lowercase, whatever casing the caller sends.
    await expect(isEmailSuppressed(`${PREFIX}-bounced@example.com`)).resolves.toBe(true);
    await expect(isEmailSuppressed(`${PREFIX}-BOUNCED@EXAMPLE.COM`)).resolves.toBe(true);
  });

  it("returns false for an address that was never suppressed", async () => {
    await expect(isEmailSuppressed(`${PREFIX}-clean@example.com`)).resolves.toBe(false);
  });

  it("upserts idempotently and refreshes the row to the latest event", async () => {
    const email = `${PREFIX}-repeat@example.com`;
    await recordEmailSuppression({ email, reason: "bounce", detail: "hard bounce" });

    const [first] = await db
      .select()
      .from(emailSuppressions)
      .where(eq(emailSuppressions.email, email));
    expect(first).toBeDefined();

    // A later event for the same address (e.g. the user also hits "spam") must not
    // violate the unique constraint — it updates the one row in place.
    await recordEmailSuppression({ email: email.toUpperCase(), reason: "complaint" });

    const rows = await db
      .select()
      .from(emailSuppressions)
      .where(eq(emailSuppressions.email, email));
    expect(rows).toHaveLength(1);
    const [second] = rows;
    expect(second?.id).toBe(first?.id);
    expect(second?.reason).toBe("complaint");
    expect(second?.detail).toBeNull(); // refreshed to the LATEST event's detail
    expect(second?.createdAt).toEqual(first?.createdAt); // first-suppressed-at is kept
    expect(second?.lastEventAt.getTime()).toBeGreaterThanOrEqual(
      // biome-ignore lint/style/noNonNullAssertion: first row asserted defined above.
      first!.lastEventAt.getTime(),
    );
  });
});
