import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit test for the Resend webhook handler's DISPATCH branches (path-to-100 #8),
// mirroring the Stripe route's test: the seams (the verified event, the suppression
// writer, the limiter) are mocked and each event type's recording decision is
// asserted. The real signature verification is exercised by the email-suppression
// E2E (a self-signed payload through the actual svix HMAC path), and the real DB
// round-trip by packages/db/__tests__/integration/email-suppressions.test.ts.
const { rateLimitMock, clientIpMock, isEmailConfiguredMock, verifyMock, recordMock } = vi.hoisted(
  () => ({
    rateLimitMock: vi.fn(),
    clientIpMock: vi.fn(),
    isEmailConfiguredMock: vi.fn(),
    verifyMock: vi.fn(),
    recordMock: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock("@repo/db", () => ({ recordEmailSuppression: recordMock }));
vi.mock("@repo/email", () => ({
  isEmailConfigured: isEmailConfiguredMock,
  getResend: () => ({ webhooks: { verify: verifyMock } }),
}));
// Mock only the two seams the route calls through (the limiter + IP resolver); keep
// the REAL `rateLimitHeaders` (a pure fn) so the 429 branch emits genuine headers.
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, rateLimit: rateLimitMock, clientIpFromHeaders: clientIpMock };
});

import { POST } from "./route";

function webhookRequest(headers?: Record<string, string>) {
  return new Request("http://localhost/api/resend/webhook", {
    method: "POST",
    headers: headers ?? {
      "svix-id": "msg_test",
      "svix-timestamp": "1750000000",
      "svix-signature": "v1,test-sig",
    },
    body: "{}",
  });
}

function bouncedEvent(type: string, to: string[] = ["bounced@example.com"]) {
  return {
    type: "email.bounced",
    created_at: "2026-07-16T00:00:00.000Z",
    data: {
      email_id: "email_1",
      to,
      bounce: {
        message: "The recipient's mailbox rejected the message.",
        subType: "General",
        type,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
  rateLimitMock.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
  clientIpMock.mockReturnValue("test-ip");
  isEmailConfiguredMock.mockReturnValue(true);
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("gates", () => {
  it("returns 503 when email is unconfigured (no verify, no write)", async () => {
    isEmailConfiguredMock.mockReturnValue(false);
    const res = await POST(webhookRequest());
    expect(res.status).toBe(503);
    expect(verifyMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("returns 503 when RESEND_WEBHOOK_SECRET is unset", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await POST(webhookRequest());
    expect(res.status).toBe(503);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("returns 400 when a svix header is missing, without attempting verification", async () => {
    const res = await POST(
      webhookRequest({ "svix-id": "msg_test", "svix-timestamp": "1750000000" }),
    );
    expect(res.status).toBe(400);
    expect(verifyMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when signature verification throws (no write)", async () => {
    verifyMock.mockImplementation(() => {
      throw new Error("No matching signature found");
    });
    const res = await POST(webhookRequest());
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/No matching signature found/);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("hands verify the raw body with the three svix headers and the secret", async () => {
    verifyMock.mockReturnValue({ type: "email.sent", data: {} });
    await POST(webhookRequest());
    expect(verifyMock).toHaveBeenCalledWith({
      payload: "{}",
      headers: { id: "msg_test", timestamp: "1750000000", signature: "v1,test-sig" },
      webhookSecret: "whsec_test",
    });
  });
});

describe("email.bounced", () => {
  it("records a Permanent bounce for every recipient", async () => {
    verifyMock.mockReturnValue(bouncedEvent("Permanent", ["a@example.com", "b@example.com"]));
    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(recordMock).toHaveBeenCalledTimes(2);
    expect(recordMock).toHaveBeenCalledWith({
      email: "a@example.com",
      reason: "bounce",
      detail: "The recipient's mailbox rejected the message.",
      emailId: "email_1",
    });
    expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({ email: "b@example.com" }));
  });

  it("compares the bounce type case-insensitively", async () => {
    verifyMock.mockReturnValue(bouncedEvent("PERMANENT"));
    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it("logs but does NOT record a non-permanent (transient) bounce", async () => {
    verifyMock.mockReturnValue(bouncedEvent("Transient"));
    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    expect(recordMock).not.toHaveBeenCalled();
  });
});

describe("email.complained / email.suppressed", () => {
  it("records a complaint (no detail — the event carries none)", async () => {
    verifyMock.mockReturnValue({
      type: "email.complained",
      data: { email_id: "email_2", to: ["spam-clicker@example.com"] },
    });
    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    expect(recordMock).toHaveBeenCalledWith({
      email: "spam-clicker@example.com",
      reason: "complaint",
      detail: null,
      emailId: "email_2",
    });
  });

  it("mirrors a provider-side suppression as reason 'provider'", async () => {
    verifyMock.mockReturnValue({
      type: "email.suppressed",
      data: {
        email_id: "email_3",
        to: ["listed@example.com"],
        suppressed: { message: "Recipient is on the account suppression list.", type: "bounce" },
      },
    });
    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    expect(recordMock).toHaveBeenCalledWith({
      email: "listed@example.com",
      reason: "provider",
      detail: "Recipient is on the account suppression list.",
      emailId: "email_3",
    });
  });

  it("acknowledges an unhandled event type without writing", async () => {
    verifyMock.mockReturnValue({ type: "email.delivered", data: { to: ["ok@example.com"] } });
    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    expect(recordMock).not.toHaveBeenCalled();
  });
});

describe("rate-limit keying", () => {
  // Short-circuit after the limiter so these only assert the keying decision: an
  // unconfigured route returns 503 before any signature/DB work.
  beforeEach(() => isEmailConfiguredMock.mockReturnValue(false));

  it("keys a request with a client IP into a resend-scoped per-IP bucket at 100/min", async () => {
    clientIpMock.mockReturnValue("1.2.3.4");
    await POST(webhookRequest());
    expect(rateLimitMock).toHaveBeenCalledWith("resend-webhook:1.2.3.4", {
      limit: 100,
      windowSec: 60,
    });
  });

  it("keys an IP-less request into the tighter shared `noip` bucket at 20/min", async () => {
    clientIpMock.mockReturnValue(null);
    await POST(webhookRequest());
    expect(rateLimitMock).toHaveBeenCalledWith("resend-webhook:noip", { limit: 20, windowSec: 60 });
  });

  it("returns 429 with the standard rate-limit headers when the limiter rejects", async () => {
    rateLimitMock.mockResolvedValue({ success: false, limit: 20, remaining: 0, reset: Date.now() });
    const res = await POST(webhookRequest());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
    expect(res.headers.get("RateLimit-Limit")).toBe("20");
    expect(res.headers.get("RateLimit-Remaining")).toBe("0");
  });
});
