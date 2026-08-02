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

interface CalendarInvitationProps {
  // The organizer's address — there is no stored display name for a calendar owner.
  organizerEmail?: string;
  eventTitle?: string;
  // Pre-formatted by the caller. This package never formats a date: the reader's locale
  // and time zone live in apps/web (next-intl + user_preferences), not here.
  when?: string;
  location?: string | null;
  // The public /rsvp link. The three buttons below carry an `intent` the page preselects;
  // the answer is only written by a POST from that page, never by opening a link — a
  // corporate mail scanner that follows every URL must not be able to RSVP for someone.
  rsvpUrl?: string;
}

/**
 * Calendar invitation (Phase 4). Sent to every newly added guest, with the event's `.ics`
 * attached as `METHOD:PUBLISH`.
 *
 * **The three buttons here are the only RSVP path, and that is the design.** A `REQUEST`
 * `.ics` would make Gmail render its own Yes/No/Maybe, which emails a `METHOD:REPLY` to the
 * organizer address — nothing here reads inbound mail, so the guest would believe they had
 * answered while the database never heard. See docs/context/calendar/invitations.md.
 */
export function CalendarInvitation({
  organizerEmail = "organizer@example.com",
  eventTitle = "an event",
  when = "Monday, 10 August 2026 at 09:00",
  location = null,
  rsvpUrl = "https://example.com/rsvp/example",
}: CalendarInvitationProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {organizerEmail} invited you to {eventTitle}.
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>You're invited</Heading>
          <Text style={paragraph}>
            {organizerEmail} invited you to <strong>{eventTitle}</strong>.
          </Text>
          <Text style={detail}>{when}</Text>
          {location ? <Text style={detail}>{location}</Text> : null}

          <Text style={paragraph}>Will you attend?</Text>
          <Section style={buttonContainer}>
            <Button style={button} href={`${rsvpUrl}?intent=accepted`}>
              Yes
            </Button>{" "}
            <Button style={secondaryButton} href={`${rsvpUrl}?intent=declined`}>
              No
            </Button>{" "}
            <Button style={secondaryButton} href={`${rsvpUrl}?intent=tentative`}>
              Maybe
            </Button>
          </Section>

          <Text style={paragraph}>
            Or paste this link into your browser:
            <br />
            <a href={rsvpUrl} style={link}>
              {rsvpUrl}
            </a>
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            The attached calendar file lets you add this event to your own calendar. Answering there
            does not reach the organizer — use the buttons above.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CalendarInvitation;

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

const detail = {
  fontSize: "16px",
  lineHeight: "22px",
  color: "#0f172a",
  fontWeight: "600",
  margin: "4px 0",
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

const secondaryButton = {
  ...button,
  backgroundColor: "#ffffff",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
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
