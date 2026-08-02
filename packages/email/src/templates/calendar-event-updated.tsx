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

interface CalendarEventUpdatedProps {
  organizerEmail?: string;
  eventTitle?: string;
  // Pre-formatted by the caller; this package never formats a date.
  when?: string;
  location?: string | null;
  rsvpUrl?: string;
  /**
   * True when the change moved the event in time and the guest is being asked again.
   * Only a time or recurrence change sets this — a venue or title edit re-sends without
   * re-asking, because re-asking on every edit trains people to ignore the question.
   */
  reask?: boolean;
}

/**
 * Calendar update (Phase 4). Sent when a change alters the emitted `.ics` body, with a
 * fresh attachment carrying the same `UID` and a bumped `SEQUENCE` — a client ignores a
 * re-import whose `SEQUENCE` has not increased, so without the bump the attachment is inert.
 */
export function CalendarEventUpdated({
  organizerEmail = "organizer@example.com",
  eventTitle = "an event",
  when = "Monday, 10 August 2026 at 09:00",
  location = null,
  rsvpUrl = "https://example.com/rsvp/example",
  reask = false,
}: CalendarEventUpdatedProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {eventTitle} was updated by {organizerEmail}.
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Event updated</Heading>
          <Text style={paragraph}>
            {organizerEmail} updated <strong>{eventTitle}</strong>.
          </Text>
          <Text style={detail}>{when}</Text>
          {location ? <Text style={detail}>{location}</Text> : null}

          {reask ? (
            <>
              <Text style={paragraph}>
                The time changed, so your earlier answer no longer applies. Can you still make it?
              </Text>
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
            </>
          ) : (
            <Text style={paragraph}>Your answer still stands. You can change it at any time:</Text>
          )}

          <Text style={paragraph}>
            <a href={rsvpUrl} style={link}>
              {rsvpUrl}
            </a>
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            The attached calendar file replaces the earlier version in your own calendar.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CalendarEventUpdated;

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
