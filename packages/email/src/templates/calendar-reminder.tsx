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

interface CalendarReminderProps {
  eventTitle?: string;
  // Pre-formatted by the sweeper through `formatEventWhen` — the event's own time in the
  // event's own zone, with the zone named. See src/format.ts for why that lives here now.
  when?: string;
  location?: string | null;
  /**
   * Absolute link to the event, or `null` when the worker has no base URL configured.
   *
   * Nullable on purpose and not merely optional: `@repo/jobs` validates `SITE_URL` as
   * optional, and a template that interpolated a missing one would put the literal string
   * "undefined/calendar/event/…" into a real person's inbox. The email is still useful
   * without it — it says what and when — so the button is simply omitted.
   */
  eventUrl?: string | null;
  /** Whole minutes until the event starts, already rounded to the nearest 5 by the sweeper. */
  startsInMinutes?: number;
}

/**
 * Calendar reminder (Phase 5) — sent by the sweeper when a reminder's fire time arrives.
 *
 * **No `.ics` is attached**, unlike every other calendar email. A reminder is not a change
 * to the event: attaching one would raise no `SEQUENCE`, so a conforming client would ignore
 * it anyway, and a client that did honour it would be re-adding an event the reader already
 * has. See docs/context/calendar/reminders.md.
 */
export function CalendarReminder({
  eventTitle = "an event",
  when = "Monday, 10 August 2026 at 09:00 (UTC)",
  location = null,
  eventUrl = "https://example.com/calendar/event/example",
  startsInMinutes = 15,
}: CalendarReminderProps) {
  // **Zero is a reachable value, not a defensive branch** — found by live-verify, not by
  // reasoning: the sweeper clamps `startsInMinutes` at 0, and a reminder caught by the
  // 60-minute grace window (a worker that was down, a missed tick) is dispatched *after*
  // its fire time. Without this the email reads "starts in about 0 minutes", which is both
  // wrong and the exact case a late reminder is most likely to be.
  const lede =
    startsInMinutes > 0 ? `starts in about ${startsInMinutes} minutes` : "is starting now";

  return (
    <Html>
      <Head />
      {/* Preview children are typed as string, not ReactNode — interpolate, don't nest. */}
      <Preview>{`${eventTitle} ${lede}.`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Reminder</Heading>
          <Text style={paragraph}>
            <strong>{eventTitle}</strong> {lede}.
          </Text>
          <Text style={detail}>{when}</Text>
          {location ? <Text style={detail}>{location}</Text> : null}

          {eventUrl ? (
            <Section style={buttonContainer}>
              <Button style={button} href={eventUrl}>
                Open the event
              </Button>
            </Section>
          ) : null}

          <Hr style={hr} />
          <Text style={footer}>
            Reminders are delivered every few minutes, so the timing is approximate. You can change
            or remove this reminder on the event itself.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CalendarReminder;

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

const hr = {
  borderColor: "#e2e8f0",
  margin: "24px 0",
};

const footer = {
  fontSize: "13px",
  color: "#94a3b8",
};
