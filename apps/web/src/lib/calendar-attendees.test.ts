import { describe, expect, it } from "vitest";
import { diffAttendees } from "./calendar-attendees";

const guest = (email: string, role: "organizer" | "required" | "optional" = "required") => ({
  email,
  role,
});

describe("diffAttendees", () => {
  it("leaves an unchanged list strictly alone — the rule this exists for", () => {
    // The composer posts the whole list on every save, so a title edit re-submits every
    // guest. If any of them landed in `added` or `removed`, that edit would silently
    // return them to needs-action.
    const existing = [{ email: "a@example.com" }, { email: "b@example.com" }];
    const diff = diffAttendees(existing, [guest("a@example.com"), guest("b@example.com")]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.unchanged).toEqual(["a@example.com", "b@example.com"]);
  });

  it("adds only what is new and removes only what is gone", () => {
    const diff = diffAttendees(
      [{ email: "keep@example.com" }, { email: "drop@example.com" }],
      [guest("keep@example.com"), guest("new@example.com", "optional")],
    );
    expect(diff.added).toEqual([{ email: "new@example.com", role: "optional" }]);
    expect(diff.removed).toEqual(["drop@example.com"]);
    expect(diff.unchanged).toEqual(["keep@example.com"]);
  });

  it("treats a role change on an existing address as unchanged, deliberately", () => {
    // Phase 3 has no role editor. Treating this as remove-then-add would reset a
    // response that the person already gave — worse than the missing feature.
    const diff = diffAttendees([{ email: "a@example.com" }], [guest("a@example.com", "optional")]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.unchanged).toEqual(["a@example.com"]);
  });

  it("collapses a duplicate address in one submission instead of raising 23505", () => {
    const diff = diffAttendees([], [guest("a@example.com"), guest("a@example.com", "optional")]);
    expect(diff.added).toEqual([{ email: "a@example.com", role: "required" }]);
  });

  it("does not remove an existing address just because it was submitted twice", () => {
    const diff = diffAttendees(
      [{ email: "a@example.com" }],
      [guest("a@example.com"), guest("a@example.com")],
    );
    expect(diff.removed).toEqual([]);
    expect(diff.unchanged).toEqual(["a@example.com"]);
  });

  it("clears the list when nothing is submitted, and fills it from empty", () => {
    expect(diffAttendees([{ email: "a@example.com" }], []).removed).toEqual(["a@example.com"]);
    const filled = diffAttendees([], [guest("a@example.com")]);
    expect(filled.added).toHaveLength(1);
    expect(filled.removed).toEqual([]);
  });
});
