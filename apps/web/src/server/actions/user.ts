"use server";

import { auth } from "@repo/auth";
import { canonicalizeTimeZone } from "@repo/calendar";
import { db } from "@repo/db";
import { user, userPreferences } from "@repo/db/schema";
import {
  type ActionResult as SharedActionResult,
  type UpdateUserPreferencesInput,
  updateNameSchema,
  updateUserPreferencesSchema,
  zodFieldErrors,
} from "@repo/validators";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";

type ActionResult = { error: string } | { data: { name: string } };

/**
 * Mutations live in Server Actions (not tRPC) for progressive enhancement. The
 * proxy gate is optimistic, so the session is re-checked here authoritatively.
 */
export async function updateUserName(formData: FormData): Promise<ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Unauthorized" };

  const parsed = updateNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db.update(user).set({ name: parsed.data.name }).where(eq(user.id, session.user.id));

  // /dashboard greets by email; /account is the real settings surface that shows
  // (and edits) the name — revalidate both so the change is reflected on return.
  revalidatePath("/dashboard");
  revalidatePath("/account");
  return { data: { name: parsed.data.name } };
}

type PreferencesResult = SharedActionResult<UpdateUserPreferencesInput>;

/** An empty form field means "inherit the default", which is stored as NULL. */
function optionalField(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? null : text;
}

/**
 * Per-user display preferences (time zone, week start, clock format).
 *
 * Follows the house order: auth → rate limit → validate → domain-validate →
 * write → revalidate → typed return. The zone's *existence* is checked here
 * rather than in the Zod schema because `@repo/validators` may not import
 * `@repo/calendar` — the dependency runs the other way.
 */
export async function updateUserPreferences(formData: FormData): Promise<PreferencesResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Unauthorized" };

  const limit = await rateLimit(`prefs:update:${session.user.id}`, { limit: 20, windowSec: 60 });
  if (!limit.success) {
    return { error: "Too many requests. Please wait a moment and try again." };
  }

  const rawWeekStart = optionalField(formData.get("weekStart"));
  const parsed = updateUserPreferencesSchema.safeParse({
    timeZone: optionalField(formData.get("timeZone")),
    weekStart: rawWeekStart === null ? null : Number(rawWeekStart),
    timeFormat: optionalField(formData.get("timeFormat")),
  });
  if (!parsed.success) {
    return { error: "Please fix the fields below.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  // Validated against the runtime's own IANA database, and stored verbatim rather
  // than as the "canonical" spelling: that spelling is not stable across Node
  // versions (this ICU build resolves Asia/Kolkata to Asia/Calcutta), so
  // normalising on write would make rows written by different versions disagree
  // as text while behaving identically.
  const { timeZone } = parsed.data;
  if (timeZone !== null && canonicalizeTimeZone(timeZone) === null) {
    return {
      error: "Please fix the fields below.",
      fieldErrors: { timeZone: "Unknown time zone" },
    };
  }

  const values = {
    userId: session.user.id,
    timeZone: parsed.data.timeZone,
    weekStart: parsed.data.weekStart,
    timeFormat: parsed.data.timeFormat,
  };
  await db
    .insert(userPreferences)
    .values(values)
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        timeZone: values.timeZone,
        weekStart: values.weekStart,
        timeFormat: values.timeFormat,
      },
    });

  // Every surface that renders an absolute timestamp, not just the one that owns
  // the setting — that is the whole point of the preference.
  revalidatePath("/account");
  revalidatePath("/admin/audit");
  return { data: parsed.data };
}
