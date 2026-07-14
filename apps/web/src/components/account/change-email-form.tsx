"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { type ChangeEmailInput, changeEmailSchema } from "@repo/validators";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "@/i18n/navigation";

type Status =
  | { kind: "idle" }
  // Current email verified → a confirmation link was sent to the CURRENT address (hop 1).
  // This is standing, multi-step guidance the user must act on, so it stays INLINE rather
  // than a transient toast; the immediate-change and error outcomes are toasts (A1).
  | { kind: "confirmation-sent"; newEmail: string };

// Signed-in email change (M5 → M6). Like ChangePasswordForm, this goes through the Better
// Auth client (the C1 convention — not a Server Action), which re-validates server-side
// and returns `{ data, error }` rather than throwing. Same-origin, so no CSP origin.
//
// Two outcomes, decided server-side by whether the CURRENT email is verified — which
// the page knows, so we branch the success copy on the `emailVerified` prop rather than
// the response (Better Auth returns a neutral `{ status: true }` either way, and also for
// an already-taken address, so it never leaks email existence):
//   - unverified (e.g. email env unset) → change applied immediately; refresh to show it.
//   - verified → TWO-HOP (M6): a confirmation link is sent to the CURRENT/old address (hop 1).
//     Approving it makes Better Auth email the NEW address its own verification (hop 2);
//     clicking THAT applies the change. So the copy points the user at their current inbox,
//     not the new one. See AUTH.md → Account page.
export function ChangeEmailForm({ emailVerified }: { emailVerified: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const form = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: "" },
  });

  async function onSubmit(values: ChangeEmailInput) {
    setStatus({ kind: "idle" });
    const { error } = await authClient.changeEmail({
      newEmail: values.newEmail,
      // Where Better Auth redirects after the user confirms via the emailed link.
      callbackURL: "/account",
    });
    if (error) {
      toast.error(error.message ?? "Could not change your email. Please try again.");
      return;
    }

    form.reset({ newEmail: "" });
    if (emailVerified) {
      setStatus({ kind: "confirmation-sent", newEmail: values.newEmail });
    } else {
      // Applied in place — re-read the server session so the page shows the new address.
      toast.success("Email updated.");
      router.refresh();
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="newEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : "Update email"}
        </Button>
        {status.kind === "confirmation-sent" ? (
          <p className="text-sm text-muted-foreground" role="status">
            We sent a confirmation link to your current email address. Open it to continue — then
            we'll email {status.newEmail} a final verification link to finish the change.
          </p>
        ) : null}
      </form>
    </Form>
  );
}
