import { describe, expect, it } from "vitest";
import { type ConsentReader, readConsent } from "./consent";

function reader(status: "granted" | "denied" | "pending"): ConsentReader {
  return { get_explicit_consent_status: () => status };
}

describe("readConsent", () => {
  it("is granted when the user has explicitly opted in", () => {
    expect(readConsent(reader("granted"))).toBe("granted");
  });

  it("is denied when the user has explicitly opted out", () => {
    expect(readConsent(reader("denied"))).toBe("denied");
  });

  it("maps posthog's 'pending' to 'unset' so the banner asks (opt-out-by-default keeps capture off)", () => {
    // The crux: opt_out_capturing_by_default makes has_opted_out_capturing() true by default,
    // but get_explicit_consent_status() stays "pending" until a real choice — so the banner
    // shows instead of silently reading as "denied".
    expect(readConsent(reader("pending"))).toBe("unset");
  });
});
