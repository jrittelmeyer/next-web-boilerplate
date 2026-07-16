"use client";

import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import * as Sentry from "@sentry/nextjs";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Link } from "@/i18n/navigation";

// Route-segment error boundary. Server-thrown render errors are already captured
// by Sentry via instrumentation.ts (onRequestError); client render errors are not,
// so we report them here. No-op without NEXT_PUBLIC_SENTRY_DSN (SDK is disabled).
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Error");
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main>
      <EmptyState
        title={t("title")}
        description={t("description")}
        action={
          <>
            <Button type="button" onClick={reset}>
              {t("tryAgain")}
            </Button>
            <Button asChild variant="outline">
              <Link href="/">{t("goHome")}</Link>
            </Button>
          </>
        }
      />
    </main>
  );
}
