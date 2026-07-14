import { auth } from "@repo/auth";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Lock, Sparkles } from "lucide-react";
import { headers } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { hasActiveSubscription } from "@/lib/subscription";

// Public scaffold/demo route (like /billing) — the worked subscription-gating
// example (A2). It reads entitlement from the LOCAL `subscriptions` table via
// `hasActiveSubscription` (no Stripe call, works without Stripe creds) and
// renders one of three states. This is the copy-me pattern for gating any
// premium surface on a paid subscription; delete it when a real one lands.
// See docs/context/SERVICES.md (Stripe) + DATABASE.md.
export default async function PremiumPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({ headers: await headers() });
  const entitled = session ? await hasActiveSubscription(session.user.id) : false;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      {!session ? (
        // State 1 — signed out: nothing to gate on yet, prompt sign-in.
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-5" aria-hidden /> Premium content
            </CardTitle>
            <CardDescription>Sign in to see whether your plan unlocks this.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/login?redirectTo=/premium">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      ) : entitled ? (
        // State 2 — entitled: the unlocked premium content.
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" aria-hidden /> Pro content unlocked
            </CardTitle>
            <CardDescription>
              You have an active subscription, so this premium section is available.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Swap this for the real gated feature. The gate is a single call —
            <code className="mx-1 rounded bg-muted px-1 py-0.5">hasActiveSubscription(userId)</code>
            — so any Server Component, Server Action, or tRPC procedure can reuse it.
          </CardContent>
        </Card>
      ) : (
        // State 3 — signed in, no entitling subscription: locked, route to /billing.
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-5" aria-hidden /> This content is for subscribers
            </CardTitle>
            <CardDescription>
              Your account has no active subscription. Subscribe to unlock premium content.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/billing">View plans</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
