"use client";

import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";

// Catches errors thrown by the root layout itself — it replaces the entire
// document, so it must ship its own <html>/<body>. This is the Sentry-recommended
// home for client render-error capture. No-op without a DSN.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <EmptyState
          title="Something went wrong"
          description="The application failed to load. Please reload the page."
          action={
            <Button type="button" onClick={() => window.location.reload()}>
              Reload
            </Button>
          }
        />
      </body>
    </html>
  );
}
