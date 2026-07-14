"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { authClient, signIn } from "@repo/auth/client";
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
import {
  type SignInInput,
  signInSchema,
  twoFactorBackupCodeSchema,
  twoFactorCodeSchema,
} from "@repo/validators";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "@/i18n/navigation";
import type { OAuthProvider } from "@/lib/auth-providers";
import { AuthCard } from "./auth-card";
import { CaptchaWidget, type CaptchaWidgetHandle } from "./captcha-widget";
import { SocialSignIn } from "./social-sign-in";

// Email/password sign-in. Better Auth's client returns `{ data, error }` (it does
// not throw), so we surface `error.message` inline. On success the session cookie is
// set by the /api/auth response; we navigate to the post-login target (sanitized by
// the page) and refresh so Server Components re-read the now-authenticated session.
//
// Two-factor (Tier 4 · Band 2): when the account has 2FA on, `signIn.email` does NOT
// establish a session — it returns `{ data: { twoFactorRedirect: true } }` and Better
// Auth sets a short-lived challenge cookie. We handle that inline (like the signup
// form's inline states) rather than via twoFactorClient()'s global redirect, so the
// whole flow stays on one page. The challenge is its own component so its RHF-controlled
// input mounts cleanly instead of being reused across the two forms (see the note on
// `ChallengeCodeForm` below).
export function LoginForm({
  redirectTo,
  providers,
  captchaSiteKey,
}: {
  redirectTo: string;
  providers: OAuthProvider[];
  captchaSiteKey?: string;
}) {
  const t = useTranslations("Auth.login");
  const tc = useTranslations("Auth.common");
  const router = useRouter();
  const [challenge, setChallenge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // CAPTCHA (A12): token for the x-captcha-response header on the initial /sign-in/email
  // call. The 2FA challenge and passkey sign-in are not captcha-protected endpoints.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<CaptchaWidgetHandle>(null);
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInInput) {
    setError(null);
    const { data, error: signInError } = await signIn.email({
      email: values.email,
      password: values.password,
      ...(captchaToken
        ? { fetchOptions: { headers: { "x-captcha-response": captchaToken } } }
        : {}),
    });
    if (signInError) {
      setError(signInError.message ?? t("error"));
      // Single-use token — reset for the next attempt.
      captchaRef.current?.reset();
      return;
    }
    // 2FA gate: no session yet, just a challenge flag. Reveal the code step instead of
    // navigating (the `in` guard also confirms the plugin's redirect shape at build time).
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setChallenge(true);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  if (challenge) {
    return <TwoFactorChallenge redirectTo={redirectTo} onCancel={() => setChallenge(false)} />;
  }

  return (
    <AuthCard
      title={t("title")}
      description={t("description")}
      footer={
        <span>
          {t("noAccount")}{" "}
          <Link href="/signup" className="text-foreground underline-offset-4 hover:underline">
            {t("signUpLink")}
          </Link>
        </span>
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
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>{tc("password")}</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                  >
                    {t("forgotPassword")}
                  </Link>
                </div>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {captchaSiteKey ? (
            <CaptchaWidget ref={captchaRef} siteKey={captchaSiteKey} onToken={setCaptchaToken} />
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
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
      <PasskeySignIn redirectTo={redirectTo} />
    </AuthCard>
  );
}

// Passkey sign-in (Tier 4 · Band 3). Passkeys are discoverable/resident credentials, so
// `signIn.passkey()` takes NO email — the browser WebAuthn get() prompt lets the user pick a
// credential and, on success, Better Auth's verify-authentication establishes the session
// (data: { session, user }). We then navigate + refresh like the email path. A cancelled or
// timed-out prompt surfaces as error code "AUTH_CANCELLED" — a normal user action, so we
// swallow it rather than showing an error. This is an explicit button; the conditional-UI /
// autofill upgrade is a one-liner (call `signIn.passkey({ autoFill: true })` on mount and add
// autocomplete="webauthn" to the email field) once desired.
function PasskeySignIn({ redirectTo }: { redirectTo: string }) {
  const t = useTranslations("Auth.passkey");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Feature-detect WebAuthn so the button only shows where it can work (mirrors the /account
  // Passkeys card). Default shown so SSR and the first client render agree (no hydration
  // mismatch); the effect narrows it on unsupported browsers.
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(typeof window !== "undefined" && typeof window.PublicKeyCredential === "function");
  }, []);

  async function onPasskeySignIn() {
    setError(null);
    setPending(true);
    const { error: signInError } = await signIn.passkey();
    setPending(false);
    if (signInError) {
      // The error union only carries a `code` on some variants; narrow before reading it.
      const code = "code" in signInError ? signInError.code : undefined;
      if (code !== "AUTH_CANCELLED") {
        setError(signInError.message ?? t("error"));
      }
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  if (!supported) return null;

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={() => void onPasskeySignIn()}
      >
        {pending ? t("waiting") : t("signIn")}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// The 2FA sign-in challenge (rendered only after `signIn.email` reports twoFactorRedirect).
// `verifyTotp` / `verifyBackupCode` consume the challenge cookie Better Auth set on the
// sign-in attempt; only on success do we land the user. "Trust this device" opts into a
// 30-day cookie that skips the challenge here next time (unchecked by default), and lives
// on this parent so it survives the TOTP↔backup swap.
function TwoFactorChallenge({
  redirectTo,
  onCancel,
}: {
  redirectTo: string;
  onCancel: () => void;
}) {
  const t = useTranslations("Auth.twoFactor");
  const tc = useTranslations("Auth.common");
  const router = useRouter();
  const [usingBackup, setUsingBackup] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function complete() {
    router.push(redirectTo);
    router.refresh();
  }

  async function onVerifyTotp(code: string) {
    setError(null);
    const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code, trustDevice });
    if (verifyError) {
      setError(verifyError.message ?? t("errorTotp"));
      return;
    }
    complete();
  }

  async function onVerifyBackup(code: string) {
    setError(null);
    const { error: verifyError } = await authClient.twoFactor.verifyBackupCode({
      code,
      trustDevice,
    });
    if (verifyError) {
      setError(verifyError.message ?? t("errorBackup"));
      return;
    }
    complete();
  }

  function switchTo(backup: boolean) {
    setError(null);
    setUsingBackup(backup);
  }

  return (
    <AuthCard
      title={t("title")}
      description={usingBackup ? t("descriptionBackup") : t("descriptionTotp")}
      footer={
        <button
          type="button"
          onClick={onCancel}
          className="text-foreground underline-offset-4 hover:underline"
        >
          {tc("backToSignIn")}
        </button>
      }
    >
      {/* The `key` is load-bearing: TOTP and backup render the same component shape, so
          without a distinct key React reuses the <Input> DOM node across the swap and the
          newly-shown form's controlled binding breaks (the field won't accept input). A
          per-variant key forces a clean remount + fresh useForm. */}
      {usingBackup ? (
        <ChallengeCodeForm
          key="backup"
          variant="backup"
          trustDevice={trustDevice}
          onTrustDeviceChange={setTrustDevice}
          error={error}
          onSubmit={onVerifyBackup}
          onSwitch={() => switchTo(false)}
        />
      ) : (
        <ChallengeCodeForm
          key="totp"
          variant="totp"
          trustDevice={trustDevice}
          onTrustDeviceChange={setTrustDevice}
          error={error}
          onSubmit={onVerifyTotp}
          onSwitch={() => switchTo(true)}
        />
      )}
    </AuthCard>
  );
}

// One code-entry form, specialized by `variant`: TOTP (6-digit, numeric) validated by
// `twoFactorCodeSchema`, or a recovery `backup` code validated by `twoFactorBackupCodeSchema`.
// Rendered with a per-variant `key` by the parent so a swap remounts it (see note above).
function ChallengeCodeForm({
  variant,
  trustDevice,
  onTrustDeviceChange,
  error,
  onSubmit,
  onSwitch,
}: {
  variant: "totp" | "backup";
  trustDevice: boolean;
  onTrustDeviceChange: (next: boolean) => void;
  error: string | null;
  onSubmit: (code: string) => void | Promise<void>;
  onSwitch: () => void;
}) {
  const t = useTranslations("Auth.twoFactor");
  const isTotp = variant === "totp";
  const form = useForm<{ code: string }>({
    resolver: zodResolver(isTotp ? twoFactorCodeSchema : twoFactorBackupCodeSchema),
    defaultValues: { code: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onSubmit(values.code))}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isTotp ? t("verificationCode") : t("backupCode")}</FormLabel>
              <FormControl>
                <Input
                  autoComplete="one-time-code"
                  placeholder={isTotp ? t("totpPlaceholder") : t("backupPlaceholder")}
                  {...(isTotp ? { inputMode: "numeric" as const } : {})}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <TrustDeviceCheckbox checked={trustDevice} onChange={onTrustDeviceChange} />
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t("verifying") : t("verify")}
        </Button>
        <button
          type="button"
          onClick={onSwitch}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {isTotp ? t("useBackup") : t("useAuthenticator")}
        </button>
      </form>
    </Form>
  );
}

// Plain styled checkbox (no @repo/ui Checkbox primitive exists, and adding one just for
// this would drop the package's coverage floor). Local state, not RHF — it's a request
// option, not a validated field.
function TrustDeviceCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations("Auth.twoFactor");
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        className="size-4 rounded border-input accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {t("trustDevice")}
    </label>
  );
}
