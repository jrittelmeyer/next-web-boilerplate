import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

/**
 * Every locale catalogue must carry the same key set.
 *
 * next-intl resolves a missing key by rendering the key path itself, so the failure
 * mode is not a crash or a fallback to English — it is `Calendar.toolbar.today`
 * appearing on screen in Spanish. That is invisible to a build, invisible to
 * type-check, and only visible to someone who reads the language.
 *
 * The comparison is over flattened paths so a namespace present but shallower in one
 * locale is caught too; both directions are asserted because a stale key left behind
 * in `es` is drift just as much as a missing one.
 */
type Messages = Record<string, unknown>;

function flatten(value: Messages, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child !== null && typeof child === "object" ? flatten(child as Messages, path) : [path];
  });
}

describe("message catalogues", () => {
  it("covers every locale in routing.locales", () => {
    // A locale added to routing without a catalogue here would leave this test
    // passing while the app 500s on that prefix.
    expect([...routing.locales].sort()).toEqual(["en", "es"]);
  });

  it("has identical key sets in en and es", () => {
    const enKeys = flatten(en as Messages).sort();
    const esKeys = flatten(es as Messages).sort();
    expect(esKeys).toEqual(enKeys);
  });

  it("has no empty strings", () => {
    // An empty value renders as nothing, which reads as a layout bug rather than a
    // translation gap.
    for (const [locale, catalogue] of [
      ["en", en],
      ["es", es],
    ] as const) {
      const empties = flatten(catalogue as Messages).filter((path) => {
        const value = path
          .split(".")
          .reduce<unknown>((node, key) => (node as Messages)[key], catalogue);
        return typeof value === "string" && value.trim() === "";
      });
      expect({ locale, empties }).toEqual({ locale, empties: [] });
    }
  });
});
