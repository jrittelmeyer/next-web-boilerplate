import { ThemeToggle } from "@repo/ui/components/theme-toggle";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Link } from "@/i18n/navigation";
import { siteConfig } from "@/lib/site";

// Shared chrome for the (auth) route group — a centered, nav-free shell so the
// login/signup/forgot/reset cards render the same way. The route group `(auth)`
// is a layout boundary only; it does not appear in the URL (pages render at
// /login, /signup, …). Signed-in users are bounced away from /login and /signup
// by the proxy before this renders.
export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <Link href="/" className="text-lg font-semibold tracking-tight">
        {siteConfig.name}
      </Link>
      {children}
    </main>
  );
}
