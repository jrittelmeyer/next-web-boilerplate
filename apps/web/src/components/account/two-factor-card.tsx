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
import {
  type TwoFactorCodeInput,
  type TwoFactorPasswordInput,
  twoFactorCodeSchema,
  twoFactorPasswordSchema,
} from "@repo/validators";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "@/i18n/navigation";

/**
 * Two-factor auth (Tier 4 · Band 2) on the /account page. All mutations go through the
 * Better Auth client (the C1 convention — re-validated server-side, `{ data, error }`,
 * no throw, no new CSP origin). Enrollment is a two-stage flow:
 *
 *   enable({ password })  → returns { totpURI, backupCodes } but does NOT yet activate
 *                           (the two_factor row is `verified: false`; user.twoFactorEnabled
 *                           stays false), so abandoning setup leaves the user un-enrolled
 *   verifyTotp({ code })  → the FIRST valid code flips user.twoFactorEnabled = true and marks
 *                           the row verified — this is what actually turns 2FA on.
 *
 * The UI is an INLINE two-stage reveal (like the Delete-account and email/password cards on
 * this page), not a modal — @repo/ui's Dialog centering misbehaves for tall content and the
 * page's other cards are all inline forms. The QR is rendered as an inline SVG
 * (`qrcode.react`) so it adds no CSP origin and no network request. Enable / disable /
 * regenerate are password-gated, so the whole card is shown only to users who HAVE a
 * password (OAuth-only users get a pointer, mirroring the Password card). The
 * enabled/disabled badge is driven by OPTIMISTIC local state — never gated on
 * router.refresh() committing (Next 16.2.9 race, see AUTH.md); refresh is a background
 * reconcile so the next server render agrees.
 */

type Mode = "idle" | "enrollPassword" | "enrollVerify" | "disable" | "regenerate";
type EnrollData = { totpURI: string; backupCodes: string[] };

// The `otpauth://…?secret=BASE32` URI carries the shared secret; surface it for manual
// entry (authenticator apps that can't scan). A regex avoids depending on URL parsing of
// the non-special `otpauth:` scheme.
function manualKeyFromTotpUri(totpURI: string): string {
  return /[?&]secret=([^&]+)/i.exec(totpURI)?.[1] ?? "";
}

export function TwoFactorCard({
  enabled,
  hasPassword,
}: {
  enabled: boolean;
  hasPassword: boolean;
}) {
  const t = useTranslations("Account.twoFactor");
  const router = useRouter();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [mode, setMode] = useState<Mode>("idle");
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [regenCodes, setRegenCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const passwordForm = useForm<TwoFactorPasswordInput>({
    resolver: zodResolver(twoFactorPasswordSchema),
    defaultValues: { password: "" },
  });
  const codeForm = useForm<TwoFactorCodeInput>({
    resolver: zodResolver(twoFactorCodeSchema),
    defaultValues: { code: "" },
  });

  function toIdle() {
    setMode("idle");
    setError(null);
    setEnrollData(null);
    setRegenCodes(null);
    passwordForm.reset({ password: "" });
    codeForm.reset({ code: "" });
  }

  function start(next: Mode) {
    setError(null);
    setEnrollData(null);
    setRegenCodes(null);
    passwordForm.reset({ password: "" });
    codeForm.reset({ code: "" });
    setMode(next);
  }

  // Enroll stage 1: confirm password → fetch the secret + backup codes, advance to verify.
  async function onEnrollPassword(values: TwoFactorPasswordInput) {
    setError(null);
    const { data, error: enableError } = await authClient.twoFactor.enable({
      password: values.password,
    });
    if (enableError || !data) {
      setError(enableError?.message ?? t("errorStart"));
      return;
    }
    setEnrollData({ totpURI: data.totpURI, backupCodes: data.backupCodes });
    setMode("enrollVerify");
  }

  // Enroll stage 2: a valid code activates 2FA.
  async function onEnrollVerify(values: TwoFactorCodeInput) {
    setError(null);
    const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code: values.code });
    if (verifyError) {
      setError(verifyError.message ?? t("errorVerify"));
      return;
    }
    setIsEnabled(true);
    toIdle();
    router.refresh();
  }

  async function onDisable(values: TwoFactorPasswordInput) {
    setError(null);
    const { error: disableError } = await authClient.twoFactor.disable({
      password: values.password,
    });
    if (disableError) {
      setError(disableError.message ?? t("errorDisable"));
      return;
    }
    setIsEnabled(false);
    toIdle();
    router.refresh();
  }

  async function onRegenerate(values: TwoFactorPasswordInput) {
    setError(null);
    const { data, error: genError } = await authClient.twoFactor.generateBackupCodes({
      password: values.password,
    });
    if (genError || !data) {
      setError(genError?.message ?? t("errorRegenerate"));
      return;
    }
    setRegenCodes(data.backupCodes);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{hasPassword ? t("description") : t("descriptionSocial")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!hasPassword ? (
          <p className="text-sm text-muted-foreground">
            {t.rich("socialPointer", {
              link: (chunks) => (
                <a href="/forgot-password" className="text-foreground underline underline-offset-4">
                  {chunks}
                </a>
              ),
            })}
          </p>
        ) : !isEnabled ? (
          // ---- Disabled: enroll flow -------------------------------------------------
          mode === "idle" ? (
            <div>
              <Button type="button" onClick={() => start("enrollPassword")}>
                {t("enable")}
              </Button>
            </div>
          ) : mode === "enrollVerify" && enrollData ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t("scanHint")}</p>
              <div className="flex w-fit justify-center rounded-md border bg-white p-4">
                <QRCodeSVG value={enrollData.totpURI} size={180} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{t("manualKey")}</span>
                <code className="w-fit rounded bg-muted px-2 py-1 font-mono text-sm break-all">
                  {manualKeyFromTotpUri(enrollData.totpURI)}
                </code>
              </div>
              <BackupCodesPanel codes={enrollData.backupCodes} />
              <Form {...codeForm}>
                <form
                  onSubmit={codeForm.handleSubmit(onEnrollVerify)}
                  className="flex flex-col gap-4"
                  noValidate
                >
                  <FormField
                    control={codeForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem className="max-w-xs">
                        <FormLabel>{t("codeLabel")}</FormLabel>
                        <FormControl>
                          <Input
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder={t("codePlaceholder")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {error ? (
                    <p className="text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={codeForm.formState.isSubmitting}>
                      {codeForm.formState.isSubmitting ? t("verifying") : t("verifyAndEnable")}
                    </Button>
                    <Button type="button" variant="outline" onClick={toIdle}>
                      {t("cancel")}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          ) : (
            // mode === "enrollPassword"
            <PasswordForm
              form={passwordForm}
              label={t("confirmPassword")}
              description={t("startDescription")}
              submitLabel={t("continue")}
              pendingLabel={t("starting")}
              error={error}
              onSubmit={onEnrollPassword}
              onCancel={toIdle}
            />
          )
        ) : (
          // ---- Enabled: status + manage ---------------------------------------------
          <div className="flex flex-col gap-4">
            <p className="text-sm" role="status">
              <span className="font-medium text-foreground">{t("enabledLabel")}</span>{" "}
              <span className="text-muted-foreground">{t("enabledDescription")}</span>
            </p>
            {mode === "regenerate" ? (
              regenCodes ? (
                <div className="flex flex-col gap-4">
                  <BackupCodesPanel codes={regenCodes} />
                  <div>
                    <Button type="button" variant="outline" onClick={toIdle}>
                      {t("done")}
                    </Button>
                  </div>
                </div>
              ) : (
                <PasswordForm
                  form={passwordForm}
                  label={t("confirmPassword")}
                  description={t("regenerateDescription")}
                  submitLabel={t("generateCodes")}
                  pendingLabel={t("generating")}
                  error={error}
                  onSubmit={onRegenerate}
                  onCancel={toIdle}
                />
              )
            ) : mode === "disable" ? (
              <PasswordForm
                form={passwordForm}
                label={t("confirmPassword")}
                description={t("disableDescription")}
                submitLabel={t("disable")}
                pendingLabel={t("disabling")}
                destructive
                error={error}
                onSubmit={onDisable}
                onCancel={toIdle}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => start("regenerate")}>
                  {t("regenerate")}
                </Button>
                <Button type="button" variant="outline" onClick={() => start("disable")}>
                  {t("disable")}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// A reusable password-confirm form used by enroll-start, disable, and regenerate — each
// is a password-gated action, so a stolen session alone can't change 2FA state.
function PasswordForm({
  form,
  label,
  description,
  submitLabel,
  pendingLabel,
  destructive,
  error,
  onSubmit,
  onCancel,
}: {
  form: ReturnType<typeof useForm<TwoFactorPasswordInput>>;
  label: string;
  description: string;
  submitLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  error: string | null;
  onSubmit: (values: TwoFactorPasswordInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("Account.twoFactor");
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <p className="text-sm text-muted-foreground">{description}</p>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem className="max-w-xs">
              <FormLabel>{label}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button
            type="submit"
            variant={destructive ? "destructive" : "default"}
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? pendingLabel : submitLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={form.formState.isSubmitting}
            onClick={onCancel}
          >
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// Show recovery codes once, with a copy affordance. These are the only way back in if
// the authenticator is lost, so the copy makes it easy to stash them somewhere safe.
function BackupCodesPanel({ codes }: { codes: string[] }) {
  const t = useTranslations("Account.twoFactor");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      // Clipboard blocked (permissions / insecure context) — the codes are still on
      // screen for manual copy, so this is a non-fatal best-effort.
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-2 rounded-md border p-3">
      <span className="text-sm font-medium">{t("backupTitle")}</span>
      <p className="text-xs text-muted-foreground">{t("backupHint")}</p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? t("copied") : t("copyCodes")}
        </Button>
      </div>
    </div>
  );
}
