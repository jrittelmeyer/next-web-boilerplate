/**
 * Human-readable label for a session's user-agent — "Chrome on Windows".
 *
 * Deliberately a display helper, not a parser: a handful of substring checks
 * covering the mainstream browsers/OSes with honest fallbacks, and the full UA
 * string stays available in the UI (title attribute) for anything exotic. No
 * dependency on a UA-parsing library (ua-parser-js relicensed to AGPL in v2).
 *
 * Order matters in both tables: Edge/Opera UAs contain "Chrome", Chrome UAs
 * contain "Safari", Android UAs contain "Linux", and iPad UAs contain
 * "like Mac OS X" — so the more specific tokens are tested first.
 */

const BROWSERS: ReadonlyArray<readonly [pattern: RegExp, label: string]> = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\b(?:OPR|Opera)\b/, "Opera"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

const OSES: ReadonlyArray<readonly [pattern: RegExp, label: string]> = [
  [/\b(?:iPhone|iPad|iPod)\b/, "iOS"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bAndroid\b/, "Android"],
  [/\bLinux\b/, "Linux"],
];

function match(ua: string, table: ReadonlyArray<readonly [RegExp, string]>): string | null {
  for (const [pattern, label] of table) {
    if (pattern.test(ua)) return label;
  }
  return null;
}

export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent?.trim()) return "Unknown device";
  const browser = match(userAgent, BROWSERS);
  const os = match(userAgent, OSES);
  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return `Unknown browser on ${os}`;
  return "Unknown device";
}
