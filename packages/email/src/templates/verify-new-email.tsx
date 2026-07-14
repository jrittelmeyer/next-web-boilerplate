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

interface VerifyNewEmailProps {
  name?: string;
  // The verification URL (carries the Better Auth change-email token). Defaulted
  // only so the preview CLI renders a representative link.
  url?: string;
}

/**
 * New-address verification template (M7, hop-2 of the two-hop email change). Sent to
 * the user's NEW address after they confirm the change from their old address — so
 * the copy is "confirm your new address to finish the change," not "activate your
 * account" (that's the sign-up VerifyEmail this used to reuse). The /account flow
 * picks this template over VerifyEmail by inspecting the token's request type.
 *
 * Keep templates pure (no `server-only`) so the preview/render tooling can import
 * them directly. The default export is required by the `email` preview CLI (a
 * framework exception to the named-exports-only rule, like Next.js page files).
 */
export function VerifyNewEmail({
  name = "there",
  url = "https://example.com/verify-new-email",
}: VerifyNewEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your new email address to finish the change.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Confirm your new email address</Heading>
          <Text style={paragraph}>
            Hi {name}, you're almost done. Confirm this address to finish changing the email on your
            account — once confirmed, you'll sign in with it from now on.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={url}>
              Confirm new address
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
            If you didn't request this change, you can safely ignore this email — your account's
            email address won't change.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default VerifyNewEmail;

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
