// Derive a URL-safe organization slug from a name (Tier 4 · Band 4). Lowercases,
// collapses every run of non-alphanumerics to a single hyphen, and strips leading /
// trailing hyphens. The create-org dialog seeds the slug field from the typed name with
// this until the user edits the slug themselves.
//
// The output is deliberately a SUBSET of what `createOrganizationSchema.slug` accepts
// (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), so a non-empty result always validates — the two must
// stay in sync. An all-punctuation / empty name yields "" (empty), which the schema then
// rejects as "Slug is required", so the user is prompted rather than handed a bad slug.
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
