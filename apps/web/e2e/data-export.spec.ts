import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";

// GDPR data-export E2E (B3 · Band 3 — step 2). Drives the real "Download my data" button on
// /account and inspects the downloaded JSON. A fresh sign-up creates the strongest possible
// redaction fixture: the user gets a REAL credential `account` row (with a bcrypt password
// hash) and a REAL `session` row (with a token) — so this proves the LIVE action strips
// those actual secrets, not just that a unit fixture is shaped right. DB-backed → e2e lane.

test("downloads a redaction-safe JSON export of the signed-in user's data", async ({ page }) => {
  const user = makeTestUser("data-export");
  await signUp(page, user);

  await page.goto("/account");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my data" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^my-data-export-\d{4}-\d{2}-\d{2}\.json$/);

  const path = await download.path();
  const text = await readFile(path, "utf8");
  const data = JSON.parse(text) as {
    manifest: { userId: string; schemaVersion: number };
    profile: { email: string };
    accounts: Array<Record<string, unknown>>;
    sessions: Array<Record<string, unknown>>;
  };

  // The bundle is the caller's own data.
  expect(typeof data.manifest.userId).toBe("string");
  expect(data.manifest.userId.length).toBeGreaterThan(0);
  expect(data.manifest.schemaVersion).toBe(1);
  expect(data.profile.email).toBe(user.email);

  // Redaction contract against REAL rows: the credential account and the live session must
  // ship with none of their secret fields.
  expect(data.accounts.length).toBeGreaterThan(0);
  for (const account of data.accounts) {
    expect(account).not.toHaveProperty("password");
    expect(account).not.toHaveProperty("accessToken");
    expect(account).not.toHaveProperty("refreshToken");
    expect(account).not.toHaveProperty("idToken");
  }
  expect(data.sessions.length).toBeGreaterThan(0);
  for (const session of data.sessions) {
    expect(session).not.toHaveProperty("token");
  }

  // Belt-and-braces: those secret KEY names never appear anywhere in the raw payload.
  // (Non-secret expiry fields like accessTokenExpiresAt use a capital T, so `"token"`
  // with surrounding quotes can't false-match them.)
  for (const key of [
    '"password"',
    '"token"',
    '"secret"',
    '"backupCodes"',
    '"publicKey"',
    '"credentialID"',
  ]) {
    expect(text).not.toContain(key);
  }
});
