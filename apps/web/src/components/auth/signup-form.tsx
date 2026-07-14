"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { authClient, signUp } from "@repo/auth/client";
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
import { type SignUpInput, signUpSchema } from "@repo/validators";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "@/i18n/navigation";
import type { OAuthProvider } from "@/lib/auth-providers";
import { AuthCard } from "./auth-card";
import { CaptchaWidget, type CaptchaWidgetHandle } from "./captcha-widget";
import { SocialSignIn } from "./social-sign-in";

// Email/password sign-up. `requiresVerification` is computed server-side from the
// email env (the page) so we degrade honestly: with email unconfigured (the default)
// Better Auth creates a session immediately and we redirect into the app; with email
// configured, sign-in is gated on verification, so we show a "check your inbox" state
// instead of bouncing the user to a dashboard they can't yet reach.
export function SignupForm({
  redirectTo,
  requiresVerification,
  providers,
  captchaSiteKey,
}: {
  redirectTo: string;
  requiresVerification: boolean;
  providers: OAuthProvider[];
  captchaSiteKey?: string;
}) {
  const t = useTranslations("Auth.signup");
  const tc = useTranslations("Auth.common");
  const router = useRouter();
  const [status, setStatus] = useState<{ kind: "idle" } | { kind: "error"; message: string }>({
    kind: "idle",
  });
  // CAPTCHA (A12): token the widget produces, sent in the x-captcha-response header. Only
  // relevant when captchaSiteKey is set; unset → no widget, no header, submit ungated.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<CaptchaWidgetHandle>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resend, setResend] = useState<
    { kind: "idle" } | { kind: "pending" } | { kind: "sent" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(values: SignUpInput) {
    setStatus({ kind: "idle" });
    // callbackURL rides inside the emailed link, so clicking it lands on the
    // post-login target (autoSignInAfterVerification means the user arrives signed
    // in) instead of Better Auth's default "/".
    const { error } = await signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
      callbackURL: redirectTo,
      // Attach the Turnstile token only when captcha is active; the server captcha()
      // plugin reads it from this header and verifies it before the sign-up proceeds.
      ...(captchaToken
        ? { fetchOptions: { headers: { "x-captcha-response": captchaToken } } }
        : {}),
    });
    if (error) {
      setStatus({ kind: "error", message: error.message ?? t("error") });
      // Turnstile tokens are single-use — mint a fresh one for the next attempt.
      captchaRef.current?.reset();
      return;
    }
    if (requiresVerification) {
      setSentTo(values.email);
      form.reset();
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  // /send-verification-email is email-keyed, which matters here: with verification
  // required the user CANNOT have a session yet, so a session-bound endpoint would
  // never work from this state. The server caps it at 3/min (auth.ts customRules);
  // over-limit surfaces as the inline error below — no client-side throttle needed.
  async function onResend(email: string) {
    setResend({ kind: "pending" });
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: redirectTo,
    });
    if (error) {
      setResend({ kind: "error", message: error.message ?? t("resendError") });
      return;
    }
    setResend({ kind: "sent" });
    window.setTimeout(() => {
      setResend((current) => (current.kind === "sent" ? { kind: "idle" } : current));
    }, 4000);
  }

  if (sentTo) {
    return (
      <AuthCard
        title={t("sentTitle")}
        description={t("sentDescription", { email: sentTo })}
        footer={
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            {tc("backToSignIn")}
          </Link>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t("sentHint")}</p>
          {resend.kind === "error" ? (
            <p className="text-sm text-destructive" role="alert">
              {resend.message}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => onResend(sentTo)}
            disabled={resend.kind === "pending"}
          >
            {resend.kind === "pending"
              ? t("resending")
              : resend.kind === "sent"
                ? t("resent")
                : t("resend")}
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("title")}
      description={t("description")}
      footer={
        <span>
          {t("haveAccount")}{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            {t("signInLink")}
          </Link>
        </span>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("name")}</FormLabel>
                <FormControl>
                  <Input autoComplete="name" placeholder={t("namePlaceholder")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tc("password")}</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {captchaSiteKey ? (
            <CaptchaWidget ref={captchaRef} siteKey={captchaSiteKey} onToken={setCaptchaToken} />
          ) : null}
          {status.kind === "error" ? (
            <p className="text-sm text-destructive" role="alert">
              {status.message}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={form.formState.isSubmitting || (Boolean(captchaSiteKey) && !captchaToken)}
          >
            {form.formState.isSubmitting ? t("submitting") : t("submit")}
          </Button>
        </form>
      </Form>
      <SocialSignIn providers={providers} redirectTo={redirectTo} />
    </AuthCard>
  );
}
