import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Covers the /_next/image optimization path (2026-07-22 audit F4/B2). Green CI
// used to prove sharp merely INSTALLS (the pnpm-workspace.yaml override forces
// 0.35.3 past next's own `^0.34.5` pin) — nothing proved the optimizer still
// TRANSFORMS. These requests hit the prod-build webServer, which is exactly
// where Next hands decoding/resizing to sharp. Keyless + DB-free: the fixture
// is a committed /public asset (a local asset needs no `images.remotePatterns`
// entry and never touches Uploadthing).
//
// `w=64` is in Next's default `imageSizes`; `q=75` is the default quality —
// neither depends on repo config, so the spec survives config drift.

const FIXTURE_PUBLIC_PATH = "/e2e-image-fixture.png";
const FIXTURE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "e2e-image-fixture.png",
);

const optimizeUrl = (url: string) => `/_next/image?url=${encodeURIComponent(url)}&w=64&q=75`;

test("optimizer converts the PNG fixture to webp for a webp-accepting client", async ({
  request,
}) => {
  const response = await request.get(optimizeUrl(FIXTURE_PUBLIC_PATH), {
    headers: { Accept: "image/webp" },
  });
  expect(response.status()).toBe(200);
  // The source is a PNG — a webp response can only come from a real transform,
  // never from a passthrough of the file on disk.
  expect(response.headers()["content-type"]).toBe("image/webp");
  const body = await response.body();
  expect(body.length).toBeGreaterThan(0);
  expect(body.equals(await readFile(FIXTURE_FILE))).toBe(false);
});

test("optimizer resizes within the source format for a png-only client", async ({ request }) => {
  const response = await request.get(optimizeUrl(FIXTURE_PUBLIC_PATH), {
    headers: { Accept: "image/png" },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  const body = await response.body();
  // Same format, so prove the transform structurally: the returned PNG's IHDR
  // width (big-endian uint32 at byte 16) must be the requested 64, not the
  // fixture's 256 — a passthrough could never change it.
  expect(body.readUInt32BE(16)).toBe(64);
  expect(body.equals(await readFile(FIXTURE_FILE))).toBe(false);
});

test("optimizer rejects a remote url outside images.remotePatterns", async ({ request }) => {
  // Only https://*.ufs.sh/f/* is allowlisted (next.config.ts). The rejection
  // happens at parameter validation — no outbound fetch — so this stays
  // CI-safe and keyless.
  const response = await request.get(optimizeUrl("https://example.com/x.png"));
  expect(response.status()).toBe(400);
});
