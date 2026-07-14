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

interface WelcomeEmailProps {
  name?: string;
}

/**
 * Generic example template. React Email components render to email-safe HTML.
 * Keep templates pure (no `server-only`) so the preview/render tooling can import
 * them directly. The default export is required by the `email` preview CLI (a
 * framework exception to the named-exports-only rule, like Next.js page files).
 */
export function WelcomeEmail({ name = "there" }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome aboard — let's get you started.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Welcome, {name}!</Heading>
          <Text style={paragraph}>
            Thanks for signing up. We're glad you're here. Click below to get started.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href="https://example.com">
              Get started
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            If you didn't create this account, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WelcomeEmail;

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

const hr = {
  borderColor: "#e2e8f0",
  margin: "24px 0",
};

const footer = {
  fontSize: "13px",
  color: "#94a3b8",
};
