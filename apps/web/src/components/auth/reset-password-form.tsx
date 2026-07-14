"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { resetPassword } from "@repo/auth/client";
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
import { type ResetPasswordInput, resetPasswordSchema } from "@repo/validators";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "@/i18n/navigation";
import { AuthCard } from "./auth-card";

// Set a new password from the emailed link. The `token` arrives in the URL query
// (?token=…); the page reads it and passes it here. A missing token means the link was
// malformed or visited directly, so we short-circuit to a helpful dead-end. On success
// we point the user back to sign in rather than auto-authenticating.
export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useTranslations("Auth.resetPassword");
  const tc = useTranslations("Auth.common");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "error"; message: string } | { kind: "done" }
  >({ kind: "idle" });
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "" },
  });

  if (!token) {
    return (
      <AuthCard
        title={t("invalidTitle")}
        description={t("invalidDescription")}
        footer={
          <Link
            href="/forgot-password"
            className="text-foreground underline-offset-4 hover:underline"
          >
            {t("requestNew")}
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">{t("invalidHint")}</p>
      </AuthCard>
    );
  }

  if (status.kind === "done") {
    return (
      <AuthCard
        title={t("doneTitle")}
        description={t("doneDescription")}
        footer={
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            {t("goToSignIn")}
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">{t("doneHint")}</p>
      </AuthCard>
    );
  }

  async function onSubmit(values: ResetPasswordInput) {
    setStatus({ kind: "idle" });
    const { error } = await resetPassword({ newPassword: values.password, token: token as string });
    if (error) {
      setStatus({
        kind: "error",
        message: error.message ?? t("error"),
      });
      return;
    }
    setStatus({ kind: "done" });
  }

  return (
    <AuthCard
      title={t("title")}
      description={t("description")}
      footer={
        <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
          {tc("backToSignIn")}
        </Link>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("newPassword")}</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {status.kind === "error" ? (
            <p className="text-sm text-destructive" role="alert">
              {status.message}
            </p>
          ) : null}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("submitting") : t("submit")}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
