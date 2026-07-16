"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toast } from "@repo/ui/components/sonner";
import { type DeleteAccountInput, deleteAccountSchema } from "@repo/validators";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { useForm } from "react-hook-form";

// Client-side intent gate for OAuth-only users (no password to prove intent with).
const CONFIRM_PHRASE = "delete my account";

type Status =
  | { kind: "idle" }
  // Email configured → Better Auth emailed a confirmation link instead of deleting. This is
  // standing, act-on-it guidance, so it stays INLINE rather than a transient toast; errors
  // are toasts (A1), and the immediate-delete flow navigates away with no message.
  | { kind: "email-sent" };

/**
 * Map the deleteUser error codes the card can actually provoke to actionable copy
 * (as message keys under Account.delete). SESSION_EXPIRED is the no-password
 * freshness gate (OAuth-only user, session older than `session.freshAge`, 24h
 * default) — deletion isn't blocked, it just needs a recent sign-in; a supplied
 * password skips that gate entirely, so the password variant never sees it.
 */
function friendlyErrorKey(error: {
  code?: string;
  message?: string;
}): "errorPassword" | "errorFreshness" | null {
  if (error.code === "INVALID_PASSWORD") return "errorPassword";
  if (error.code === "SESSION_EXPIRED") return "errorFreshness";
  return null;
}

// Danger-zone account deletion (P2-2). Calls Better Auth's `deleteUser` via the
// client (C1 convention — re-validated server-side, `{ data, error }`, no throw).
// Which flow runs is decided SERVER-side by whether email is configured (see
// `user.deleteUser` in packages/auth): configured → a confirmation link is emailed
// and nothing is deleted until it's opened; unset → the deletion is immediate. The
// card branches its post-submit copy on the RESPONSE message (a typed enum in the
// endpoint contract — "User deleted" | "Verification email sent") so the UI can't
// drift from what the server actually did; `emailConfigured` only shapes the
// warning copy shown up front.
//
// Intent confirmation: users with a credential account must type their password
// (verified server-side before anything happens — and in the immediate flow it also
// skips the session-freshness gate); OAuth-only users type a confirm phrase instead
// (client-side only — server-side they ride the freshness gate, mapped to friendly
// copy above). Two-stage reveal, inline rather than a dialog: @repo/ui carries no
// modal primitive and the page's other cards are all inline forms.
export function DeleteAccountCard({
  hasPassword,
  emailConfigured,
}: {
  hasPassword: boolean;
  emailConfigured: boolean;
}) {
  const t = useTranslations("Account.delete");
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [phrase, setPhrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const phraseId = useId();
  const form = useForm<DeleteAccountInput>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { password: "" },
  });

  async function requestDeletion(password?: string) {
    setStatus({ kind: "idle" });
    const { data, error } = await authClient.deleteUser({
      ...(password === undefined ? {} : { password }),
      // Rides the emailed link in the verification flow: /delete-user/callback
      // deletes and then redirects here. Unused by the immediate flow (JSON
      // response; we navigate ourselves below).
      callbackURL: "/goodbye",
    });
    if (error) {
      const key = friendlyErrorKey(error);
      toast.error(key ? t(key) : (error.message ?? t("errorGeneric")));
      return;
    }
    if (data?.message === "Verification email sent") {
      setStatus({ kind: "email-sent" });
      setRevealed(false);
      form.reset({ password: "" });
      setPhrase("");
      return;
    }
    // Immediate flow: the account is already gone and the endpoint cleared the
    // session cookie. Full navigation — not router.* — so every piece of client
    // state dies with the account; never gate UI on router.refresh() committing
    // (Next 16.2.9 race, see AUTH.md).
    window.location.assign("/goodbye");
  }

  async function onPhraseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phrase.trim() !== CONFIRM_PHRASE || submitting) return;
    setSubmitting(true);
    await requestDeletion();
    setSubmitting(false);
  }

  function cancel() {
    setRevealed(false);
    setStatus({ kind: "idle" });
    form.reset({ password: "" });
    setPhrase("");
  }

  const busy = form.formState.isSubmitting || submitting;

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("description")} {emailConfigured ? t("emailNote") : t("immediateNote")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {revealed ? (
          hasPassword ? (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((values) => requestDeletion(values.password))}
                className="flex flex-col gap-4"
                noValidate
              >
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("confirmPassword")}</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-2">
                  <Button type="submit" variant="destructive" disabled={busy}>
                    {busy ? t("deleting") : t("submit")}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={cancel}>
                    {t("cancel")}
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <form onSubmit={onPhraseSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={phraseId}>
                  {t.rich("phraseLabel", {
                    phrase: CONFIRM_PHRASE,
                    strong: (chunks) => <span className="font-semibold">{chunks}</span>,
                  })}
                </Label>
                <Input
                  id={phraseId}
                  value={phrase}
                  onChange={(event) => setPhrase(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={busy || phrase.trim() !== CONFIRM_PHRASE}
                >
                  {busy ? t("deleting") : t("submit")}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={cancel}>
                  {t("cancel")}
                </Button>
              </div>
            </form>
          )
        ) : (
          <div>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setStatus({ kind: "idle" });
                setRevealed(true);
              }}
            >
              {t("reveal")}
            </Button>
          </div>
        )}
        {status.kind === "email-sent" ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("emailSent")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
