"use client";

import { signIn } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { OAuthProvider } from "@/lib/auth-providers";

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  github: "GitHub",
  google: "Google",
};

// Social sign-in. Rendered with ONLY the providers configured server-side
// (lib/auth-providers), so there are never dead buttons. `signIn.social` performs a
// top-level navigation to the provider — the same redirect class as Stripe hosted
// checkout, so it needs NO CSP allowlist entry. `callbackURL` returns the user to the
// (already-sanitized) post-login target on success.
export function SocialSignIn({
  providers,
  redirectTo,
}: {
  providers: OAuthProvider[];
  redirectTo: string;
}) {
  const t = useTranslations("Auth.social");
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (providers.length === 0) return null;

  async function continueWith(provider: OAuthProvider) {
    setError(null);
    setPending(provider);
    const { error: socialError } = await signIn.social({ provider, callbackURL: redirectTo });
    // On success the browser navigates away to the provider — nothing to reset. Only
    // a failure to *start* the flow lands here, so surface it and re-enable the buttons.
    if (socialError) {
      setError(socialError.message ?? t("error"));
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>{t("divider")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex flex-col gap-2">
        {providers.map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending !== null}
            onClick={() => continueWith(provider)}
          >
            <ProviderIcon provider={provider} />
            {pending === provider ? t("redirecting") : PROVIDER_LABELS[provider]}
          </Button>
        ))}
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// lucide-react dropped brand glyphs, so inline minimal brand marks (the
// shadcn-documented pattern for social buttons) — keeps this dependency-free.
function ProviderIcon({ provider }: { provider: OAuthProvider }) {
  if (provider === "github") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current">
        <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.05-.02-2.06-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.23 0 4.63-2.81 5.65-5.49 5.95.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.29 0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.76-2.11-6.7-4.94H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.31a7.2 7.2 0 0 1 0-4.62V6.6H1.29a12 12 0 0 0 0 10.8l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.74c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.6l4.01 3.09C6.24 6.85 8.88 4.74 12 4.74Z"
      />
    </svg>
  );
}
