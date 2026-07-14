import { describe, expect, it } from "vitest";
import { describeUserAgent } from "./user-agent";

// Real-world UA strings (trimmed to the discriminating tokens where long).
const UA = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  operaMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1",
};

describe("describeUserAgent", () => {
  it("labels the mainstream desktop browsers", () => {
    expect(describeUserAgent(UA.chromeWindows)).toBe("Chrome on Windows");
    expect(describeUserAgent(UA.firefoxLinux)).toBe("Firefox on Linux");
    expect(describeUserAgent(UA.safariMac)).toBe("Safari on macOS");
  });

  it("prefers the specific token when the UA also claims Chrome/Safari", () => {
    // Edge and Opera UAs contain "Chrome/" and "Safari/"; Chrome UAs contain "Safari/".
    expect(describeUserAgent(UA.edgeWindows)).toBe("Edge on Windows");
    expect(describeUserAgent(UA.operaMac)).toBe("Opera on macOS");
  });

  it("labels mobile platforms, preferring iOS/Android over their base tokens", () => {
    // Android UAs contain "Linux"; iPhone UAs contain "like Mac OS X".
    expect(describeUserAgent(UA.chromeAndroid)).toBe("Chrome on Android");
    expect(describeUserAgent(UA.safariIphone)).toBe("Safari on iOS");
    expect(describeUserAgent(UA.chromeIos)).toBe("Chrome on iOS");
  });

  it("degrades to the half it can identify", () => {
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) SomethingNew/1.0")).toBe(
      "Unknown browser on Windows",
    );
    expect(describeUserAgent("Chrome/126.0.0.0")).toBe("Chrome");
  });

  it("falls back to 'Unknown device' for null, empty, blank, and unrecognized values", () => {
    expect(describeUserAgent(null)).toBe("Unknown device");
    expect(describeUserAgent(undefined)).toBe("Unknown device");
    expect(describeUserAgent("")).toBe("Unknown device");
    expect(describeUserAgent("   ")).toBe("Unknown device");
    expect(describeUserAgent("curl/8.7.1")).toBe("Unknown device");
  });
});
