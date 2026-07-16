import { auth } from "@repo/auth";
import { db } from "@repo/db";
import { account, session as sessionTable } from "@repo/db/schema";
import { isEmailConfigured } from "@repo/email";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { and, desc, eq, gt } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AvatarCard } from "@/components/account/avatar-card";
import { ChangeEmailForm } from "@/components/account/change-email-form";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { DeleteAccountCard } from "@/components/account/delete-account-card";
import { PasskeysCard } from "@/components/account/passkeys-card";
import { PrivacyCard } from "@/components/account/privacy-card";
import { SessionsCard } from "@/components/account/sessions-card";
import { TwoFactorCard } from "@/components/account/two-factor-card";
import { UpdateNameForm } from "@/components/account/update-name-form";
import type { Locale } from "@/i18n/routing";
import { describeUserAgent } from "@/lib/user-agent";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("account") };
}

// Real account/settings surface (M3), inside the (dashboard) shell. The layout is
// the authoritative gate; we re-read the session here too (cheap under the Step-19
// cookie cache) for defense-in-depth and to render the user's details.
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Account.page");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  // Show the password card only when the user actually has an email/password
  // credential. OAuth-only users have no password to change — `changePassword`
  // would error — so they get a pointer to the reset flow (which sets one) instead.
  const credential = await db.query.account.findFirst({
    columns: { id: true },
    where: and(eq(account.userId, session.user.id), eq(account.providerId, "credential")),
  });
  const hasPassword = credential !== undefined;

  // Active sessions (P2-1), read straight off the session table. Deliberately NOT
  // auth.api.listSessions: that endpoint requires a "fresh" session (created within
  // session.freshAge, default 24h) and 403s for anyone signed in longer — a direct
  // read keeps the card working without loosening freshAge globally (we own the auth
  // schema; the credential lookup above sets the precedent). Revocation still goes
  // through Better Auth (ownership-checked, cookie-cache-proof) via the client card.
  // Tokens are the revocation credential, so the current session's token is nulled
  // before crossing to the client; the others must ship (revokeSession takes a token
  // — the same shape authClient.listSessions itself returns).
  const currentToken = session.session.token;
  const sessionRows = await db.query.session.findMany({
    columns: {
      id: true,
      token: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      updatedAt: true,
    },
    where: and(eq(sessionTable.userId, session.user.id), gt(sessionTable.expiresAt, new Date())),
    orderBy: [desc(sessionTable.updatedAt)],
  });
  const sessions = sessionRows
    .map((row) => ({
      id: row.id,
      token: row.token === currentToken ? null : row.token,
      device: describeUserAgent(row.userAgent),
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isCurrent: row.token === currentToken,
    }))
    // Current session first; the rest keep their most-recently-active order.
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));

  // Passkeys (Tier 4 · Band 3), SSR-seeded like the sessions list above — a direct read of
  // the user's own rows, newest first. Only the display columns cross to the client; the
  // publicKey / credentialID (verification material) never leave the server.
  const passkeys = await db.query.passkey.findMany({
    columns: { id: true, name: true, createdAt: true, deviceType: true, backedUp: true },
    where: (row, { eq }) => eq(row.userId, session.user.id),
    orderBy: (row, { desc }) => [desc(row.createdAt)],
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("profileTitle")}</CardTitle>
          <CardDescription>{t("profileDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AvatarCard
            image={session.user.image ?? null}
            name={session.user.name}
            email={session.user.email}
          />
          <UpdateNameForm defaultName={session.user.name} />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              {t("emailLabel")}
              <span className="ml-2 font-normal text-muted-foreground">
                {session.user.email}
                {session.user.emailVerified ? t("verified") : t("unverified")}
              </span>
            </span>
            <ChangeEmailForm emailVerified={session.user.emailVerified} />
            <span className="text-xs text-muted-foreground">
              {session.user.emailVerified ? t("verifiedHint") : t("unverifiedHint")}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("passwordTitle")}</CardTitle>
          <CardDescription>
            {hasPassword ? t("passwordDescription") : t("passwordDescriptionSocial")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasPassword ? (
            <ChangePasswordForm />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t.rich("passwordResetPointer", {
                link: (chunks) => (
                  <a
                    href="/forgot-password"
                    className="text-foreground underline underline-offset-4"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
          )}
        </CardContent>
      </Card>

      <TwoFactorCard enabled={session.user.twoFactorEnabled ?? false} hasPassword={hasPassword} />

      <PasskeysCard initialPasskeys={passkeys} />

      <SessionsCard sessions={sessions} />

      {/* Privacy & data (B3 · Band 3): analytics consent (withdrawable) + data export.
          Client component — self-gates on NEXT_PUBLIC_POSTHOG_KEY for the analytics part. */}
      <PrivacyCard />

      {/* Danger zone (P2-2). `hasPassword` picks the intent gate (password vs
          type-to-confirm); `emailConfigured` only shapes the up-front copy — the
          card branches its post-submit behavior on the server's response. */}
      <DeleteAccountCard hasPassword={hasPassword} emailConfigured={isEmailConfigured()} />
    </div>
  );
}
