"use client";

import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import {
  ATTENDEE_RESPONSES,
  type AttendeeResponse,
  type AttendeeStatus,
} from "@repo/validators/calendar";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { respondToEvent } from "@/server/actions/calendar";

/**
 * Accept, decline or maybe — the only write an attendee is allowed to make.
 *
 * It sends the **series** id and nothing else. Per-occurrence RSVP would need an attendee
 * — who has no write access to the organizer's calendar — to materialise an override row
 * for the response to hang off, which is a privilege-escalation shape rather than a free
 * feature (decision 6). The attendee row itself is the authorization; there is no
 * calendar id here for anyone to point at.
 *
 * **The chosen answer is held locally rather than re-read after `router.refresh()`.** A
 * refresh issued right after a mutation can be superseded before it commits, which would
 * leave the buttons showing the previous answer while the database holds the new one —
 * so the surface that just wrote is the surface that reflects it. `onResponded` lets a
 * list owner invalidate its own query alongside.
 */
export function RsvpControl({
  eventId,
  status,
  onResponded,
}: {
  eventId: string;
  status: AttendeeStatus;
  onResponded?: () => void;
}) {
  const t = useTranslations("Calendar.attendees");
  const [current, setCurrent] = useState<AttendeeStatus>(status);
  const [pending, setPending] = useState(false);

  async function respond(next: AttendeeResponse) {
    setPending(true);
    const result = await respondToEvent({ eventId, status: next, comment: null });
    setPending(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setCurrent(next);
    toast.success(t(`responded.${next}`));
    onResponded?.();
  }

  return (
    // A real `<fieldset>` rather than `role="group"`, the same shape `edit-scope-dialog`
    // uses: the three buttons are one choice, and the legend names it for a screen reader
    // without adding a second visible heading.
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">{t("rsvpLabel")}</legend>
      {ATTENDEE_RESPONSES.map((response) => (
        <Button
          key={response}
          type="button"
          size="sm"
          variant={current === response ? "default" : "outline"}
          disabled={pending}
          aria-pressed={current === response}
          data-testid={`rsvp-${response}`}
          onClick={() => void respond(response)}
        >
          {t(`respond.${response}`)}
        </Button>
      ))}
    </fieldset>
  );
}
