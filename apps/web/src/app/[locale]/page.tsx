import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { ThemeToggle } from "@repo/ui/components/theme-toggle";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/i18n/routing";
import { localizedAlternates } from "@/lib/i18n-metadata";

// The landing page has no title of its own (it uses the layout's brand default),
// but it IS the primary indexable public page, so it carries the hreflang
// alternates. metadataBase (root layout) resolves the relative pathnames.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: localizedAlternates({ locale, href: "/" }) };
}

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  // setRequestLocale opts this page into static rendering for the locale (pages
  // render in parallel with the layout, so both must call it). getTranslations is
  // the async, Server-Component-safe reader.
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Landing");

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-bold tracking-tight">next-web-boilerplate</h1>
        <p className="text-lg font-medium">{t("heading")}</p>
        <p className="text-muted-foreground">{t("tagline")}</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("cardTitle")}</CardTitle>
          <CardDescription>{t("cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input id="email" type="email" placeholder={t("emailPlaceholder")} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
