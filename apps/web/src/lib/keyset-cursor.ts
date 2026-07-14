// Opaque keyset cursor for URL-driven pagination (P3-5): the (createdAt, id) of the
// last row on a page, encoded as "<iso>_<id>" for a `?after=` query param. It carries
// the SAME pair as post.list's D1 cursor object — this is the flat-string form for
// surfaces that paginate via links/searchParams instead of a tRPC input.
//
// `toISOString()` output never contains "_", so decode splits at the FIRST "_" and the
// id may itself contain underscores without ambiguity. Decode is STRICT — the ISO half
// must round-trip `new Date(iso).toISOString() === iso` — so only strings this module
// encoded are honored; anything else (missing separator, empty id, invalid or
// non-canonical date) returns null and the caller falls back to page 1. A garbled URL
// degrades gracefully, never throws.

export type KeysetCursor = {
  createdAt: Date;
  id: string;
};

export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return `${cursor.createdAt.toISOString()}_${cursor.id}`;
}

export function decodeKeysetCursor(value: string | null | undefined): KeysetCursor | null {
  if (!value) return null;
  const separator = value.indexOf("_");
  if (separator === -1) return null;
  const iso = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!id) return null;
  const createdAt = new Date(iso);
  // NaN check must come first — toISOString() throws on an Invalid Date.
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== iso) return null;
  return { createdAt, id };
}
