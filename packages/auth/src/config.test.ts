import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captchaOptions,
  getEmailChangeFromToken,
  invitationAcceptUrl,
  isCaptchaConfigured,
  passkeyRelyingParty,
  socialProviders,
  tokenFromRequest,
  trustedOrigins,
  twoFactorIssuer,
} from "./config";

// Every env-reading test stubs ALL the vars it depends on (including stubbing to
// undefined = unset), so results never depend on the ambient shell environment.
afterEach(() => {
  vi.unstubAllEnvs();
});

/** Build a JWT-shaped token whose (unsigned) payload segment carries `claims`. */
function tokenWith(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `header.${payload}.signature`;
}

describe("getEmailChangeFromToken", () => {
  it("returns null for an undefined token", () => {
    expect(getEmailChangeFromToken(undefined)).toBeNull();
  });

  it("returns null for an empty token", () => {
    expect(getEmailChangeFromToken("")).toBeNull();
  });

  it("returns null for a garbled token with no payload segment", () => {
    expect(getEmailChangeFromToken("not-a-jwt")).toBeNull();
  });

  it("returns null for a truncated token with an empty payload segment", () => {
    expect(getEmailChangeFromToken("header..signature")).toBeNull();
  });

  it("returns null when the payload is not JSON", () => {
    const payload = Buffer.from("definitely not json", "utf8").toString("base64url");
    expect(getEmailChangeFromToken(`header.${payload}.signature`)).toBeNull();
  });

  it("returns null for a sign-up verification token (wrong requestType)", () => {
    // Shape Better Auth issues for first-time sign-up verification — no change payload.
    expect(getEmailChangeFromToken(tokenWith({ email: "a@example.com" }))).toBeNull();
    expect(
      getEmailChangeFromToken(
        tokenWith({ email: "a@example.com", requestType: "email-verification" }),
      ),
    ).toBeNull();
  });

  it("returns null when the change-email claims are incomplete", () => {
    const requestType = "change-email-verification";
    expect(
      getEmailChangeFromToken(tokenWith({ requestType, updateTo: "new@example.com" })),
    ).toBeNull();
    expect(
      getEmailChangeFromToken(tokenWith({ requestType, email: "old@example.com" })),
    ).toBeNull();
  });

  it("recovers the change for a valid change-email token", () => {
    const token = tokenWith({
      requestType: "change-email-verification",
      email: "old@example.com",
      updateTo: "new@example.com",
    });
    expect(getEmailChangeFromToken(token)).toEqual({
      oldEmail: "old@example.com",
      newEmail: "new@example.com",
    });
  });
});

describe("trustedOrigins", () => {
  it("defaults to http://localhost:3000 when nothing is set", () => {
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    vi.stubEnv("AUTH_TRUSTED_ORIGINS", undefined);
    expect(trustedOrigins()).toEqual(["http://localhost:3000"]);
  });

  it("trusts BETTER_AUTH_URL alone when no extra origins are set", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com");
    vi.stubEnv("AUTH_TRUSTED_ORIGINS", undefined);
    expect(trustedOrigins()).toEqual(["https://app.example.com"]);
  });

  it("appends a single extra origin after the base URL", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com");
    vi.stubEnv("AUTH_TRUSTED_ORIGINS", "https://admin.example.com");
    expect(trustedOrigins()).toEqual(["https://app.example.com", "https://admin.example.com"]);
  });

  it("splits multiple comma-separated origins in order", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com");
    vi.stubEnv("AUTH_TRUSTED_ORIGINS", "https://a.example.com,https://b.example.com");
    expect(trustedOrigins()).toEqual([
      "https://app.example.com",
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });

  it("trims whitespace and drops empty entries", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com");
    vi.stubEnv("AUTH_TRUSTED_ORIGINS", " https://a.example.com , ,https://b.example.com ,");
    expect(trustedOrigins()).toEqual([
      "https://app.example.com",
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });

  it("dedupes an extra origin that repeats the base URL", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com");
    vi.stubEnv("AUTH_TRUSTED_ORIGINS", "https://app.example.com,https://b.example.com");
    expect(trustedOrigins()).toEqual(["https://app.example.com", "https://b.example.com"]);
  });
});

describe("socialProviders", () => {
  /** Pin all four provider vars (undefined = unset) so tests are hermetic. */
  function stubProviderEnv(vars: Partial<Record<string, string>>): void {
    for (const name of [
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ]) {
      vi.stubEnv(name, vars[name]);
    }
  }

  it("registers no providers when nothing is configured", () => {
    stubProviderEnv({});
    expect(socialProviders()).toEqual({});
  });

  it("does not register a provider from an id without its secret (or vice versa)", () => {
    stubProviderEnv({ GITHUB_CLIENT_ID: "gh-id", GOOGLE_CLIENT_SECRET: "goog-secret" });
    expect(socialProviders()).toEqual({});
  });

  it("registers only the provider with both credentials set", () => {
    stubProviderEnv({ GITHUB_CLIENT_ID: "gh-id", GITHUB_CLIENT_SECRET: "gh-secret" });
    expect(socialProviders()).toEqual({
      github: { clientId: "gh-id", clientSecret: "gh-secret" },
    });
  });

  it("registers both providers when both pairs are set", () => {
    stubProviderEnv({
      GITHUB_CLIENT_ID: "gh-id",
      GITHUB_CLIENT_SECRET: "gh-secret",
      GOOGLE_CLIENT_ID: "goog-id",
      GOOGLE_CLIENT_SECRET: "goog-secret",
    });
    expect(socialProviders()).toEqual({
      github: { clientId: "gh-id", clientSecret: "gh-secret" },
      google: { clientId: "goog-id", clientSecret: "goog-secret" },
    });
  });
});

describe("isCaptchaConfigured", () => {
  it("is false when TURNSTILE_SECRET_KEY is unset", () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", undefined);
    expect(isCaptchaConfigured()).toBe(false);
  });

  it("is false for an empty secret (emptyStringAsUndefined posture)", () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(isCaptchaConfigured()).toBe(false);
  });

  it("is true once a secret is present", () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    expect(isCaptchaConfigured()).toBe(true);
  });
});

describe("captchaOptions", () => {
  it("returns undefined when unconfigured (so the plugin is left out entirely)", () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", undefined);
    expect(captchaOptions()).toBeUndefined();
  });

  it("builds Cloudflare Turnstile options with the explicit endpoint list", () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "sk-turnstile");
    // The plugin's three defaults restated (an explicit list replaces them) plus the
    // magic-link send endpoint (#6) — see the captchaOptions doc comment.
    expect(captchaOptions()).toEqual({
      provider: "cloudflare-turnstile",
      secretKey: "sk-turnstile",
      endpoints: [
        "/sign-up/email",
        "/sign-in/email",
        "/request-password-reset",
        "/sign-in/magic-link",
      ],
    });
  });
});

describe("invitationAcceptUrl", () => {
  it("defaults to the localhost origin when BETTER_AUTH_URL is unset", () => {
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    expect(invitationAcceptUrl("inv_123")).toBe("http://localhost:3000/accept-invitation/inv_123");
  });

  it("builds the accept path against the configured app origin", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com");
    expect(invitationAcceptUrl("inv_123")).toBe(
      "https://app.example.com/accept-invitation/inv_123",
    );
  });

  it("trims a trailing slash on the base so the URL never doubles up", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com/");
    expect(invitationAcceptUrl("inv_123")).toBe(
      "https://app.example.com/accept-invitation/inv_123",
    );
  });
});

describe("twoFactorIssuer", () => {
  it("falls back to localhost when BETTER_AUTH_URL is unset", () => {
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    expect(twoFactorIssuer()).toBe("localhost");
  });

  it("uses the hostname of the configured app origin", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com");
    expect(twoFactorIssuer()).toBe("app.example.com");
  });

  it("returns localhost when BETTER_AUTH_URL cannot be parsed as a URL", () => {
    vi.stubEnv("BETTER_AUTH_URL", "not a url");
    expect(twoFactorIssuer()).toBe("localhost");
  });
});

describe("passkeyRelyingParty", () => {
  it("falls back to the localhost defaults when BETTER_AUTH_URL is unset", () => {
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    expect(passkeyRelyingParty()).toEqual({
      rpID: "localhost",
      rpName: "localhost",
      origin: "http://localhost:3000",
    });
  });

  it("derives rpID/rpName from the hostname (no port) and pins origin to the URL", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com");
    expect(passkeyRelyingParty()).toEqual({
      rpID: "app.example.com",
      rpName: "app.example.com",
      origin: "https://app.example.com",
    });
  });

  it("keeps the port in origin but strips it from rpID", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3100");
    expect(passkeyRelyingParty()).toEqual({
      rpID: "localhost",
      rpName: "localhost",
      origin: "http://localhost:3100",
    });
  });

  it("trims a trailing slash from origin (the plugin rejects one)", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com/");
    expect(passkeyRelyingParty()).toEqual({
      rpID: "app.example.com",
      rpName: "app.example.com",
      origin: "https://app.example.com",
    });
  });

  it("returns the localhost defaults when BETTER_AUTH_URL cannot be parsed", () => {
    vi.stubEnv("BETTER_AUTH_URL", "not a url");
    expect(passkeyRelyingParty()).toEqual({
      rpID: "localhost",
      rpName: "localhost",
      origin: "http://localhost:3000",
    });
  });
});

describe("tokenFromRequest", () => {
  it("returns undefined without a request", () => {
    expect(tokenFromRequest(undefined)).toBeUndefined();
  });

  it("returns undefined when the request URL does not parse", () => {
    // The real Request constructor rejects malformed URLs, but Better Auth's callback
    // types only promise a `url` — the guard exists for exactly this looser shape.
    expect(tokenFromRequest({ url: "not a url" } as unknown as Request)).toBeUndefined();
  });

  it("returns undefined when the URL carries no token param", () => {
    const request = new Request("http://localhost:3000/api/auth/verify-email");
    expect(tokenFromRequest(request)).toBeUndefined();
  });

  it("reads the token off the query string", () => {
    const request = new Request("http://localhost:3000/api/auth/verify-email?token=tok_123");
    expect(tokenFromRequest(request)).toBe("tok_123");
  });
});
