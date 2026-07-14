import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface ChangeEmailProps {
  name?: string;
  // The address the account would move TO — shown so the recipient knows exactly
  // what they're approving (this email is sent to the CURRENT/old address).
  newEmail?: string;
  // The confirmation URL (carries the Better Auth change-email token). Defaulted
  // only so the preview CLI renders a representative link.
  url?: string;
}

/**
 * Email-change confirmation template (M6, two-hop). Sent to the user's CURRENT
 * address when a signed-in change is requested, so the move must be approved from
 * the address that already controls the account before the new address is touched.
 * (After this is confirmed, Better Auth emails the NEW address its own verification
 * link — that second hop reuses VerifyEmail.) Distinct from VerifyEmail because the
 * intent here is "approve this change," not "activate your account."
 *
 * Keep templates pure (no `server-only`) so the preview/render tooling can import
 * them directly. The default export is required by the `email` preview CLI (a
 * framework exception to the named-exports-only rule, like Next.js page files).
 */
export function ChangeEmail({
  name = "there",
  newEmail = "new@example.com",
  url = "https://example.com/confirm-email-change",
}: ChangeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm the request to change your account email address.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Confirm your email change</Heading>
          <Text style={paragraph}>
            Hi {name}, a request was made to change your account's email address to{" "}
            <strong>{newEmail}</strong>. To continue, confirm below. After you confirm, we'll send a
            final verification link to the new address to finish the change.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={url}>
              Confirm email change
            </Button>
          </Section>
          <Text style={paragraph}>
            Or paste this link into your browser:
            <br />
            <a href={url} style={link}>
              {url}
            </a>
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            If you didn't request this, you can safely ignore this email — your address won't
            change. Consider changing your password to keep your account secure.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ChangeEmail;

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "32px",
  maxWidth: "480px",
  borderRadius: "8px",
};

const heading = {
  fontSize: "24px",
  fontWeight: "600",
  color: "#0f172a",
};

const paragraph = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#334155",
};

const buttonContainer = {
  margin: "24px 0",
};

const button = {
  backgroundColor: "#0f172a",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
};

const link = {
  color: "#2563eb",
  fontSize: "14px",
  wordBreak: "break-all" as const,
};

const hr = {
  borderColor: "#e2e8f0",
  margin: "24px 0",
};

const footer = {
  fontSize: "13px",
  color: "#94a3b8",
};
