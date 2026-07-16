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

interface MagicLinkEmailProps {
  // The one-time sign-in URL (carries the Better Auth token). Defaulted only so the
  // preview CLI renders a representative link.
  url?: string;
}

/**
 * Magic-link sign-in template (path-to-100 #6). Unlike the other account emails this
 * one carries no recipient name: the magicLink() plugin fires it for addresses that
 * may not have an account yet (sign-up-via-link), so `sendMagicLink` only provides
 * the email + URL. The expiry copy matches the plugin's default `expiresIn` (5
 * minutes) — keep them in sync if a fork tunes the option.
 */
export function MagicLinkEmail({ url = "https://example.com/magic-link" }: MagicLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your one-time sign-in link — it expires in 5 minutes.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Sign in to your account</Heading>
          <Text style={paragraph}>
            Click the button below to sign in. The link works once and expires in 5 minutes.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={url}>
              Sign in
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
            If you didn't request this link, you can safely ignore this email — nothing changes on
            your account.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default MagicLinkEmail;

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
