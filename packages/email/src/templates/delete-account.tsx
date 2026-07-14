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

interface DeleteAccountProps {
  name?: string;
  // The confirmation URL (carries the Better Auth delete-account token). Defaulted
  // only so the preview CLI renders a representative link.
  url?: string;
}

/**
 * Account-deletion confirmation template (P2-2). Sent to the account's address when
 * a signed-in deletion is requested and email is configured — the deletion only
 * happens once this link is opened, so a hijacked session can't silently destroy the
 * account. The link completes via Better Auth's /delete-user/callback, which requires
 * an ACTIVE session in the browser that opens it (single-use token, expires in 24h).
 *
 * Keep templates pure (no `server-only`) so the preview/render tooling can import
 * them directly. The default export is required by the `email` preview CLI (a
 * framework exception to the named-exports-only rule, like Next.js page files).
 */
export function DeleteAccount({
  name = "there",
  url = "https://example.com/confirm-account-deletion",
}: DeleteAccountProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm the request to permanently delete your account.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Confirm account deletion</Heading>
          <Text style={paragraph}>
            Hi {name}, a request was made to <strong>permanently delete your account</strong>. This
            removes your profile and all of your data, and it cannot be undone.
          </Text>
          <Text style={paragraph}>
            To continue, open the link below in a browser where you're signed in. It works once and
            expires in 24 hours.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={url}>
              Permanently delete my account
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
            If you didn't request this, you can safely ignore this email — your account is
            untouched. Consider changing your password to keep your account secure.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default DeleteAccount;

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
  backgroundColor: "#dc2626",
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
