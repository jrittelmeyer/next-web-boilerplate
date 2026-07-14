import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from "@react-email/components";

interface EmailChangedNoticeProps {
  name?: string;
  // The address the account was moved TO — shown so the recipient (at the OLD
  // address) knows exactly what changed. Defaulted only for the preview CLI.
  newEmail?: string;
}

/**
 * Courtesy "your email was changed" notice (M7, defense-in-depth). Sent to the user's
 * OLD address once a verified email change COMPLETES — an out-of-band security alert,
 * even though the two-hop flow already required a click from this address. It is
 * informational (no action link): the change is already done. If the recipient didn't
 * make the change, the footer routes them to secure the account.
 *
 * Keep templates pure (no `server-only`) so the preview/render tooling can import
 * them directly. The default export is required by the `email` preview CLI (a
 * framework exception to the named-exports-only rule, like Next.js page files).
 */
export function EmailChangedNotice({
  name = "there",
  newEmail = "new@example.com",
}: EmailChangedNoticeProps) {
  return (
    <Html>
      <Head />
      <Preview>The email address on your account was changed.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Your email address was changed</Heading>
          <Text style={paragraph}>
            Hi {name}, this confirms that the email address on your account was changed to{" "}
            <strong>{newEmail}</strong>. You'll sign in with the new address from now on. As a
            precaution, other active sessions have been signed out.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            If you didn't make this change, your account may be compromised — reset your password
            immediately and contact support.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default EmailChangedNotice;

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

const hr = {
  borderColor: "#e2e8f0",
  margin: "24px 0",
};

const footer = {
  fontSize: "13px",
  color: "#94a3b8",
};
