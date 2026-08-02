import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from "@react-email/components";

interface CalendarEventCancelledProps {
  organizerEmail?: string;
  eventTitle?: string;
  // Pre-formatted by the caller; this package never formats a date.
  when?: string;
  /**
   * Which of the two very different things happened.
   *
   * `cancelled` — the event is gone for everybody, and this email carries a
   * `STATUS:CANCELLED` attachment so a guest who added it can have their client remove it.
   *
   * `removed` — the event still exists; this guest is no longer on its list. **No
   * attachment**, deliberately: `STATUS:CANCELLED` would tell the client to delete an event
   * that is still going ahead for everyone else, and `PUBLISH` has no vocabulary for
   * "you specifically are uninvited". See docs/context/calendar/invitations.md.
   */
  reason?: "cancelled" | "removed";
}

/** Calendar cancellation / removal (Phase 4). */
export function CalendarEventCancelled({
  organizerEmail = "organizer@example.com",
  eventTitle = "an event",
  when = "Monday, 10 August 2026 at 09:00",
  reason = "cancelled",
}: CalendarEventCancelledProps) {
  const cancelled = reason === "cancelled";
  return (
    <Html>
      <Head />
      <Preview>
        {cancelled ? `${eventTitle} was cancelled.` : `You were removed from ${eventTitle}.`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>{cancelled ? "Event cancelled" : "You were removed"}</Heading>
          {cancelled ? (
            <Text style={paragraph}>
              {organizerEmail} cancelled <strong>{eventTitle}</strong>.
            </Text>
          ) : (
            <Text style={paragraph}>
              {organizerEmail} removed you from <strong>{eventTitle}</strong>. The event is still
              going ahead for everyone else.
            </Text>
          )}
          <Text style={detail}>{when}</Text>
          <Hr style={hr} />
          <Text style={footer}>
            {cancelled
              ? "The attached calendar file removes this event from your own calendar."
              : "If you added this event to your own calendar, remove it there — we cannot do that for you."}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CalendarEventCancelled;

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
  color: "#64748b",
  textDecoration: "line-through",
  margin: "4px 0",
};

const hr = {
  borderColor: "#e2e8f0",
  margin: "24px 0",
};

const footer = {
  fontSize: "13px",
  color: "#94a3b8",
};
