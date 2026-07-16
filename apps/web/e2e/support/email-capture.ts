import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The magic-link E2E's email-capture contract (path-to-100 #6). The second Playwright
 * webServer (:3001) runs with fake Resend creds + EMAIL_TEST_CAPTURE_DIR pointing at
 * this directory, so @repo/email writes every "send" as one JSON file instead of
 * calling Resend; the spec polls the directory for the emailed link. The path lives in
 * ONE place — playwright.config.ts (which sets the env var) and magic-link.spec.ts
 * (which reads the files) both import it. Gitignored; reset per run.
 */
export const EMAIL_CAPTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".email-capture",
);

/** The shape @repo/email's capture seam writes (see packages/email/src/send.tsx). */
export type CapturedEmail = { action: string; to: string; subject: string; url?: string };

/** Clear captures from earlier runs so a poll only ever sees this run's sends. */
export async function resetEmailCapture(): Promise<void> {
  await rm(EMAIL_CAPTURE_DIR, { recursive: true, force: true });
  await mkdir(EMAIL_CAPTURE_DIR, { recursive: true });
}

/** Poll for a captured send addressed to `to`; throws (failing the test) on timeout. */
export async function waitForCapturedEmail(to: string, timeoutMs = 15_000): Promise<CapturedEmail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let files: string[] = [];
    try {
      files = await readdir(EMAIL_CAPTURE_DIR);
    } catch {
      // Directory not created yet — nothing has been sent.
    }
    for (const file of files) {
      try {
        const entry = JSON.parse(
          await readFile(path.join(EMAIL_CAPTURE_DIR, file), "utf8"),
        ) as CapturedEmail;
        if (entry.to === to) return entry;
      } catch {
        // A file mid-write can parse as garbage — skip; the next poll re-reads it.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No captured email for ${to} within ${timeoutMs}ms`);
}
