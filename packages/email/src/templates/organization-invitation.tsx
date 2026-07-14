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

interface OrganizationInvitationProps {
  // Who sent the invite (falls back to a neutral phrase if unknown).
  inviterName?: string;
  // The organization the recipient is being invited to.
  organizationName?: string;
  // The role they'll get on acceptance (owner/admin/member).
  role?: string;
  // The accept-invitation URL (carries the Better Auth invitation id). Defaulted only
  // so the preview CLI renders a representative link.
  url?: string;
}

/**
 * Organization-invitation template (wired to the Better Auth `organization()` plugin's
 * `sendInvitationEmail`). Same pure-template conventions as the other emails (no
 * `server-only`; default export for the preview CLI).
 */
export function OrganizationInvitation({
  inviterName = "Someone",
  organizationName = "an organization",
  role = "member",
  url = "https://example.com/accept-invitation/example",
}: OrganizationInvitationProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {inviterName} invited you to join {organizationName}.
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>You've been invited</Heading>
          <Text style={paragraph}>
            {inviterName} has invited you to join <strong>{organizationName}</strong> as a {role}.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={url}>
              Accept invitation
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
            If you weren't expecting this invitation, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default OrganizationInvitation;

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
