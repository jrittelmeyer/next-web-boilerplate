import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { ChangeEmail } from "./templates/change-email";
import { DeleteAccount } from "./templates/delete-account";
import { EmailChangedNotice } from "./templates/email-changed-notice";
import { MagicLinkEmail } from "./templates/magic-link";
import { OrganizationInvitation } from "./templates/organization-invitation";
import { ResetPasswordEmail } from "./templates/reset-password";
import { VerifyEmail } from "./templates/verify-email";
import { VerifyNewEmail } from "./templates/verify-new-email";
import { WelcomeEmail } from "./templates/welcome";

/**
 * Render smoke tests for every email template. `@repo/email` was the only workspace
 * package with zero tests, so a broken template (or a plain-text render regression)
 * previously only surfaced via a manual `email export`. These render each template to
 * BOTH parts through the SAME `@react-email/render` calls the app's send path uses
 * (send.tsx: `render(react)` for HTML, `render(react, { plainText: true })` for the
 * multipart text alternative) and assert non-empty output carrying the dynamic
 * content (recipient name, action links, etc.).
 */

// Distinct, escaping-safe test values (no &, <, >, ") so they survive HTML rendering
// verbatim and can be asserted literally in both the HTML and plain-text output.
const NAME = "Ada Lovelace";
const URL = "https://app.test/action?token=abc123";
const NEW_EMAIL = "new.address@example.com";
const ORG = "Acme Analytics";
const INVITER = "Grace Hopper";
const ROLE = "admin";

interface Fixture {
  label: string;
  // Rendered with explicit props — asserts dynamic content flows through.
  element: ReactElement;
  // Rendered with defaults (no props) — covers the default-parameter branches and
  // mirrors what the `email` preview CLI renders.
  defaults: ReactElement;
  // Tokens that must appear in the HTML output.
  htmlIncludes: string[];
  // Tokens that must appear in the plain-text output. Asserted against <Text> body
  // content (not headings), whose case html-to-text preserves verbatim.
  textIncludes: string[];
}

const fixtures: Fixture[] = [
  {
    label: "welcome",
    element: <WelcomeEmail name={NAME} />,
    defaults: <WelcomeEmail />,
    htmlIncludes: [NAME],
    textIncludes: ["Thanks for signing up"],
  },
  {
    label: "verify-email",
    element: <VerifyEmail name={NAME} url={URL} />,
    defaults: <VerifyEmail />,
    htmlIncludes: [NAME, URL],
    textIncludes: [NAME, URL],
  },
  {
    label: "reset-password",
    element: <ResetPasswordEmail name={NAME} url={URL} />,
    defaults: <ResetPasswordEmail />,
    htmlIncludes: [NAME, URL],
    textIncludes: [NAME, URL],
  },
  {
    label: "change-email",
    element: <ChangeEmail name={NAME} newEmail={NEW_EMAIL} url={URL} />,
    defaults: <ChangeEmail />,
    htmlIncludes: [NAME, NEW_EMAIL, URL],
    textIncludes: [NAME, NEW_EMAIL, URL],
  },
  {
    label: "email-changed-notice",
    element: <EmailChangedNotice name={NAME} newEmail={NEW_EMAIL} />,
    defaults: <EmailChangedNotice />,
    htmlIncludes: [NAME, NEW_EMAIL],
    textIncludes: [NAME, NEW_EMAIL],
  },
  {
    label: "verify-new-email",
    element: <VerifyNewEmail name={NAME} url={URL} />,
    defaults: <VerifyNewEmail />,
    htmlIncludes: [NAME, URL],
    textIncludes: [NAME, URL],
  },
  {
    label: "delete-account",
    element: <DeleteAccount name={NAME} url={URL} />,
    defaults: <DeleteAccount />,
    htmlIncludes: [NAME, URL],
    textIncludes: [NAME, URL],
  },
  {
    label: "organization-invitation",
    element: (
      <OrganizationInvitation inviterName={INVITER} organizationName={ORG} role={ROLE} url={URL} />
    ),
    defaults: <OrganizationInvitation />,
    htmlIncludes: [INVITER, ORG, ROLE, URL],
    textIncludes: [INVITER, ORG, URL],
  },
  {
    // No NAME: the magic-link template deliberately takes no recipient name (the
    // address may not have an account yet — see the template's doc comment).
    label: "magic-link",
    element: <MagicLinkEmail url={URL} />,
    defaults: <MagicLinkEmail />,
    htmlIncludes: [URL],
    textIncludes: [URL],
  },
];

describe("email template render smoke tests", () => {
  // Guard: if a template is added or removed, this fixture list must keep pace.
  it("covers every template", () => {
    expect(fixtures).toHaveLength(9);
  });

  it.each(fixtures)("$label renders non-empty HTML with its dynamic content", async ({
    element,
    htmlIncludes,
  }) => {
    const html = await render(element);
    expect(html.length).toBeGreaterThan(0);
    expect(html.toLowerCase()).toContain("<html");
    for (const token of htmlIncludes) {
      expect(html).toContain(token);
    }
  });

  it.each(fixtures)("$label renders non-empty plain-text with its dynamic content", async ({
    element,
    textIncludes,
  }) => {
    const text = await render(element, { plainText: true });
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).not.toContain("<html");
    for (const token of textIncludes) {
      expect(text).toContain(token);
    }
  });

  it.each(fixtures)("$label renders with default props (preview-CLI parity)", async ({
    defaults,
  }) => {
    const html = await render(defaults);
    const text = await render(defaults, { plainText: true });
    expect(html.toLowerCase()).toContain("<html");
    expect(text.length).toBeGreaterThan(0);
  });
});
