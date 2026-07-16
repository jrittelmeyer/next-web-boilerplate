import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { UiStoreDemo } from "@/components/demo/ui-store-demo";

// Public scaffold/demo route (like /billing, /uploads). Two independent components read
// the same Zustand store, so toggling one updates both — proof it's global
// client state, not local useState. Server state would live in TanStack Query
// instead; see docs/context/STATE.md.
export default function StatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("StateDemo");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {t.rich("description", {
              code: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <UiStoreDemo label={t("componentA")} />
          <UiStoreDemo label={t("componentB")} />
        </CardContent>
      </Card>
    </main>
  );
}
