"use server";

import { auth } from "@repo/auth";
import { db } from "@repo/db";
import { user } from "@repo/db/schema";
import { updateNameSchema } from "@repo/validators";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

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
