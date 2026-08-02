"use server";

import { db } from "@repo/db";
import { calendarEventAttendees, calendarEvents, calendars } from "@repo/db/schema";
import { type ActionResult, zodFieldErrors } from "@repo/validators";
import { ATTENDEE_RESPONSES, type AttendeeResponse } from "@repo/validators/calendar";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { rsvpCookieName, verifyRsvpToken } from "@/lib/calendar-tokens";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";
import {
  createNotifications,
  type NewNotificationInput,
  publishNotifications,
} from "@/server/notifications/create";

/**
 * The one Server Action in this app that is **not** session-gated, and it lives in its own
 * file for exactly that reason.
 *
 * Every export in `server/actions/calendar.ts` opens with `requireSession()`. Putting the
 * single function that must not beside forty that must would make the omission read as an
 * oversight somebody will helpfully "fix" — and the fix would lock every external guest out
 * of answering. The authorization here is the **token**, and through it the attendee row,
 * exactly as `respondToEvent`'s authorization is the attendee row itself (attendees.md).
 *
 * See docs/context/calendar/invitations.md.
 */

const GENERIC_FAILURE = "This invitation link is no longer valid." as const;
const RATE_LIMITED = "Too many requests. Please wait a moment and try again." as const;

/**
 * The client sends the **handle**, never the token.
 *
 * The token lives in an httpOnly cookie the `/rsvp/[token]` route exchanged it into, so it
 * never reaches the browser's DOM, its history, PostHog's `$current_url`, Sentry's
 * `request.url`, or a `Referer`. The handle is a non-secret derivation that names which
 * cookie to read, which is what lets two invitations sit open in two tabs without one
 * overwriting the other.
 */
const respondByTokenSchema = z.object({
  handle: z.string().min(1).max(64),
  status: z.enum(ATTENDEE_RESPONSES),
  comment: z.string().trim().max(500).nullable(),
});

/** `needs-action` is not submittable, mirroring `respondToEventSchema`. */
export type RespondByTokenValues = z.input<typeof respondByTokenSchema>;

const RESPONSE_TYPES = {
  accepted: "calendar_response_accepted",
  declined: "calendar_response_declined",
  tentative: "calendar_response_tentative",
} as const satisfies Record<AttendeeResponse, NewNotificationInput["type"]>;

/**
 * Record an RSVP from the public `/rsvp` page.
 *
 * **A POST, never a GET, and the email's buttons link to the page rather than to this.**
 * Corporate mail scanners follow every URL in an inbound message; a link that recorded an
 * answer would have those scanners answering on the guest's behalf, which is the same class
 * of lie as the Gmail buttons this whole design removed.
 *
 * Rate-limited by client IP. That is **abuse dampening, not the defence** — the limiter is
 * in-memory per instance without Upstash and fails open, and IP-less requests share one
 * bucket. What makes forgery infeasible is the HMAC.
 */
export async function respondByToken(
  input: RespondByTokenValues,
): Promise<ActionResult<{ status: AttendeeResponse }>> {
  const limit = await rateLimit(`calendar:rsvp:respond:${clientKeyFromHeaders(await headers())}`, {
    limit: 20,
    windowSec: 60,
  });
  if (!limit.success) return { error: RATE_LIMITED };

  const parsed = respondByTokenSchema.safeParse(input);
  if (!parsed.success) {
    return { error: GENERIC_FAILURE, fieldErrors: zodFieldErrors(parsed.error) };
  }

  const token = (await cookies()).get(rsvpCookieName(parsed.data.handle))?.value;
  if (token === undefined) return { error: GENERIC_FAILURE };

  const attendeeId = verifyRsvpToken(token, Date.now());
  if (attendeeId === null) return { error: GENERIC_FAILURE };

  // `null` distinguishes "the row was not there" from "there was nobody to notify", which
  // an empty array would collapse into the success path.
  let payloads: Awaited<ReturnType<typeof createNotifications>> | null;
  try {
    payloads = await db.transaction(async (tx) => {
      // Scoped to a live event in the UPDATE itself rather than checked first: a soft
      // delete landing between a check and a write would otherwise record an answer to a
      // cancelled meeting.
      const [row] = await tx
        .update(calendarEventAttendees)
        .set({
          status: parsed.data.status,
          comment: parsed.data.comment,
          // Unconditional, and safe because ATTENDEE_RESPONSES excludes `needs-action` —
          // the only status that would contradict the bidirectional `responded_pair` CHECK.
          // This is also what clears staleness: `responded_at < reask_at` stops being true.
          respondedAt: sql`now()`,
        })
        .where(
          and(
            eq(calendarEventAttendees.id, attendeeId),
            sql`EXISTS (SELECT 1 FROM ${calendarEvents}
                         WHERE ${calendarEvents.id} = ${calendarEventAttendees.eventId}
                           AND ${calendarEvents.deletedAt} IS NULL)`,
          ),
        )
        .returning({
          email: calendarEventAttendees.email,
          eventId: calendarEventAttendees.eventId,
        });
      if (!row) return null;

      // **`user_id` is deliberately NOT stamped here.** The signed-in claim path stamps it
      // because a session proves who the caller is; a token proves only that whoever holds
      // the link was sent it, which is not the same fact and must not be recorded as one.
      const [event] = await tx
        .select({ title: calendarEvents.title, ownerId: calendars.userId })
        .from(calendarEvents)
        .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
        .where(and(eq(calendarEvents.id, row.eventId), isNull(calendarEvents.deletedAt)))
        .limit(1);
      if (!event) return null;

      return await createNotifications(tx, [
        {
          userId: event.ownerId,
          type: RESPONSE_TYPES[parsed.data.status],
          body: row.email,
          title: event.title,
          link: `/calendar/event/${row.eventId}`,
        },
      ]);
    });
  } catch {
    // Deliberately terse and identical to the not-found answer: an unauthenticated caller
    // learns nothing about whether the row existed.
    return { error: GENERIC_FAILURE };
  }

  if (payloads === null) return { error: GENERIC_FAILURE };

  await publishNotifications(payloads);
  revalidatePath("/calendar/invites");
  return { data: { status: parsed.data.status } };
}
