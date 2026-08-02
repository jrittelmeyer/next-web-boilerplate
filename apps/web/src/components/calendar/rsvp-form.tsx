"use client";

import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import {
  ATTENDEE_RESPONSES,
  type AttendeeResponse,
  type AttendeeStatus,
} from "@repo/validators/calendar";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { respondByToken } from "@/server/actions/calendar-rsvp";

/**
 * The public RSVP control — the signed-out twin of `RsvpControl`.
 *
 * **It holds a `handle`, not a token.** The token sits in an httpOnly cookie the
 * `/rsvp/[token]` route put there, so it never enters the DOM; the action reads the cookie
 * itself. See docs/context/calendar/invitations.md.
 *
 * **The email's Yes/No/Maybe arrive as an `intent` query parameter, and only preselect.**
 * A link that recorded the answer on GET would be answered by every corporate mail scanner
 * that follows URLs in an inbound message — the same class of lie as the Gmail reply buttons
 * this design removed, just with a different actor. The guest still presses a button.
 *
 * The chosen answer is held locally rather than re-read after a refresh: a refresh issued
 * right after a mutation can be superseded before it commits, leaving the buttons showing
 * the previous answer while the database holds the new one.
 */
export function RsvpForm({
  handle,
  recipient,
  status,
  stale,
}: {
  handle: string;
  recipient: string;
  status: AttendeeStatus;
  stale: boolean;
}) {
  const t = useTranslations("Rsvp");
  const intent = useSearchParams().get("intent");
  const [current, setCurrent] = useState<AttendeeStatus>(status);
  const [answered, setAnswered] = useState(false);
  const [pending, setPending] = useState(false);

  const suggested = ATTENDEE_RESPONSES.find((response) => response === intent);
  // An unanswered guest, or one whose answer went stale when the event moved, is being asked
  // rather than shown — so nothing is highlighted until they choose or the email suggested it.
  const highlighted = answered || (!stale && status !== "needs-action") ? current : suggested;

  async function respond(next: AttendeeResponse) {
    setPending(true);
    const result = await respondByToken({ handle, status: next, comment: null });
    setPending(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setCurrent(next);
    setAnswered(true);
    toast.success(t(`responded.${next}`));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("answeringAs", { email: recipient })}</p>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t("legend")}</legend>
        {ATTENDEE_RESPONSES.map((response) => (
          <Button
            key={response}
            type="button"
            variant={highlighted === response ? "default" : "outline"}
            disabled={pending}
            aria-pressed={highlighted === response}
            data-testid={`rsvp-${response}`}
            onClick={() => void respond(response)}
          >
            {t(`respond.${response}`)}
          </Button>
        ))}
      </fieldset>
      {answered ? <p className="text-sm font-medium">{t(`responded.${current}`)}</p> : null}
    </div>
  );
}
