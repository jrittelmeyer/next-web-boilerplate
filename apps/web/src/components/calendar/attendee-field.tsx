"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { type AttendeeValues, MAX_ATTENDEES } from "@repo/validators/calendar";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * The composer's guest list: a text input and a row of chips.
 *
 * **No combobox and no new dependency.** Phase 3 invites by *address* — the guest list
 * renders the email as typed and never resolves it to a name (decision 11), so there is
 * nothing to autocomplete against and `cmdk` would be a directory picker with no
 * directory behind it. That dependency belongs to the Phase-6/7 people picker.
 *
 * Lower-cased and de-duplicated here as a UX affordance, not as the guard: the same
 * normalisation runs again in `attendeeInputSchema` and a third time in
 * `calendar_event_attendees_email_lower`. What it buys is that typing `Guest@Example.com`
 * over an existing `guest@example.com` reads as "already invited" rather than surfacing
 * later as a generic write error from `unique(event_id, email)`.
 *
 * Enter adds a chip and does **not** submit the form. Without the `preventDefault` the
 * first address someone types would save the event instead of being added to it.
 */
export function AttendeeField({
  value,
  onChange,
}: {
  value: readonly AttendeeValues[] | undefined;
  onChange: (next: AttendeeValues[]) => void;
}) {
  const t = useTranslations("Calendar.attendees");
  const [draft, setDraft] = useState("");

  const attendees = value ?? [];
  const full = attendees.length >= MAX_ATTENDEES;

  function add() {
    const email = draft.trim().toLowerCase();
    if (!email || full) return;
    setDraft("");
    if (attendees.some((attendee) => attendee.email.trim().toLowerCase() === email)) return;
    // `role` is written explicitly rather than left to the schema default: Phase 3 has no
    // surface that edits a role, and an absent key would make the submitted list and the
    // stored one differ in shape for no reason.
    onChange([...attendees, { email, role: "required" }]);
  }

  function remove(email: string) {
    onChange(attendees.filter((attendee) => attendee.email !== email));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="email"
          data-testid="event-attendees"
          value={draft}
          disabled={full}
          placeholder={t("placeholder")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            add();
          }}
        />
        <Button type="button" variant="outline" onClick={add} disabled={full || !draft.trim()}>
          {t("add")}
        </Button>
      </div>

      {attendees.length > 0 ? (
        <ul className="flex flex-wrap gap-2" data-testid="event-attendee-chips">
          {attendees.map((attendee) => (
            <li
              key={attendee.email}
              className="flex items-center gap-1 rounded-full border px-3 py-1 text-sm"
            >
              {attendee.email}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("remove", { email: attendee.email })}
                onClick={() => remove(attendee.email)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {full ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("full", { max: MAX_ATTENDEES })}
        </p>
      ) : null}
    </div>
  );
}
