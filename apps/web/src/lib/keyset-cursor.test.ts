import { describe, expect, it } from "vitest";
import { decodeKeysetCursor, encodeKeysetCursor } from "./keyset-cursor";

describe("encodeKeysetCursor / decodeKeysetCursor", () => {
  it("round-trips a cursor exactly (date to the millisecond + id)", () => {
    const cursor = { createdAt: new Date("2026-07-04T12:34:56.789Z"), id: "abc123XYZ" };
    const decoded = decodeKeysetCursor(encodeKeysetCursor(cursor));
    expect(decoded).not.toBeNull();
    expect(decoded?.createdAt.getTime()).toBe(cursor.createdAt.getTime());
    expect(decoded?.id).toBe(cursor.id);
  });

  it("round-trips an id containing underscores (split happens at the FIRST '_')", () => {
    const cursor = { createdAt: new Date("2026-01-02T03:04:05.006Z"), id: "id_with_under_scores" };
    const decoded = decodeKeysetCursor(encodeKeysetCursor(cursor));
    expect(decoded?.id).toBe("id_with_under_scores");
    expect(decoded?.createdAt.toISOString()).toBe("2026-01-02T03:04:05.006Z");
  });

  it("returns null for null / undefined / empty input", () => {
    expect(decodeKeysetCursor(null)).toBeNull();
    expect(decodeKeysetCursor(undefined)).toBeNull();
    expect(decodeKeysetCursor("")).toBeNull();
  });

  it("returns null when the separator is missing", () => {
    expect(decodeKeysetCursor("2026-07-04T12:34:56.789Z")).toBeNull();
    expect(decodeKeysetCursor("garbage")).toBeNull();
  });

  it("returns null for an empty id half", () => {
    expect(decodeKeysetCursor("2026-07-04T12:34:56.789Z_")).toBeNull();
  });

  it("returns null for an unparseable date half", () => {
    expect(decodeKeysetCursor("not-a-date_someid")).toBeNull();
    expect(decodeKeysetCursor("_someid")).toBeNull();
  });

  it("returns null for a parseable but non-canonical date (strict round-trip)", () => {
    // Valid ISO-8601, but not toISOString() form (no milliseconds) — only strings this
    // module encoded are honored, so this is treated as garbled.
    expect(decodeKeysetCursor("2026-07-04T12:34:56Z_someid")).toBeNull();
    // new Date("2026") parses, but "2026" is not canonical either.
    expect(decodeKeysetCursor("2026_someid")).toBeNull();
  });
});
