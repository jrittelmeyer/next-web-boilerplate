"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { requestPasswordReset } from "@repo/auth/client";
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
import { type ForgotPasswordInput, forgotPasswordSchema } from "@repo/validators";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "@/i18n/navigation";
import { AuthCard } from "./auth-card";
import { CaptchaWidget, type CaptchaWidgetHandle } from "./captcha-widget";

// Request a password-reset link. `redirectTo` is the relative path Better Auth bakes
// into the email link (a trusted same-origin path). We always show the same neutral
// confirmation regardless of whether the address exists — no account enumeration. With
// email unconfigured (default), the send no-ops; outside production the link is logged.
export function ForgotPasswordForm({ captchaSiteKey }: { captchaSiteKey?: string }) {
  const t = useTranslations("Auth.forgotPassword");
  const tc = useTranslations("Auth.common");
  const [sent, setSent] = useState(false);
  // CAPTCHA (A12): token for the x-captcha-response header on /request-password-reset.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<CaptchaWidgetHandle>(null);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    // Ignore the result on purpose: a neutral response either way avoids leaking
    // whether an account exists. (A transport failure would reject; RHF surfaces it.)
    await requestPasswordReset({
      email: values.email,
      redirectTo: "/reset-password",
      ...(captchaToken
        ? { fetchOptions: { headers: { "x-captcha-response": captchaToken } } }
        : {}),
    });
    // Single-use token — reset in case the widget outlives this submit.
    captchaRef.current?.reset();
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard
        title={t("sentTitle")}
        description={t("sentDescription")}
        footer={
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            {tc("backToSignIn")}
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">{t("sentHint")}</p>
      </AuthCard>
    );
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
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tc("email")}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder={tc("emailPlaceholder")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {captchaSiteKey ? (
            <CaptchaWidget ref={captchaRef} siteKey={captchaSiteKey} onToken={setCaptchaToken} />
          ) : null}
          <Button
            type="submit"
            disabled={form.formState.isSubmitting || (Boolean(captchaSiteKey) && !captchaToken)}
          >
            {form.formState.isSubmitting ? t("submitting") : t("submit")}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
