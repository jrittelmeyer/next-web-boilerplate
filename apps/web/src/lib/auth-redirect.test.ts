import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./auth-redirect";

describe("safeRedirectPath", () => {
  it("accepts a same-origin absolute path", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
  });

  it("accepts a nested path with a query string", () => {
    expect(safeRedirectPath("/posts?after=abc")).toBe("/posts?after=abc");
  });

  it("accepts the bare root path", () => {
    expect(safeRedirectPath("/")).toBe("/");
  });

  it("falls back for null and undefined", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
  });

  it("falls back for an empty string", () => {
    expect(safeRedirectPath("")).toBe("/dashboard");
  });

  it("rejects an absolute URL", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/dashboard");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/dashboard");
  });

  it("rejects the backslash variant (WHATWG parsing normalizes \\ to /)", () => {
    expect(safeRedirectPath("/\\evil.com")).toBe("/dashboard");
  });

  it("rejects the %5C form as Next delivers it (searchParams arrive percent-decoded)", () => {
    // `?redirectTo=%2F%5Cevil.com` reaches the page as the decoded string "/\evil.com".
    expect(safeRedirectPath(decodeURIComponent("%2F%5Cevil.com"))).toBe("/dashboard");
  });

  it("allows a still-encoded %5C literal — it stays a path segment, never a separator", () => {
    // Percent-decoding happens AFTER URL parsing, so "/%5Cevil.com" can't become
    // protocol-relative at navigation time; it's a harmless same-origin path.
    expect(safeRedirectPath("/%5Cevil.com")).toBe("/%5Cevil.com");
  });

  it("honors a custom fallback", () => {
    expect(safeRedirectPath("//evil.com", "/account")).toBe("/account");
    expect(safeRedirectPath(null, "/account")).toBe("/account");
  });
});
