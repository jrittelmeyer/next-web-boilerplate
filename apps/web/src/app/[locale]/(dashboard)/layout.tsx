import { auth } from "@repo/auth";
import { ThemeToggle } from "@repo/ui/components/theme-toggle";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";
import { UserMenu } from "@/components/dashboard/user-menu";
import { LanguageSwitcher } from "@/components/language-switcher";
import { OrgSwitcher } from "@/components/organization/org-switcher";
import { Link } from "@/i18n/navigation";
import { getUserRole } from "@/lib/rbac";
import { siteConfig } from "@/lib/site";

// The protected app shell. The proxy does an optimistic cookie-only gate at the
// edge; THIS is the authoritative check — it resolves the real session (DB-backed)
// and redirects to /login if absent. Reading the session makes the group dynamic.
// The route group `(dashboard)` is a layout boundary only and is absent from the
// URL (the page renders at /dashboard, which the proxy matcher targets).
export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  // Show the Admin link only to admins — an authoritative, fresh DB role read (the
  // same source /admin's own requireAdmin() trusts), so a demotion hides the link on
  // the next request. Non-admins never see it; with no admin promoted, no one does.
  const role = await getUserRole(session.user.id);
  const t = await getTranslations("Dashboard.nav");

  // Admin plugin (Tier 4 · Band 4). `impersonatedBy` is set by the plugin only on an
  // impersonation session (an admin acting as this user). When present, surface an app-wide
  // banner with the exit — session.user is the impersonated (target) user here.
  const impersonatedBy = session.session.impersonatedBy;

  return (
    <div className="flex min-h-screen flex-col">
      {impersonatedBy ? <ImpersonationBanner email={session.user.email} /> : null}
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="font-semibold tracking-tight">
              {siteConfig.name}
            </Link>
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
              {t("dashboard")}
            </Link>
            <Link href="/posts" className="text-muted-foreground hover:text-foreground">
              {t("posts")}
            </Link>
            <Link href="/notifications" className="text-muted-foreground hover:text-foreground">
              {t("notifications")}
            </Link>
            {role === "admin" ? (
              <Link href="/admin" className="text-muted-foreground hover:text-foreground">
                {t("admin")}
              </Link>
            ) : null}
          </nav>
          <div className="flex items-center gap-2">
            <OrgSwitcher />
            <LanguageSwitcher />
            <ThemeToggle />
            <UserMenu
              name={session.user.name}
              email={session.user.email}
              image={session.user.image ?? null}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
