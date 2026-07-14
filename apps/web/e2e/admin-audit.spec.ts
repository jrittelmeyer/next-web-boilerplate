import { expect, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";
import {
  deleteAuditRows,
  deleteBaitUsers,
  promoteToAdmin,
  seedAuditRows,
  seedBaitUsers,
} from "./support/db";

// Read-surface E2E for /admin/audit (B2 audit read UI). The keyset primitive itself is
// already exhaustively covered by admin-pagination.spec (same lib/keyset-cursor), so this
// spec instead proves the thing that's NEW: the page RENDERS recorded events, resolving a
// denormalized target_id to the user's email via the LEFT JOIN, with the right label +
// metadata detail — and degrades on a bad cursor.
//
// ONE signup (stays inside Better Auth's 5/60s sign-up limiter alongside the other suites)
// + promoteToAdmin. The event under test is SEEDED directly (support/db.ts), not driven
// through the write UI — the write sites are covered by admin.test.ts + the @repo/db
// integration lane, and seeding keeps this spec off the flaky nav-click path. The seeded
// rows are future-dated so they're the newest events (page 1) despite the sign_in rows
// other suites' signups keep adding to the shared DB.

const PREFIX = "e2e-admin-audit";
// The seeded target user's id (padded by seedBaitUsers) and its email (unpadded).
const TARGET_ID = `${PREFIX}-00`;
const TARGET_EMAIL = `${PREFIX}-0@example.com`;

test.beforeAll(async () => {
  await deleteAuditRows(PREFIX); // leftovers from an aborted local run
  await deleteBaitUsers(PREFIX);
  await seedBaitUsers(PREFIX, 1); // the row target_id resolves to → proves the JOIN
  await seedAuditRows([
    {
      action: "user.role_changed",
      actorId: TARGET_ID,
      targetId: TARGET_ID,
      metadata: { oldRole: "user", newRole: "admin" },
    },
  ]);
});

test.afterAll(async () => {
  await deleteAuditRows(PREFIX);
  await deleteBaitUsers(PREFIX);
});

test("admin audit page renders recorded events (resolved email + detail) and degrades on a bad cursor", async ({
  page,
}) => {
  test.slow(); // one signup + several full-page gotos

  const admin = makeTestUser("admin-audit");
  await signUp(page, admin);
  await promoteToAdmin(admin.email);

  // ---- Page 1: the seeded (future-dated) role-change is the newest row.
  await page.goto("/admin/audit");
  await expect(page.getByText("Audit log")).toBeVisible();
  // A26: the events render in a real <table>; scope to <tbody> rows so `.first()` is the
  // first DATA row (not the <thead> header row) and the empty-page assertion below counts 0
  // (the empty state renders a <p>, no table at all).
  const rows = page.locator("tbody").getByRole("row");
  const first = rows.first();
  await expect(first).toContainText("Role changed"); // action label (audit-format)
  await expect(first).toContainText("user → admin"); // metadata detail
  await expect(first).toContainText(TARGET_EMAIL); // target_id resolved via LEFT JOIN

  // ---- Garbled cursor → decodes to null → page 1 (the seeded row is still first).
  await page.goto("/admin/audit?after=not-a-cursor");
  await expect(rows.first()).toContainText("Role changed");
  await expect(page.getByRole("link", { name: "← Newest" })).toHaveCount(0);

  // ---- Structurally-valid cursor but a NON-uuid id → must degrade to page 1, never 500
  // the keyset query (audit_log.id is a uuid; a hand-edited `?after=` would otherwise make
  // Postgres throw `invalid input syntax for type uuid`).
  await page.goto(`/admin/audit?after=${encodeURIComponent("1970-01-01T00:00:00.000Z_x")}`);
  await expect(rows.first()).toContainText("Role changed");
  await expect(page.getByRole("link", { name: "← Newest" })).toHaveCount(0);

  // ---- Valid past-the-end cursor (a real uuid, older than every row) → the empty page +
  // recovery link, not an error.
  await page.goto(
    `/admin/audit?after=${encodeURIComponent("1970-01-01T00:00:00.000Z_00000000-0000-0000-0000-000000000000")}`,
  );
  await expect(page.getByText("No events on this page.")).toBeVisible();
  await expect(rows).toHaveCount(0);
  await expect(page.getByRole("link", { name: "← Newest" })).toBeVisible();
});
