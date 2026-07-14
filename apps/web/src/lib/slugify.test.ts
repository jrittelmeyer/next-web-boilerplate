import { createOrganizationSchema } from "@repo/validators";
import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it.each([
    ["Acme Inc", "acme-inc"],
    ["  Acme  ", "acme"],
    ["Acme, Inc!", "acme-inc"],
    ["--Foo--", "foo"],
    ["a  b", "a-b"],
    ["ALL CAPS NAME", "all-caps-name"],
    ["Team 42", "team-42"],
    ["café ☕ crew", "caf-crew"],
    ["already-valid-slug", "already-valid-slug"],
  ])("slugifies %j → %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("returns an empty string for a name with no alphanumerics", () => {
    expect(slugify("   ")).toBe("");
    expect(slugify("!!!")).toBe("");
    expect(slugify("")).toBe("");
  });

  // The contract: any NON-EMPTY slugify output must satisfy the schema's slug rule, so a
  // seeded slug never lands the user on a validation error they didn't cause.
  it.each([
    "Acme Inc",
    "Acme, Inc!",
    "--Foo--",
    "Team 42",
    "already-valid-slug",
  ])("produces a slug that createOrganizationSchema accepts for %j", (name) => {
    const slug = slugify(name);
    expect(slug.length).toBeGreaterThan(0);
    expect(createOrganizationSchema.safeParse({ name: "Valid Name", slug }).success).toBe(true);
  });
});
