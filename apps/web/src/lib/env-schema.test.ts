import { describe, expect, it } from "vitest";
import { emailFromSchema, trustedOriginsSchema } from "./env-schema";

describe("emailFromSchema", () => {
  it("accepts a bare address", () => {
    expect(emailFromSchema.safeParse("onboarding@resend.dev").success).toBe(true);
  });

  it("accepts the display-name form Resend documents", () => {
    expect(emailFromSchema.safeParse("Acme <noreply@acme.com>").success).toBe(true);
  });

  it("accepts a display name containing spaces", () => {
    expect(emailFromSchema.safeParse("Acme Support Team <noreply@acme.com>").success).toBe(true);
  });

  it("accepts a bare angle-addr (empty display name)", () => {
    expect(emailFromSchema.safeParse("<noreply@acme.com>").success).toBe(true);
  });

  it("accepts undefined — email stays optional (graceful degradation)", () => {
    expect(emailFromSchema.safeParse(undefined).success).toBe(true);
  });

  it("rejects a non-address", () => {
    expect(emailFromSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("rejects a display-name form wrapping a non-address", () => {
    expect(emailFromSchema.safeParse("Acme <banana>").success).toBe(false);
  });

  it("rejects an unclosed angle-addr", () => {
    expect(emailFromSchema.safeParse("Acme <noreply@acme.com").success).toBe(false);
  });
});

describe("trustedOriginsSchema", () => {
  it("accepts undefined — no extra origins (graceful degradation)", () => {
    expect(trustedOriginsSchema.safeParse(undefined).success).toBe(true);
  });

  it("accepts a single https origin", () => {
    expect(trustedOriginsSchema.safeParse("https://app.example.com").success).toBe(true);
  });

  it("accepts a comma-separated list with spaces around entries", () => {
    expect(
      trustedOriginsSchema.safeParse("https://app.example.com, https://preview.example.com")
        .success,
    ).toBe(true);
  });

  it("tolerates a trailing comma (the consumer drops empty entries)", () => {
    expect(trustedOriginsSchema.safeParse("https://app.example.com,").success).toBe(true);
  });

  it("accepts a custom-scheme deep link", () => {
    expect(trustedOriginsSchema.safeParse("myapp://auth/callback").success).toBe(true);
  });

  it("accepts wildcard patterns — Better Auth matches these itself", () => {
    expect(trustedOriginsSchema.safeParse("https://*.vercel.app,*.example.com").success).toBe(true);
  });

  it("rejects a non-URL entry", () => {
    expect(trustedOriginsSchema.safeParse("not a url").success).toBe(false);
  });

  it("rejects a list with one bad entry and names it in the error", () => {
    const result = trustedOriginsSchema.safeParse("https://ok.example.com,banana");
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);
    expect(messages.join("\n")).toContain('"banana"');
  });
});
