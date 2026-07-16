import { auth } from "@repo/auth";
import { db } from "@repo/db";
import { invitation, organization } from "@repo/db/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AcceptInvitationClient } from "@/components/organization/accept-invitation-client";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("acceptInvitation") };
}

// Public invitation-accept surface (Tier 4 · Band 4), rendered at /accept-invitation/[id]
// (config.ts's invitationAcceptUrl points here). It lives in the (auth) group to reuse the
// centered, nav-free shell and must work signed-out — so it is NOT under the (dashboard)
// gate or the proxy matcher. The invitation is read straight from the DB for display
// context (the account-page pattern; anyone with the link already holds the capability,
// like the email-verification link). The actual accept — which requires being signed in as
// the invited address — happens in the client island; Better Auth enforces that server-side.
export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Organization.acceptPage");
  const session = await auth.api.getSession({ headers: await headers() });

  const invite = await db.query.invitation.findFirst({
    where: eq(invitation.id, id),
    columns: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      organizationId: true,
    },
  });
  const org = invite
    ? await db.query.organization.findFirst({
        where: eq(organization.id, invite.organizationId),
        columns: { name: true },
      })
    : null;

  const invalid = !invite || !org;
  const expired = invite ? invite.expiresAt.getTime() < Date.now() : false;
  const notPending = invite ? invite.status !== "pending" : false;

  let body: { title: string; description: string; children?: React.ReactNode };
  if (invalid) {
    body = {
      title: t("invalidTitle"),
      description: t("invalidDescription"),
    };
  } else if (notPending) {
    body = {
      title: t("usedTitle"),
      description: t("usedDescription", { status: invite.status }),
    };
  } else if (expired) {
    body = {
      title: t("expiredTitle"),
      description: t("expiredDescription"),
    };
  } else {
    body = {
      title: t("joinTitle", { org: org.name }),
      description: t("joinDescription", { org: org.name, role: invite.role ?? "member" }),
      children: (
        <AcceptInvitationClient
          invitationId={invite.id}
          organizationId={invite.organizationId}
          invitedEmail={invite.email}
          orgName={org.name}
          signedInEmail={session?.user.email ?? null}
        />
      ),
    };
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{body.title}</CardTitle>
        <CardDescription>{body.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {body.children ?? (
          <Link href="/dashboard" className="text-sm text-foreground underline underline-offset-4">
            {t("goToDashboard")}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
