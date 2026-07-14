import { describe, expect, it } from "vitest";
import { avatarKeyFromUrl } from "./avatar";

describe("avatarKeyFromUrl", () => {
  it("extracts the key from a modern ufs.sh file URL", () => {
    expect(avatarKeyFromUrl("https://abc123.ufs.sh/f/KEY123abc")).toBe("KEY123abc");
  });

  it("extracts the key from a legacy utfs.io file URL", () => {
    expect(avatarKeyFromUrl("https://utfs.io/f/KEY123abc")).toBe("KEY123abc");
  });

  it("returns null for null / undefined / empty", () => {
    expect(avatarKeyFromUrl(null)).toBeNull();
    expect(avatarKeyFromUrl(undefined)).toBeNull();
    expect(avatarKeyFromUrl("")).toBeNull();
  });

  it("returns null for a non-URL string", () => {
    expect(avatarKeyFromUrl("not a url")).toBeNull();
  });

  it("returns null for URLs that aren't an Uploadthing /f/<key> path", () => {
    expect(avatarKeyFromUrl("https://example.com/avatars/me.png")).toBeNull();
    // No key after /f/, or a slash-containing (invalid) key → skip the delete.
    expect(avatarKeyFromUrl("https://abc.ufs.sh/f/")).toBeNull();
    expect(avatarKeyFromUrl("https://abc.ufs.sh/f/a/b")).toBeNull();
  });
});
